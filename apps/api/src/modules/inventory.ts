import { BadRequestException, Body, Controller, Delete, Get, Headers, Injectable, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { BatchStatus, InventoryDocumentType, InventoryTransactionType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { InventoryPostingService } from "./posting";
import { PaginationQuery, pageResult, parsePagination } from "../pagination";
import { postingText, productionText, salesOrderText, withBatchStatusText } from "../status-text";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type ReceiptBody = { materialId: string; locationId: string; batchNo: string; supplierBatchNo?: string; supplierName?: string; quantity: number; unitId: string; unitCostCny: number; productionDate: string; expiryDate: string; remark?: string };
type StockLine = { materialId: string; batchId: string; locationId: string; quantity: number; unitId: string };
type TransferBody = StockLine & { toLocationId: string; reasonCode?: string; remark?: string };
type StocktakeLineBody = { materialId: string; countedQty: number; remark?: string };
type StocktakeBody = { lines: StocktakeLineBody[]; reasonCode: string; remark?: string };
type AdjustmentBody = StockLine & { reasonCode: string; remark?: string };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly posting: InventoryPostingService) {}

  async balances(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.inventoryBalance.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryBalance.count()]); const maps = await this.enrich(items); return pageResult(items.map((balance) => ({ ...balance, batch: maps.batch.get(balance.batchId) ? withBatchStatusText(maps.batch.get(balance.batchId)!) : undefined, location: maps.location.get(balance.locationId), unit: maps.unit.get(balance.unitId) })), total, page, pageSize); }
  async balancesSummary() { const balances = await this.prisma.inventoryBalance.findMany({}); const map = new Map<string, { onHandQty: number; reservedQty: number; availableQty: number; unitId: string }>(); for (const balance of balances) { const current = map.get(balance.materialId) ?? { onHandQty: 0, reservedQty: 0, availableQty: 0, unitId: "" }; current.onHandQty += Number(balance.onHandQty); current.reservedQty += Number(balance.reservedQty); current.availableQty += Number(balance.availableQty); current.unitId = current.unitId || balance.unitId; map.set(balance.materialId, current); } return [...map.entries()].map(([materialId, value]) => ({ materialId, ...value })); }
  async batches(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const materialIds = query.q ? (await this.prisma.material.findMany({ where: { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] }, select: { id: true } })).map((item) => item.id) : undefined; const where: any = { ...(query.q ? { OR: [{ batchNo: { contains: query.q, mode: "insensitive" } }, { supplierBatchNo: { contains: query.q, mode: "insensitive" } }, ...(materialIds?.length ? [{ materialId: { in: materialIds } }] : [])] } : {}) }; const [items, total] = await Promise.all([this.prisma.inventoryBatch.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryBatch.count({ where })]); return pageResult(items.map(withBatchStatusText), total, page, pageSize); }
  async transactions(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const materialIds = query.q ? (await this.prisma.material.findMany({ where: { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] }, select: { id: true } })).map((item) => item.id) : undefined; const where: any = { ...(query.q ? { OR: [{ transactionNo: { contains: query.q, mode: "insensitive" } }, ...((materialIds ?? []).length ? [{ materialId: { in: materialIds } }] : [])] } : {}), ...(query.type ? { transactionType: query.type } : {}) }; const [items, total] = await Promise.all([this.prisma.inventoryTransaction.findMany({ where, orderBy: [{ postedAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryTransaction.count({ where })]); const maps = await this.enrich(items); return pageResult(items.map((transaction) => ({ ...transaction, batch: maps.batch.get(transaction.batchId) ? withBatchStatusText(maps.batch.get(transaction.batchId)!) : undefined, location: maps.location.get(transaction.locationId), unit: maps.unit.get(transaction.unitId) })), total, page, pageSize); }

  private async enrich(rows: { batchId: string; locationId: string; unitId: string }[]) {
    const batchIds = [...new Set(rows.map((row) => row.batchId))]; const locationIds = [...new Set(rows.map((row) => row.locationId))]; const unitIds = [...new Set(rows.map((row) => row.unitId))];
    const [batches, locations, units] = await Promise.all([this.prisma.inventoryBatch.findMany({ where: { id: { in: batchIds } } }), this.prisma.location.findMany({ where: { id: { in: locationIds } } }), this.prisma.unit.findMany({ where: { id: { in: unitIds } } })]);
    return { batch: new Map(batches.map((item) => [item.id, item])), location: new Map(locations.map((item) => [item.id, item])), unit: new Map(units.map((item) => [item.id, item])) };
  }
  async costs(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.materialCost.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.materialCost.count()]); return pageResult(items, total, page, pageSize); }
  async documents(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.inventoryDocument.findMany({ include: { lines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryDocument.count()]); return pageResult(items.map(postingText), total, page, pageSize); }
  async operationsBootstrap() { const [orders, sales, batches, balances, locations, materials, units] = await Promise.all([this.prisma.productionOrder.findMany({ where: { status: { in: ["RELEASED", "IN_PROGRESS"] } }, include: { materials: true, outputLines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.salesOrder.findMany({ where: { status: { in: ["DRAFT", "CONFIRMED", "READY", "PARTIALLY_SHIPPED"] } }, include: { customer: true, lines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.inventoryBatch.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.inventoryBalance.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }), this.prisma.location.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }), this.prisma.material.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }), this.prisma.unit.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })]); return { orders: orders.map(productionText), sales: sales.map(salesOrderText), batches: batches.map(withBatchStatusText), balances, locations, materials, units }; }

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
      return { batch: withBatchStatusText(batch), transaction };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async transfer(body: TransferBody, idempotencyKey?: string, actorUserId?: string) {
    const key = this.requireKey(idempotencyKey);
    if (body.quantity <= 0 || body.locationId === body.toLocationId) throw new BadRequestException("调拨数量必须大于零且目标库位不能相同");
    const { company, warehouse } = await this.context();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryDocument.findUnique({ where: { idempotencyKey: key } });
      if (existing) return postingText(existing);
      const document = await tx.inventoryDocument.create({ data: { documentNo: `TR-${Date.now()}`, companyId: company.id, documentType: InventoryDocumentType.TRANSFER, status: "POSTED", idempotencyKey: key, reasonCode: body.reasonCode, remark: body.remark, createdById: actorUserId, postedAt: new Date(), lines: { create: [{ lineNo: 1, materialId: body.materialId, batchId: body.batchId, fromLocationId: body.locationId, toLocationId: body.toLocationId, quantity: body.quantity, unitId: body.unitId }] } } });
      const outgoing = await this.posting.post(tx, { idempotencyKey: `${key}:OUT`, companyId: company.id, warehouseId: warehouse.id, locationId: body.locationId, materialId: body.materialId, batchId: body.batchId, unitId: body.unitId, quantityDelta: -body.quantity, transactionType: InventoryTransactionType.TRANSFER_OUT, sourceDocumentType: "INVENTORY_TRANSFER", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: body.remark, actorUserId });
      await this.posting.post(tx, { idempotencyKey: `${key}:IN`, companyId: company.id, warehouseId: warehouse.id, locationId: body.toLocationId, materialId: body.materialId, batchId: body.batchId, unitId: body.unitId, quantityDelta: body.quantity, unitCostCny: Number(outgoing.unitCostCny), transactionType: InventoryTransactionType.TRANSFER_IN, sourceDocumentType: "INVENTORY_TRANSFER", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: body.remark, actorUserId });
      return postingText(document);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async stocktake(body: StocktakeBody, idempotencyKey?: string, actorUserId?: string) {
    const key = this.requireKey(idempotencyKey);
    if (!body.lines?.length) throw new BadRequestException("盘点明细不能为空");
    if (body.lines.some((line) => line.countedQty < 0)) throw new BadRequestException("实盘数量不能为负数");
    if (new Set(body.lines.map((line) => line.materialId)).size !== body.lines.length) throw new BadRequestException("同一物料不能重复盘点");
    const { company, warehouse } = await this.context();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryDocument.findUnique({ where: { idempotencyKey: key } });
      if (existing) return postingText(existing);
      const document = await tx.inventoryDocument.create({ data: { documentNo: `ST-${Date.now()}`, companyId: company.id, documentType: InventoryDocumentType.STOCKTAKE, status: "POSTED", idempotencyKey: key, reasonCode: body.reasonCode, remark: body.remark, createdById: actorUserId, postedAt: new Date() } });
      const posted: { lineNo: number; materialId: string; bookQty: number; countedQty: number; delta: number }[] = [];
      for (const [index, line] of body.lines.entries()) {
        const material = await tx.material.findUniqueOrThrow({ where: { id: line.materialId } });
        const balances = await tx.inventoryBalance.findMany({ where: { companyId: company.id, warehouseId: warehouse.id, materialId: line.materialId } });
        const batchMap = new Map((await tx.inventoryBatch.findMany({ where: { id: { in: [...new Set(balances.map((balance) => balance.batchId))] } } })).map((batch) => [batch.id, batch]));
        const bookQty = balances.reduce((sum, balance) => sum + Number(balance.onHandQty), 0);
        const delta = line.countedQty - bookQty;
        let lineBatchId = balances[0]?.batchId ?? "";
        if (delta < 0) {
          // 盘亏：按“可用批次优先、先到期先出”扣减各批次余额
          const ordered = balances.filter((balance) => Number(balance.onHandQty) > 0).sort((a, b) => { const batchA = batchMap.get(a.batchId)!; const batchB = batchMap.get(b.batchId)!; const usableA = batchA.batchStatus === BatchStatus.AVAILABLE ? 0 : 1; const usableB = batchB.batchStatus === BatchStatus.AVAILABLE ? 0 : 1; return usableA !== usableB ? usableA - usableB : batchA.expiryDate.getTime() - batchB.expiryDate.getTime(); });
          let remaining = -delta;
          lineBatchId = ordered[0]?.batchId ?? lineBatchId;
          for (const balance of ordered) {
            if (remaining <= 0.000001) break;
            const take = Math.min(remaining, Number(balance.onHandQty));
            await this.posting.post(tx, { idempotencyKey: `${key}:POST:${index + 1}:${balance.id}`, companyId: company.id, warehouseId: warehouse.id, locationId: balance.locationId, materialId: line.materialId, batchId: balance.batchId, unitId: balance.unitId, quantityDelta: -take, transactionType: InventoryTransactionType.STOCKTAKE_LOSS, sourceDocumentType: "STOCKTAKE", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: line.remark ?? body.remark, actorUserId });
            remaining -= take;
          }
          if (remaining > 0.000001) throw new BadRequestException(`物料 ${material.code} 账面库存不足，无法完成盘亏`);
        } else if (delta > 0) {
          // 盘盈：差额记入专属盘点批次（成本沿用当前移动平均）
          const locationId = material.defaultLocationId ?? (await tx.location.findFirstOrThrow({ where: { isActive: true }, orderBy: { code: "asc" } })).id;
          const cost = await tx.materialCost.findUnique({ where: { companyId_materialId: { companyId: company.id, materialId: line.materialId } } });
          const unitCost = Number(cost?.movingAverageCostCny ?? 0);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const batch = await tx.inventoryBatch.create({ data: { companyId: company.id, materialId: line.materialId, batchNo: `${document.documentNo}-${index + 1}`, productionDate: today, expiryDate: new Date(today.getTime() + (material.shelfLifeDays ?? 365) * 86400000), sourceDocumentType: "STOCKTAKE", sourceDocumentId: document.id, supplierName: "盘点盘盈", unitCostCny: unitCost } });
          lineBatchId = batch.id;
          await this.posting.post(tx, { idempotencyKey: `${key}:POST:${index + 1}`, companyId: company.id, warehouseId: warehouse.id, locationId, materialId: line.materialId, batchId: batch.id, unitId: material.baseUnitId, quantityDelta: delta, unitCostCny: unitCost, transactionType: InventoryTransactionType.STOCKTAKE_GAIN, sourceDocumentType: "STOCKTAKE", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: line.remark ?? body.remark, actorUserId });
        }
        await tx.inventoryDocumentLine.create({ data: { documentId: document.id, lineNo: index + 1, materialId: line.materialId, batchId: lineBatchId, fromLocationId: balances[0]?.locationId, quantity: Math.abs(delta), countedQty: line.countedQty, unitId: balances[0]?.unitId ?? material.baseUnitId } });
        posted.push({ lineNo: index + 1, materialId: line.materialId, bookQty, countedQty: line.countedQty, delta });
      }
      return { ...postingText(document), lines: undefined, posted };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async adjust(body: AdjustmentBody, idempotencyKey?: string, actorUserId?: string, scrap = false) {
    const key = this.requireKey(idempotencyKey);
    if (!body.quantity || (scrap && body.quantity < 0)) throw new BadRequestException("调整数量无效");
    const delta = scrap ? -Math.abs(body.quantity) : body.quantity;
    const { company, warehouse } = await this.context();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryDocument.findUnique({ where: { idempotencyKey: key } });
      if (existing) return postingText(existing);
      const document = await tx.inventoryDocument.create({ data: { documentNo: `${scrap ? "SC" : "AD"}-${Date.now()}`, companyId: company.id, documentType: scrap ? InventoryDocumentType.SCRAP : InventoryDocumentType.ADJUSTMENT, status: "POSTED", idempotencyKey: key, reasonCode: body.reasonCode, remark: body.remark, createdById: actorUserId, postedAt: new Date(), lines: { create: [{ lineNo: 1, materialId: body.materialId, batchId: body.batchId, fromLocationId: body.locationId, quantity: Math.abs(delta), unitId: body.unitId }] } } });
      await this.posting.post(tx, { idempotencyKey: `${key}:POST`, companyId: company.id, warehouseId: warehouse.id, locationId: body.locationId, materialId: body.materialId, batchId: body.batchId, unitId: body.unitId, quantityDelta: delta, transactionType: scrap ? InventoryTransactionType.SCRAP : delta > 0 ? InventoryTransactionType.ADJUSTMENT_GAIN : InventoryTransactionType.ADJUSTMENT_LOSS, sourceDocumentType: scrap ? "INVENTORY_SCRAP" : "INVENTORY_ADJUSTMENT", sourceDocumentId: document.id, reasonCode: body.reasonCode, remark: body.remark, actorUserId });
      return postingText(document);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async setBatchStatus(batchId: string, status: BatchStatus, actorUserId?: string) {
    if (!([BatchStatus.AVAILABLE, BatchStatus.FROZEN, BatchStatus.LOCKED, BatchStatus.QUARANTINE] as BatchStatus[]).includes(status)) throw new BadRequestException("不支持的批次状态");
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.update({ where: { id: batchId }, data: { batchStatus: status } });
      const balances = await tx.inventoryBalance.findMany({ where: { batchId } });
      for (const balance of balances) await tx.inventoryBalance.update({ where: { id: balance.id }, data: { availableQty: status === BatchStatus.AVAILABLE ? Math.max(0, Number(balance.onHandQty) - Number(balance.reservedQty)) : 0, version: { increment: 1 } } });
      await this.posting.audit(tx, batch.companyId, actorUserId, "inventory.batch_status", "InventoryBatch", batch.id, { status });
      return withBatchStatusText(batch);
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
    return { batch: withBatchStatusText(batch), transactions, upstream: asOutput, downstream: asInput, relatedBatches: relatedBatches.map(withBatchStatusText) };
  }
}

@Controller("inventory")
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get("balances/summary") @Permissions("inventory.view") balancesSummary() { return this.service.balancesSummary(); }
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
