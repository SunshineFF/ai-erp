import { BadRequestException, Body, Controller, Delete, Get, Headers, Injectable, Param, Patch, Post, Req } from "@nestjs/common";
import { InventoryTransactionType, Prisma, ProductionType } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { InventoryPostingService } from "./posting";

type ProductionOutputInput = { materialId: string; plannedQty: number; unitId: string };
type CreateProductionBody = {
  outputMaterialId?: string;
  plannedQty?: number;
  unitId?: string;
  targetLocationId: string;
  plannedDate: string;
  productionType: ProductionType;
  remark?: string;
  lines?: ProductionOutputInput[];
};
type IssueLine = { productionMaterialId: string; batchId: string; locationId: string; quantity: number; differenceReason?: string };
type CompletionLine = { outputLineId: string; quantity: number; batchNo: string; productionDate: string; expiryDate: string; scrapQty?: number };

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService, private readonly posting: InventoryPostingService) {}

  list() {
    return this.prisma.productionOrder.findMany({ include: { materials: true, outputLines: true }, orderBy: { createdAt: "desc" } });
  }

  async create(body: CreateProductionBody) {
    const outputLines = body.lines?.length
      ? body.lines
      : body.outputMaterialId && body.plannedQty && body.unitId
        ? [{ materialId: body.outputMaterialId, plannedQty: body.plannedQty, unitId: body.unitId }]
        : [];
    if (!outputLines.length || outputLines.some((line) => line.plannedQty <= 0)) throw new BadRequestException("生产订单至少需要一行有效产出物料");
    const company = await this.prisma.company.findFirstOrThrow();
    const warehouse = await this.prisma.warehouse.findFirstOrThrow();
    const planned: { line: ProductionOutputInput; bom: any }[] = [];
    for (const line of outputLines) {
      const bom = await this.prisma.bom.findFirst({ where: { companyId: company.id, outputMaterialId: line.materialId, status: "EFFECTIVE" }, include: { items: true }, orderBy: { effectiveFrom: "desc" } });
      if (!bom) throw new BadRequestException(`物料 ${line.materialId} 没有生效 BOM`);
      planned.push({ line, bom });
    }
    const primary = planned[0];
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.create({ data: { documentNo: `MO-${Date.now()}`, companyId: company.id, warehouseId: warehouse.id, productionType: body.productionType, outputMaterialId: primary.line.materialId, bomId: primary.bom.id, bomVersionSnapshot: primary.bom.versionNo, plannedQty: primary.line.plannedQty, unitId: primary.line.unitId, plannedDate: new Date(body.plannedDate), targetLocationId: body.targetLocationId, remark: body.remark } });
      for (const [lineIndex, item] of planned.entries()) {
        const outputLine = await tx.productionOutputLine.create({ data: { productionOrderId: order.id, lineNo: lineIndex + 1, materialId: item.line.materialId, bomId: item.bom.id, bomVersionSnapshot: item.bom.versionNo, plannedQty: item.line.plannedQty, unitId: item.line.unitId } });
        const ratio = item.line.plannedQty / Number(item.bom.standardOutputQty);
        await tx.productionMaterial.createMany({ data: item.bom.items.map((bomItem: any, materialIndex: number) => ({ productionOrderId: order.id, productionOutputLineId: outputLine.id, lineNo: lineIndex * 1000 + materialIndex + 1, materialId: bomItem.inputMaterialId, requiredQty: Number(bomItem.requiredQty) * ratio, unitId: bomItem.unitId, lossRate: bomItem.lossRate })) });
      }
      return tx.productionOrder.findUniqueOrThrow({ where: { id: order.id }, include: { outputLines: true, materials: true } });
    });
  }

  release(id: string) { return this.prisma.productionOrder.update({ where: { id, status: "DRAFT" }, data: { status: "RELEASED" } }); }

  async issue(id: string, lines: IssueLine[], key: string | undefined, actorUserId?: string) {
    if (!key || !lines?.length) throw new BadRequestException("领料必须提供幂等键和批次明细");
    const order = await this.prisma.productionOrder.findFirstOrThrow({ where: { id, status: { in: ["RELEASED", "IN_PROGRESS"] } }, include: { materials: true } });
    return this.prisma.$transaction(async (tx) => {
      const posted = [];
      for (const [index, line] of lines.entries()) {
        if (line.quantity <= 0) throw new BadRequestException("领料数量必须大于零");
        const material = order.materials.find((item) => item.id === line.productionMaterialId);
        if (!material) throw new BadRequestException("生产用料行不存在");
        const expectedRemaining = Number(material.requiredQty) - Number(material.issuedQty) + Number(material.returnedQty);
        if (Math.abs(line.quantity - expectedRemaining) > 0.000001 && !line.differenceReason) throw new BadRequestException("超领或少领必须填写差异原因");
        const batch = await tx.inventoryBatch.findUniqueOrThrow({ where: { id: line.batchId } });
        const transaction = await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: order.companyId, warehouseId: order.warehouseId, locationId: line.locationId, materialId: material.materialId, batchId: batch.id, unitId: material.unitId, quantityDelta: -line.quantity, transactionType: InventoryTransactionType.PRODUCTION_ISSUE, sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, reasonCode: line.differenceReason, actorUserId });
        await tx.productionMaterial.update({ where: { id: material.id }, data: { issuedQty: { increment: line.quantity } } });
        posted.push(transaction);
      }
      await tx.productionOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });
      return posted;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async returnMaterial(id: string, lines: IssueLine[], key: string | undefined, actorUserId?: string) {
    if (!key || !lines?.length) throw new BadRequestException("退料必须提供幂等键和批次明细");
    const order = await this.prisma.productionOrder.findFirstOrThrow({ where: { id, status: "IN_PROGRESS" }, include: { materials: true } });
    return this.prisma.$transaction(async (tx) => {
      const posted = [];
      for (const [index, line] of lines.entries()) {
        const material = order.materials.find((item) => item.id === line.productionMaterialId);
        if (!material || line.quantity <= 0 || Number(material.returnedQty) + line.quantity > Number(material.issuedQty)) throw new BadRequestException("退料数量超过已领数量");
        const issue = await tx.inventoryTransaction.findFirst({ where: { sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, batchId: line.batchId, materialId: material.materialId, transactionType: "PRODUCTION_ISSUE" }, orderBy: { postedAt: "desc" } });
        if (!issue) throw new BadRequestException("找不到对应的领料记录");
        const transaction = await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: order.companyId, warehouseId: order.warehouseId, locationId: line.locationId, materialId: material.materialId, batchId: line.batchId, unitId: material.unitId, quantityDelta: line.quantity, unitCostCny: Number(issue.unitCostCny), transactionType: InventoryTransactionType.PRODUCTION_RETURN, sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, reasonCode: line.differenceReason, actorUserId });
        await tx.productionMaterial.update({ where: { id: material.id }, data: { returnedQty: { increment: line.quantity } } });
        posted.push(transaction);
      }
      return posted;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async complete(id: string, lines: CompletionLine[], key: string | undefined, actorUserId?: string) {
    if (!key || !lines?.length) throw new BadRequestException("完工入库必须提供幂等键和产出批次");
    const order = await this.prisma.productionOrder.findFirstOrThrow({ where: { id, status: "IN_PROGRESS" }, include: { materials: true, outputLines: true } });
    const totalOutput = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (totalOutput <= 0 || lines.some((line) => !line.batchNo || !line.productionDate || !line.expiryDate || new Date(line.expiryDate) <= new Date(line.productionDate))) throw new BadRequestException("完工数量、批次和效期无效");
    return this.prisma.$transaction(async (tx) => {
      const materialTransactions = await tx.inventoryTransaction.findMany({ where: { sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, transactionType: { in: ["PRODUCTION_ISSUE", "PRODUCTION_RETURN"] } } });
      const materialCost = -materialTransactions.reduce((sum, item) => sum + Number(item.amountDeltaCny), 0);
      if (materialCost < 0) throw new BadRequestException("生产材料成本异常");
      const outputUnitCost = totalOutput ? materialCost / totalOutput : 0;
      const outputBatches: { id: string; share: number }[] = [];
      for (const [index, line] of lines.entries()) {
        const output = order.outputLines.find((item) => item.id === line.outputLineId);
        if (!output || Number(output.completedQty) + line.quantity > Number(output.plannedQty) + 0.000001) throw new BadRequestException("完工数量超过计划数量");
        const batch = await tx.inventoryBatch.create({ data: { companyId: order.companyId, materialId: output.materialId, batchNo: line.batchNo, supplierBatchNo: order.documentNo, productionDate: new Date(line.productionDate), expiryDate: new Date(line.expiryDate), sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, supplierName: "自产", unitCostCny: outputUnitCost } });
        await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: order.companyId, warehouseId: order.warehouseId, locationId: order.targetLocationId, materialId: output.materialId, batchId: batch.id, unitId: output.unitId, quantityDelta: line.quantity, unitCostCny: outputUnitCost, transactionType: InventoryTransactionType.PRODUCTION_RECEIPT, sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, actorUserId });
        await tx.productionOutputLine.update({ where: { id: output.id }, data: { completedQty: { increment: line.quantity }, scrapQty: { increment: line.scrapQty ?? 0 } } });
        outputBatches.push({ id: batch.id, share: line.quantity / totalOutput });
      }
      const consumption = new Map<string, { materialId: string; quantity: number }>();
      for (const item of materialTransactions) {
        const current = consumption.get(item.batchId) ?? { materialId: item.materialId, quantity: 0 };
        current.quantity -= Number(item.quantityDelta);
        consumption.set(item.batchId, current);
      }
      for (const outputBatch of outputBatches) for (const [inputBatchId, consumed] of consumption) if (consumed.quantity > 0) await tx.batchGenealogy.upsert({ where: { productionOrderId_outputBatchId_inputBatchId_inputMaterialId: { productionOrderId: order.id, outputBatchId: outputBatch.id, inputBatchId, inputMaterialId: consumed.materialId } }, update: { consumedQty: consumed.quantity * outputBatch.share }, create: { companyId: order.companyId, productionOrderId: order.id, outputBatchId: outputBatch.id, inputBatchId, inputMaterialId: consumed.materialId, consumedQty: consumed.quantity * outputBatch.share } });
      const refreshed = await tx.productionOutputLine.findMany({ where: { productionOrderId: order.id } });
      const isComplete = refreshed.every((item) => Number(item.completedQty) >= Number(item.plannedQty));
      const completedQty = refreshed.reduce((sum, item) => sum + Number(item.completedQty), 0);
      const scrapQty = refreshed.reduce((sum, item) => sum + Number(item.scrapQty), 0);
      await tx.productionOrder.update({ where: { id: order.id }, data: { completedQty, scrapQty, status: isComplete ? "COMPLETED" : "IN_PROGRESS" } });
      if (isComplete && order.sourceSalesOrderId) await tx.salesOrder.update({ where: { id: order.sourceSalesOrderId }, data: { status: "READY" } });
      return tx.productionOrder.findUniqueOrThrow({ where: { id: order.id }, include: { outputLines: true, materials: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  close(id: string) { return this.prisma.productionOrder.update({ where: { id, status: "COMPLETED" }, data: { status: "CLOSED" } }); }

  async update(id: string, body: { plannedQty?: number; plannedDate?: string; remark?: string }) {
    const order = await this.prisma.productionOrder.findFirstOrThrow({ where: { id, status: "DRAFT" }, include: { outputLines: true } });
    if (order.outputLines.length > 1) throw new BadRequestException("多物料生产订单请从来源销售订单调整后重新生成");
    const bom = await this.prisma.bom.findUniqueOrThrow({ where: { id: order.bomId }, include: { items: true } });
    if (body.plannedQty !== undefined && body.plannedQty <= 0) throw new BadRequestException("计划数量必须大于零");
    const plannedQty = body.plannedQty ?? Number(order.plannedQty);
    const ratio = plannedQty / Number(bom.standardOutputQty);
    return this.prisma.$transaction(async (tx) => {
      if (body.plannedQty !== undefined && plannedQty !== Number(order.plannedQty)) {
        await tx.productionMaterial.deleteMany({ where: { productionOrderId: order.id } });
        if (order.outputLines[0]) await tx.productionOutputLine.update({ where: { id: order.outputLines[0].id }, data: { plannedQty } });
        await tx.productionMaterial.createMany({ data: bom.items.map((item, index) => ({ productionOrderId: order.id, productionOutputLineId: order.outputLines[0]?.id, lineNo: index + 1, materialId: item.inputMaterialId, requiredQty: Number(item.requiredQty) * ratio, unitId: item.unitId, lossRate: item.lossRate })) });
      }
      return tx.productionOrder.update({ where: { id: order.id }, data: { plannedQty: body.plannedQty, plannedDate: body.plannedDate ? new Date(body.plannedDate) : undefined, remark: body.remark }, include: { outputLines: true, materials: true } });
    });
  }

  async remove(id: string) { const order = await this.prisma.productionOrder.findFirstOrThrow({ where: { id, status: "DRAFT" } }); return this.prisma.productionOrder.delete({ where: { id: order.id } }); }
}

@Controller("production-orders")
export class ProductionController {
  constructor(private readonly service: ProductionService) {}
  @Get() @Permissions("production.view") list() { return this.service.list(); }
  @Post() @Permissions("production.manage") create(@Body() body: CreateProductionBody) { return this.service.create(body); }
  @Patch(":id/release") @Permissions("production.manage") release(@Param("id") id: string) { return this.service.release(id); }
  @Post(":id/issues") @Permissions("production.issue") issue(@Param("id") id: string, @Body() body: { lines: IssueLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.issue(id, body.lines, key, req.user?.sub); }
  @Post(":id/returns") @Permissions("production.issue") returnMaterial(@Param("id") id: string, @Body() body: { lines: IssueLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.returnMaterial(id, body.lines, key, req.user?.sub); }
  @Post(":id/completions") @Permissions("production.complete") complete(@Param("id") id: string, @Body() body: { lines: CompletionLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.complete(id, body.lines, key, req.user?.sub); }
  @Patch(":id/close") @Permissions("production.manage") close(@Param("id") id: string) { return this.service.close(id); }
  @Patch(":id") @Permissions("production.manage") update(@Param("id") id: string, @Body() body: any) { return this.service.update(id, body); }
  @Delete(":id") @Permissions("production.manage") remove(@Param("id") id: string) { return this.service.remove(id); }
}
