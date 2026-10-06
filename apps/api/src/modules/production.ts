import { BadRequestException, Body, Controller, Delete, Get, Headers, Injectable, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { InventoryTransactionType, Prisma, ProductionType, SalesOrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { InventoryPostingService } from "./posting";
import { PaginationQuery, pageResult, parsePagination, createdAtFilter } from "../pagination";
import { productionOrderText } from "../status-text";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

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
  salesOrderIds?: string[];
};
type IssueLine = { productionMaterialId: string; batchId: string; locationId: string; quantity: number; differenceReason?: string };
type CompletionLine = { outputLineId: string; quantity: number; batchNo: string; productionDate: string; expiryDate: string; scrapQty?: number };

// 可关联生产单的销售单状态：新建/已确认/生产中/备妥/部分出库均可；仅已出库（已生产结束）与已取消不可关联。
const LINKABLE_SALES_STATUSES: SalesOrderStatus[] = ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIALLY_SHIPPED"];

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService, private readonly posting: InventoryPostingService) {}

  async list(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const salesOrderIds = query.partnerId ? (await this.prisma.salesOrder.findMany({ where: { customerId: query.partnerId }, select: { id: true } })).map((item) => item.id) : undefined; const where: any = { ...(createdAtFilter(query) ? { createdAt: createdAtFilter(query) } : {}), ...(query.status ? { status: query.status } : {}), ...(salesOrderIds ? { sourceSalesOrderId: { in: salesOrderIds } } : {}) }; const [items, total] = await Promise.all([this.prisma.productionOrder.findMany({ where, include: { materials: true, outputLines: true, salesOrderLinks: { include: { salesOrder: { select: { id: true, documentNo: true, customerId: true } } } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.productionOrder.count({ where })]); return pageResult(items.map(productionOrderText), total, page, pageSize); }

  async create(body: CreateProductionBody) {
    const outputLines = body.lines?.length
      ? body.lines
      : body.outputMaterialId && body.plannedQty && body.unitId
        ? [{ materialId: body.outputMaterialId, plannedQty: body.plannedQty, unitId: body.unitId }]
        : [];
    if (!outputLines.length || outputLines.some((line) => line.plannedQty <= 0)) throw new BadRequestException("生产订单至少需要一行有效产出物料");
    const parent = await (this.prisma as any).material.findFirst({ where: { id: { in: outputLines.map((line) => line.materialId) }, parentMaterialId: null, variantEnabled: true }, select: { name: true } });
    if (parent) throw new BadRequestException(`多属性产品“${parent.name}”必须选择具体 SKU`);
    const company = await this.prisma.company.findFirstOrThrow();
    const warehouse = await this.prisma.warehouse.findFirstOrThrow();
    // 关联销售单：明细可自由调整（不强绑定），但每个产出物料的计划数量不得低于关联销售单明细的未完成数量。
    const salesOrderIds = [...new Set((body.salesOrderIds ?? []).map((id) => id?.trim()).filter(Boolean))];
    const linkedSalesOrders = salesOrderIds.length
      ? await this.prisma.salesOrder.findMany({ where: { id: { in: salesOrderIds }, status: { in: LINKABLE_SALES_STATUSES } }, include: { lines: true } })
      : [];
    if (linkedSalesOrders.length !== salesOrderIds.length) throw new BadRequestException("存在无效或已完结（已出库/已取消）的销售订单");
    const planned: { line: ProductionOutputInput; bom: any }[] = [];
    for (const line of outputLines) {
      let bom = await this.prisma.bom.findFirst({ where: { companyId: company.id, outputMaterialId: line.materialId, status: "EFFECTIVE" }, include: { items: true }, orderBy: { effectiveFrom: "desc" } });
      if (!bom) {
        // 产出物料为 SKU 且无专属 BOM 时，回退使用其产品族（多属性父物料）的生效 BOM。
        const sku = await this.prisma.material.findUnique({ where: { id: line.materialId }, select: { parentMaterialId: true } });
        if (sku?.parentMaterialId) bom = await this.prisma.bom.findFirst({ where: { companyId: company.id, outputMaterialId: sku.parentMaterialId, status: "EFFECTIVE" }, include: { items: true }, orderBy: { effectiveFrom: "desc" } });
      }
      if (!bom) throw new BadRequestException(`物料 ${line.materialId} 没有生效 BOM`);
      planned.push({ line, bom });
    }
    if (linkedSalesOrders.length) {
      const requiredByMaterial = new Map<string, number>();
      for (const order of linkedSalesOrders) for (const line of order.lines) requiredByMaterial.set(line.materialId, (requiredByMaterial.get(line.materialId) ?? 0) + Number(line.quantity) - Number(line.shippedQty));
      for (const [materialId, requiredQty] of requiredByMaterial) {
        if (requiredQty <= 0) continue;
        const plannedQty = outputLines.filter((line) => line.materialId === materialId).reduce((sum, line) => sum + line.plannedQty, 0);
        if (plannedQty + 0.000001 < requiredQty) throw new BadRequestException(`关联销售单要求物料 ${materialId} 未完成数量为 ${requiredQty}，生产计划数量 ${plannedQty} 不足`);
      }
    }
    const primary = planned[0];
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.create({ data: { documentNo: `MO-${Date.now()}`, companyId: company.id, warehouseId: warehouse.id, productionType: body.productionType, outputMaterialId: primary.line.materialId, bomId: primary.bom.id, bomVersionSnapshot: primary.bom.versionNo, plannedQty: primary.line.plannedQty, unitId: primary.line.unitId, plannedDate: new Date(body.plannedDate), targetLocationId: body.targetLocationId, remark: body.remark, ...(linkedSalesOrders.length ? { sourceSalesOrderId: linkedSalesOrders[0].id, sourceSalesOrderLineId: linkedSalesOrders[0].lines[0]?.id } : {}) } });
      if (linkedSalesOrders.length) await tx.productionOrderLink.createMany({ data: linkedSalesOrders.map((salesOrder) => ({ productionOrderId: order.id, salesOrderId: salesOrder.id })), skipDuplicates: true });
      for (const [lineIndex, item] of planned.entries()) {
        const outputLine = await tx.productionOutputLine.create({ data: { productionOrderId: order.id, lineNo: lineIndex + 1, materialId: item.line.materialId, bomId: item.bom.id, bomVersionSnapshot: item.bom.versionNo, plannedQty: item.line.plannedQty, unitId: item.line.unitId } });
        const ratio = item.line.plannedQty / Number(item.bom.standardOutputQty);
        await tx.productionMaterial.createMany({ data: item.bom.items.map((bomItem: any, materialIndex: number) => ({ productionOrderId: order.id, productionOutputLineId: outputLine.id, lineNo: lineIndex * 1000 + materialIndex + 1, materialId: bomItem.inputMaterialId, requiredQty: Number(bomItem.requiredQty) * ratio, unitId: bomItem.unitId, lossRate: bomItem.lossRate })) });
      }
      return productionOrderText(await tx.productionOrder.findUniqueOrThrow({ where: { id: order.id }, include: { outputLines: true, materials: true, salesOrderLinks: { include: { salesOrder: { select: { id: true, documentNo: true } } } } } }));
    });
  }

  release(id: string) { return this.prisma.productionOrder.update({ where: { id, status: "DRAFT" }, data: { status: "RELEASED" } }).then(productionOrderText); }

  // 供生产单创建表单：按所选销售单合并未完成明细（quantity - shippedQty），作为生产明细初始值。
  async salesOrderRequirements(salesOrderIds: string[]) {
    const ids = [...new Set((salesOrderIds ?? []).map((id) => id?.trim()).filter(Boolean))];
    if (!ids.length) return { orders: [], lines: [] };
    const orders = await this.prisma.salesOrder.findMany({ where: { id: { in: ids }, status: { in: LINKABLE_SALES_STATUSES } }, include: { lines: true, customer: { select: { name: true } } } });
    if (orders.length !== ids.length) throw new BadRequestException("存在无效或已完结（已出库/已取消）的销售订单");
    const merged = new Map<string, { materialId: string; quantity: number; unitId: string; salesOrderIds: string[] }>();
    for (const order of orders) for (const line of order.lines) {
      const remaining = Number(line.quantity) - Number(line.shippedQty);
      if (remaining <= 0) continue;
      const current = merged.get(line.materialId);
      if (current) { current.quantity += remaining; current.salesOrderIds.push(order.id); }
      else merged.set(line.materialId, { materialId: line.materialId, quantity: remaining, unitId: line.unitId, salesOrderIds: [order.id] });
    }
    return { orders: orders.map((order) => ({ id: order.id, documentNo: order.documentNo, customerName: order.customer?.name ?? "" })), lines: [...merged.values()] };
  }

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
    // 完工可同时申报报废数量：完工数量入库存、报废数量不入库；也允许纯报废提交（完工 0）用于收尾。
    const totalScrap = lines.reduce((sum, line) => sum + (line.scrapQty ?? 0), 0);
    if ((totalOutput <= 0 && totalScrap <= 0) || lines.some((line) => line.quantity < 0 || (line.scrapQty ?? 0) < 0 || (line.quantity > 0 && (!line.batchNo || !line.productionDate || !line.expiryDate || new Date(line.expiryDate) <= new Date(line.productionDate))))) throw new BadRequestException("完工数量、批次和效期无效");
    return this.prisma.$transaction(async (tx) => {
      const materialTransactions = await tx.inventoryTransaction.findMany({ where: { sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, transactionType: { in: ["PRODUCTION_ISSUE", "PRODUCTION_RETURN"] } } });
      const materialCost = -materialTransactions.reduce((sum, item) => sum + Number(item.amountDeltaCny), 0);
      if (materialCost < 0) throw new BadRequestException("生产材料成本异常");
      const outputUnitCost = totalOutput ? materialCost / totalOutput : 0;
      const outputBatches: { id: string; share: number }[] = [];
      for (const [index, line] of lines.entries()) {
        const output = order.outputLines.find((item) => item.id === line.outputLineId);
        if (!output) throw new BadRequestException("产出明细行不存在");
        if (Number(output.completedQty) + line.quantity + (line.scrapQty ?? 0) > Number(output.plannedQty) + 0.000001) throw new BadRequestException("完工数量与报废数量之和超过计划数量");
        if (line.quantity > 0) {
          const batch = await tx.inventoryBatch.create({ data: { companyId: order.companyId, materialId: output.materialId, batchNo: line.batchNo, supplierBatchNo: order.documentNo, productionDate: new Date(line.productionDate), expiryDate: new Date(line.expiryDate), sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, supplierName: "自产", unitCostCny: outputUnitCost } });
          await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: order.companyId, warehouseId: order.warehouseId, locationId: order.targetLocationId, materialId: output.materialId, batchId: batch.id, unitId: output.unitId, quantityDelta: line.quantity, unitCostCny: outputUnitCost, transactionType: InventoryTransactionType.PRODUCTION_RECEIPT, sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: order.id, actorUserId });
          outputBatches.push({ id: batch.id, share: line.quantity / totalOutput });
        }
        await tx.productionOutputLine.update({ where: { id: output.id }, data: { completedQty: { increment: line.quantity }, scrapQty: { increment: line.scrapQty ?? 0 } } });
      }
      const consumption = new Map<string, { materialId: string; quantity: number }>();
      for (const item of materialTransactions) {
        const current = consumption.get(item.batchId) ?? { materialId: item.materialId, quantity: 0 };
        current.quantity -= Number(item.quantityDelta);
        consumption.set(item.batchId, current);
      }
      for (const outputBatch of outputBatches) for (const [inputBatchId, consumed] of consumption) if (consumed.quantity > 0) await tx.batchGenealogy.upsert({ where: { productionOrderId_outputBatchId_inputBatchId_inputMaterialId: { productionOrderId: order.id, outputBatchId: outputBatch.id, inputBatchId, inputMaterialId: consumed.materialId } }, update: { consumedQty: consumed.quantity * outputBatch.share }, create: { companyId: order.companyId, productionOrderId: order.id, outputBatchId: outputBatch.id, inputBatchId, inputMaterialId: consumed.materialId, consumedQty: consumed.quantity * outputBatch.share } });
      const refreshed = await tx.productionOutputLine.findMany({ where: { productionOrderId: order.id } });
      // 完成判定：累计完工 + 累计报废 = 计划数量即完成（报废不入库，实际完成数 = 完工数量）。
      const isComplete = refreshed.every((item) => Number(item.completedQty) + Number(item.scrapQty) >= Number(item.plannedQty) - 0.000001);
      const completedQty = refreshed.reduce((sum, item) => sum + Number(item.completedQty), 0);
      const scrapQty = refreshed.reduce((sum, item) => sum + Number(item.scrapQty), 0);
      await tx.productionOrder.update({ where: { id: order.id }, data: { completedQty, scrapQty, status: isComplete ? "COMPLETED" : "IN_PROGRESS" } });
      // 完工后回写关联销售单状态：单关联沿用 sourceSalesOrderId，多关联遍历 ProductionOrderLink。
      if (isComplete) {
        const links = await tx.productionOrderLink.findMany({ where: { productionOrderId: order.id }, select: { salesOrderId: true } });
        const linkedIds = links.length ? links.map((link) => link.salesOrderId) : order.sourceSalesOrderId ? [order.sourceSalesOrderId] : [];
        for (const salesOrderId of linkedIds) await tx.salesOrder.updateMany({ where: { id: salesOrderId, status: { in: ["IN_PRODUCTION", "CONFIRMED"] } }, data: { status: "READY" } });
      }
      return productionOrderText(await tx.productionOrder.findUniqueOrThrow({ where: { id: order.id }, include: { outputLines: true, materials: true, salesOrderLinks: { include: { salesOrder: { select: { id: true, documentNo: true } } } } } }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  close(id: string) { return this.prisma.productionOrder.update({ where: { id, status: "COMPLETED" }, data: { status: "CLOSED" } }).then(productionOrderText); }

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
      return productionOrderText(await tx.productionOrder.update({ where: { id: order.id }, data: { plannedQty: body.plannedQty, plannedDate: body.plannedDate ? new Date(body.plannedDate) : undefined, remark: body.remark }, include: { outputLines: true, materials: true } }));
    });
  }

  async remove(id: string) { const order = ensureFound(await this.prisma.productionOrder.findUnique({ where: { id } }), "生产订单不存在"); const [transactions, audits] = await Promise.all([this.prisma.inventoryTransaction.count({ where: { sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: id } }), this.prisma.auditLog.count({ where: { resourceType: "ProductionOrder", resourceId: id } })]); if (transactions || audits) deleteConflict(`生产订单“${order.documentNo}”存在过账或审计引用，无法删除`, [{ resource: "库存事务", count: transactions }, { resource: "审计记录", count: audits }].filter((x) => x.count)); await this.prisma.$transaction(async (tx) => { await tx.productionMaterial.deleteMany({ where: { productionOrderId: id } }); await tx.productionOutputLine.deleteMany({ where: { productionOrderId: id } }); await tx.productionOrder.delete({ where: { id } }); }); return deleted(id); }
}

@Controller("production-orders")
export class ProductionController {
  constructor(private readonly service: ProductionService) {}
  @Get() @Permissions("production.view") list(@Query() query: PaginationQuery) { return this.service.list(query); }
  @Post("sales-order-requirements") @Permissions("production.view") salesOrderRequirements(@Body() body: { salesOrderIds: string[] }) { return this.service.salesOrderRequirements(body.salesOrderIds); }
  @Post() @Permissions("production.manage") create(@Body() body: CreateProductionBody) { return this.service.create(body); }
  @Patch(":id/release") @Permissions("production.manage") release(@Param("id") id: string) { return this.service.release(id); }
  @Post(":id/issues") @Permissions("production.issue") issue(@Param("id") id: string, @Body() body: { lines: IssueLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.issue(id, body.lines, key, req.user?.sub); }
  @Post(":id/returns") @Permissions("production.issue") returnMaterial(@Param("id") id: string, @Body() body: { lines: IssueLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.returnMaterial(id, body.lines, key, req.user?.sub); }
  @Post(":id/completions") @Permissions("production.complete") complete(@Param("id") id: string, @Body() body: { lines: CompletionLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.complete(id, body.lines, key, req.user?.sub); }
  @Patch(":id/close") @Permissions("production.manage") close(@Param("id") id: string) { return this.service.close(id); }
  @Patch(":id") @Permissions("production.manage") update(@Param("id") id: string, @Body() body: any) { return this.service.update(id, body); }
  @Delete(":id") @Permissions("production.manage") remove(@Param("id") id: string) { return this.service.remove(id); }
}
