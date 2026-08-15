import { BadRequestException, Body, Controller, Get, Headers, Injectable, Param, Patch, Post, Req } from "@nestjs/common";
import { BatchStatus, InventoryDocumentType, InventoryTransactionType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { InventoryPostingService } from "./posting";

type ReceiptBody = { materialId: string; locationId: string; batchNo: string; supplierBatchNo?: string; supplierName?: string; quantity: number; unitId: string; unitCostCny: number; productionDate: string; expiryDate: string; remark?: string };
type StockLine = { materialId: string; batchId: string; locationId: string; quantity: number; unitId: string };
type TransferBody = StockLine & { toLocationId: string; reasonCode?: string; remark?: string };
type StocktakeBody = Omit<StockLine, "quantity"> & { countedQty: number; reasonCode: string; remark?: string };
type AdjustmentBody = StockLine & { reasonCode: string; remark?: string };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly posting: InventoryPostingService) {}

  balances() { return this.prisma.inventoryBalance.findMany({ orderBy: { updatedAt: "desc" }, take: 500 }); }
  batches() { return this.prisma.inventoryBatch.findMany({ orderBy: { expiryDate: "asc" }, take: 500 }); }
  transactions() { return this.prisma.inventoryTransaction.findMany({ orderBy: { postedAt: "desc" }, take: 500 }); }
  costs() { return this.prisma.materialCost.findMany({ orderBy: { updatedAt: "desc" } }); }
  documents() { return this.prisma.inventoryDocument.findMany({ include: { lines: true }, orderBy: { createdAt: "desc" }, take: 200 }); }

  private async context() {
    const [company, warehouse] = await Promise.all([this.prisma.company.findFirstOrThrow(), this.prisma.warehouse.findFirstOrThrow()]);
    return { company, warehouse };
  }

  private requireKey(key?: string) {
    if (!key?.trim()) throw new BadRequestException("请提供 Idempotency-Key 请求头");
    return key.trim();
  }

  async receive(body: ReceiptBody, idempotencyKey: string | undefined, actorUserId?: string) {
    const key = this.requireKey(idempotencyKey);
    if (body.quantity <= 0) throw new BadRequestException("入库数量必须大于零");
    if (!body.batchNo || !body.productionDate || !body.expiryDate) throw new BadRequestException("批次号、生产日期和到期日期为必填项");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(body.expiryDate) <= new Date(body.productionDate) || new Date(body.expiryDate) < today) throw new BadRequestException("到期日期必须晚于生产日期且不能已过期");
    const { company, warehouse } = await this.context();
    return this.prisma.$transaction(async (tx) => {
      const material = await tx.material.findUniqueOrThrow({ where: { id: body.materialId } });
      const batch = await tx.inventoryBatch.upsert({
        where: { companyId_materialId_batchNo: { companyId: company.id, materialId: body.materialId, batchNo: body.batchNo } },
        update: {},
        create: { companyId: company.id, materialId: body.materialId, batchNo: body.batchNo, supplierBatchNo: body.supplierBatchNo, supplierName: body.supplierName, productionDate: new Date(body.productionDate), expiryDate: new Date(body.expiryDate), unitCostCny: body.unitCostCny, sourceDocumentType: "MANUAL_RECEIPT" },
      });
      if (!material.batchRequired) throw new BadRequestException("一期存货物料必须启用批次管理");
      const transaction = await this.posting.post(tx, { idempotencyKey: key, companyId: company.id, warehouseId: warehouse.id, locationId: body.locationId, materialId: body.materialId, batchId: batch.id, unitId: body.unitId, quantityDelta: body.quantity, unitCostCny: body.unitCostCny, transactionType: InventoryTransactionType.PURCHASE_RECEIPT, sourceDocumentType: "MANUAL_RECEIPT", reasonCode: "MANUAL_RECEIPT", remark: body.remark, actorUserId });
      return { batch, transaction };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async transfer(body: TransferBody, idempotencyKey?: string, actorUserId?: string) {
    const key = this.requireKey(idempotencyKey);
    if (body.quantity <= 0 || body.locationId === body.toLocationId) throw new BadRequestException("调拨数量必须大于零且目标库位不能相同");
    const { company, warehouse } = await this.context();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryDocument.findUnique({ where: { idempotencyKey: key } });
      if (existing) return existing;
      const document = await tx.inventoryDocument.create({ data: { documentNo: `TR-${Date.now()}`, companyId: company.id, documentType: InventoryDocumentType.TRANSFER, status: "POSTED", idempotencyKey: key, reasonCode: body.reasonCode, remark: body.remark, createdById: actorUserId, postedAt: new Date(), lines: { create: [{ lineNo: 1, materialId: body.materialId, batchId: body.batchId, fromLocationId: body.locationId, toLocationId: body.toLocationId, quantity: body.quantity, unitId: body.unitId }] } } });
      const outgoing = await this.posting.post(tx, { idempotencyKey: `${key}:OUT`, companyId: company.id, warehouseId: warehouse.id, locationId: body.locationId, materialId: body.materialId, batchId: body.batchId, unitId: body.unitId, quantityDelta: -body.quantity, transactionType: InventoryTransactionType.TRANSFER_OUT, sourceDocumentType: "INVENTORY_TRANSFER", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: body.remark, actorUserId });
      await this.posting.post(tx, { idempotencyKey: `${key}:IN`, companyId: company.id, warehouseId: warehouse.id, locationId: body.toLocationId, materialId: body.materialId, batchId: body.batchId, unitId: body.unitId, quantityDelta: body.quantity, unitCostCny: Number(outgoing.unitCostCny), transactionType: InventoryTransactionType.TRANSFER_IN, sourceDocumentType: "INVENTORY_TRANSFER", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: body.remark, actorUserId });
      return document;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async stocktake(body: StocktakeBody, idempotencyKey?: string, actorUserId?: string) {
    const key = this.requireKey(idempotencyKey);
    if (body.countedQty < 0) throw new BadRequestException("实盘数量不能为负数");
    const { company, warehouse } = await this.context();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryDocument.findUnique({ where: { idempotencyKey: key } });
      if (existing) return existing;
      const balance = await tx.inventoryBalance.findUnique({ where: { companyId_warehouseId_locationId_materialId_batchId_unitId: { companyId: company.id, warehouseId: warehouse.id, locationId: body.locationId, materialId: body.materialId, batchId: body.batchId, unitId: body.unitId } } });
      const delta = body.countedQty - Number(balance?.onHandQty ?? 0);
      const document = await tx.inventoryDocument.create({ data: { documentNo: `ST-${Date.now()}`, companyId: company.id, documentType: InventoryDocumentType.STOCKTAKE, status: "POSTED", idempotencyKey: key, reasonCode: body.reasonCode, remark: body.remark, createdById: actorUserId, postedAt: new Date(), lines: { create: [{ lineNo: 1, materialId: body.materialId, batchId: body.batchId, fromLocationId: body.locationId, quantity: Math.abs(delta), countedQty: body.countedQty, unitId: body.unitId }] } } });
      if (delta !== 0) await this.posting.post(tx, { idempotencyKey: `${key}:POST`, companyId: company.id, warehouseId: warehouse.id, locationId: body.locationId, materialId: body.materialId, batchId: body.batchId, unitId: body.unitId, quantityDelta: delta, transactionType: delta > 0 ? InventoryTransactionType.STOCKTAKE_GAIN : InventoryTransactionType.STOCKTAKE_LOSS, sourceDocumentType: "STOCKTAKE", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: body.remark, actorUserId });
      return document;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async adjust(body: AdjustmentBody, idempotencyKey?: string, actorUserId?: string, scrap = false) {
    const key = this.requireKey(idempotencyKey);
    if (!body.quantity || (scrap && body.quantity < 0)) throw new BadRequestException("调整数量无效");
    const delta = scrap ? -Math.abs(body.quantity) : body.quantity;
    const { company, warehouse } = await this.context();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryDocument.findUnique({ where: { idempotencyKey: key } });
      if (existing) return existing;
      const document = await tx.inventoryDocument.create({ data: { documentNo: `${scrap ? "SC" : "AD"}-${Date.now()}`, companyId: company.id, documentType: scrap ? InventoryDocumentType.SCRAP : InventoryDocumentType.ADJUSTMENT, status: "POSTED", idempotencyKey: key, reasonCode: body.reasonCode, remark: body.remark, createdById: actorUserId, postedAt: new Date(), lines: { create: [{ lineNo: 1, materialId: body.materialId, batchId: body.batchId, fromLocationId: body.locationId, quantity: Math.abs(delta), unitId: body.unitId }] } } });
      await this.posting.post(tx, { idempotencyKey: `${key}:POST`, companyId: company.id, warehouseId: warehouse.id, locationId: body.locationId, materialId: body.materialId, batchId: body.batchId, unitId: body.unitId, quantityDelta: delta, transactionType: scrap ? InventoryTransactionType.SCRAP : delta > 0 ? InventoryTransactionType.ADJUSTMENT_GAIN : InventoryTransactionType.ADJUSTMENT_LOSS, sourceDocumentType: scrap ? "INVENTORY_SCRAP" : "INVENTORY_ADJUSTMENT", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: body.remark, actorUserId });
      return document;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async setBatchStatus(batchId: string, status: BatchStatus, actorUserId?: string) {
    if (!([BatchStatus.AVAILABLE, BatchStatus.FROZEN, BatchStatus.LOCKED, BatchStatus.QUARANTINE] as BatchStatus[]).includes(status)) throw new BadRequestException("不支持的批次状态");
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.update({ where: { id: batchId }, data: { batchStatus: status } });
      const balances = await tx.inventoryBalance.findMany({ where: { batchId } });
      for (const balance of balances) await tx.inventoryBalance.update({ where: { id: balance.id }, data: { availableQty: status === BatchStatus.AVAILABLE ? Math.max(0, Number(balance.onHandQty) - Number(balance.reservedQty)) : 0, version: { increment: 1 } } });
      await this.posting.audit(tx, batch.companyId, actorUserId, "inventory.batch_status", "InventoryBatch", batch.id, { status });
      return batch;
    });
  }

  reverse(transactionId: string, reasonCode: string, actorUserId?: string) { return this.posting.reverse(transactionId, reasonCode, actorUserId); }

  async trace(batchId: string) {
    const batch = await this.prisma.inventoryBatch.findUniqueOrThrow({ where: { id: batchId } });
    const [transactions, asOutput, asInput] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({ where: { batchId }, orderBy: { postedAt: "asc" } }),
      this.prisma.batchGenealogy.findMany({ where: { outputBatchId: batchId } }),
      this.prisma.batchGenealogy.findMany({ where: { inputBatchId: batchId } }),
    ]);
    const relatedBatchIds = [...new Set([...asOutput.map((item) => item.inputBatchId), ...asInput.map((item) => item.outputBatchId)])];
    const relatedBatches = relatedBatchIds.length ? await this.prisma.inventoryBatch.findMany({ where: { id: { in: relatedBatchIds } } }) : [];
    return { batch, transactions, upstream: asOutput, downstream: asInput, relatedBatches };
  }
}

@Controller("inventory")
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get("balances") @Permissions("inventory.view") balances() { return this.service.balances(); }
  @Get("batches") @Permissions("inventory.view") batches() { return this.service.batches(); }
  @Get("transactions") @Permissions("inventory.view") transactions() { return this.service.transactions(); }
  @Get("costs") @Permissions("inventory.view") costs() { return this.service.costs(); }
  @Get("documents") @Permissions("inventory.view") documents() { return this.service.documents(); }
  @Get("trace/:batchId") @Permissions("inventory.trace") trace(@Param("batchId") batchId: string) { return this.service.trace(batchId); }
  @Post("receipts") @Permissions("inventory.receive") receive(@Body() body: ReceiptBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.receive(body, key, req.user?.sub); }
  @Post("transfers") @Permissions("inventory.post") transfer(@Body() body: TransferBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.transfer(body, key, req.user?.sub); }
  @Post("stocktakes") @Permissions("inventory.stocktake") stocktake(@Body() body: StocktakeBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.stocktake(body, key, req.user?.sub); }
  @Post("adjustments") @Permissions("inventory.adjust") adjust(@Body() body: AdjustmentBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.adjust(body, key, req.user?.sub); }
  @Post("scraps") @Permissions("inventory.scrap") scrap(@Body() body: AdjustmentBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.adjust(body, key, req.user?.sub, true); }
  @Patch("batches/:id/status") @Permissions("inventory.post") status(@Param("id") id: string, @Body() body: { status: BatchStatus }, @Req() req: any) { return this.service.setBatchStatus(id, body.status, req.user?.sub); }
  @Post("transactions/:id/reverse") @Permissions("inventory.reverse") reverse(@Param("id") id: string, @Body() body: { reasonCode: string }, @Req() req: any) { return this.service.reverse(id, body.reasonCode, req.user?.sub); }
}
