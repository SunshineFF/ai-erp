import { BadRequestException, Body, Controller, Delete, Get, Headers, Injectable, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { BatchStatus, InventoryDocumentType, InventoryTransactionType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { InventoryPostingService } from "./posting";
import { PaginationQuery, pageResult, parsePagination } from "../pagination";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type ReceiptBody = { materialId: string; locationId: string; batchNo: string; supplierBatchNo?: string; supplierName?: string; quantity: number; unitId: string; unitCostCny: number; productionDate: string; expiryDate: string; remark?: string };
type StockLine = { materialId: string; batchId: string; locationId: string; quantity: number; unitId: string };
type TransferBody = StockLine & { toLocationId: string; reasonCode?: string; remark?: string };
type StocktakeBody = Omit<StockLine, "quantity"> & { countedQty: number; reasonCode: string; remark?: string };
type AdjustmentBody = StockLine & { reasonCode: string; remark?: string };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly posting: InventoryPostingService) {}

  async balances(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.inventoryBalance.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryBalance.count()]); return pageResult(items, total, page, pageSize); }
  async batches(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.inventoryBatch.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryBatch.count()]); return pageResult(items, total, page, pageSize); }
  async transactions(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.inventoryTransaction.findMany({ orderBy: [{ postedAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryTransaction.count()]); return pageResult(items, total, page, pageSize); }
  async costs(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.materialCost.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.materialCost.count()]); return pageResult(items, total, page, pageSize); }
  async documents(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.inventoryDocument.findMany({ include: { lines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryDocument.count()]); return pageResult(items, total, page, pageSize); }
  async operationsBootstrap() { const [orders, sales, batches, balances, locations, materials] = await Promise.all([this.prisma.productionOrder.findMany({ where: { status: { in: ["RELEASED", "IN_PROGRESS"] } }, include: { materials: true, outputLines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.salesOrder.findMany({ where: { status: { in: ["DRAFT", "CONFIRMED", "READY", "PARTIALLY_SHIPPED"] } }, include: { customer: true, lines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.inventoryBatch.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.inventoryBalance.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }), this.prisma.location.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }), this.prisma.material.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })]); return { orders, sales, batches, balances, locations, materials }; }

  async removeBatch(id: string) { const batch = ensureFound(await this.prisma.inventoryBatch.findUnique({ where: { id } }), "库存批次不存在"); const [transactions, balances, genealogy] = await Promise.all([this.prisma.inventoryTransaction.count({ where: { batchId: id } }), this.prisma.inventoryBalance.count({ where: { batchId: id } }), this.prisma.batchGenealogy.count({ where: { OR: [{ inputBatchId: id }, { outputBatchId: id }] } })]); if (transactions || balances || genealogy) deleteConflict(`批次“${batch.batchNo}”存在库存或追溯引用，无法删除`, [{ resource: "库存事务", count: transactions }, { resource: "库存余额", count: balances }, { resource: "批次追溯", count: genealogy }].filter((x) => x.count)); await this.prisma.inventoryBatch.delete({ where: { id } }); return deleted(id); }

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
  @Get("balances") @Permissions("inventory.view") balances(@Query() query: PaginationQuery) { return this.service.balances(query); }
  @Get("batches") @Permissions("inventory.view") batches(@Query() query: PaginationQuery) { return this.service.batches(query); }
  @Get("transactions") @Permissions("inventory.view") transactions(@Query() query: PaginationQuery) { return this.service.transactions(query); }
  @Get("costs") @Permissions("inventory.view") costs(@Query() query: PaginationQuery) { return this.service.costs(query); }
  @Get("documents") @Permissions("inventory.view") documents(@Query() query: PaginationQuery) { return this.service.documents(query); }
  @Get("operations-bootstrap") @Permissions("inventory.post") operationsBootstrap() { return this.service.operationsBootstrap(); }
  @Delete("batches/:id") @Permissions("inventory.post") removeBatch(@Param("id") id: string) { return this.service.removeBatch(id); }
  @Get("trace/:batchId") @Permissions("inventory.trace") trace(@Param("batchId") batchId: string) { return this.service.trace(batchId); }
  @Post("receipts") @Permissions("inventory.receive") receive(@Body() body: ReceiptBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.receive(body, key, req.user?.sub); }
  @Post("transfers") @Permissions("inventory.post") transfer(@Body() body: TransferBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.transfer(body, key, req.user?.sub); }
  @Post("stocktakes") @Permissions("inventory.stocktake") stocktake(@Body() body: StocktakeBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.stocktake(body, key, req.user?.sub); }
  @Post("adjustments") @Permissions("inventory.adjust") adjust(@Body() body: AdjustmentBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.adjust(body, key, req.user?.sub); }
  @Post("scraps") @Permissions("inventory.scrap") scrap(@Body() body: AdjustmentBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.adjust(body, key, req.user?.sub, true); }
  @Patch("batches/:id/status") @Permissions("inventory.post") status(@Param("id") id: string, @Body() body: { status: BatchStatus }, @Req() req: any) { return this.service.setBatchStatus(id, body.status, req.user?.sub); }
  @Post("transactions/:id/reverse") @Permissions("inventory.reverse") reverse(@Param("id") id: string, @Body() body: { reasonCode: string }, @Req() req: any) { return this.service.reverse(id, body.reasonCode, req.user?.sub); }
}
