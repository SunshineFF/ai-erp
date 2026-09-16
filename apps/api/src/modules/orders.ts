import { BadRequestException, Body, Controller, Delete, Get, Headers, Injectable, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { InventoryTransactionType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { InventoryPostingService } from "./posting";
import { calculateLineAmounts, calculateShipmentAmount, roundMoney } from "../domain";
import { PaginationQuery, pageResult, parsePagination, createdAtFilter } from "../pagination";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type OrderLineInput = { materialId: string; quantity: number; unitId: string; unitPrice: number; taxExcludedPrice?: number; taxRate?: number; taxRateId?: string; supplierQuoteId?: string; priceBasis?: "TAX_INCLUDED" | "CASH"; supplierTaxRateSnapshot?: number; batchNo?: string; supplierBatchNo?: string; productionDate?: string; expiryDate?: string };
type MoneyFields = { currencyCode?: string; exchangeRate?: number; exchangeRateDate?: string; taxRateId?: string; priceIncludesTax?: boolean };
type PurchaseBody = MoneyFields & { supplierId: string; orderDate?: string; expectedDate?: string; remark?: string; lines: OrderLineInput[] };
type SalesBody = MoneyFields & { customerId: string; orderDate?: string; expectedShipmentAt?: string; actualShipmentAt?: string; remark?: string; lines: OrderLineInput[] };
type ReceiptLine = { orderLineId: string; quantity: number; locationId?: string; batchNo?: string; supplierBatchNo?: string; productionDate?: string; expiryDate?: string };
type ShipmentLine = { salesOrderLineId: string; batchId: string; locationId: string; quantity: number };
type ShipmentBody = { shippedAt?: string; lines: ShipmentLine[] };
type PurchaseReturnLine = { orderLineId: string; batchId: string; locationId: string; quantity: number };

function requireLines(lines: OrderLineInput[], documentName: string) { if (!lines?.length) throw new BadRequestException(`${documentName}至少需要一行物料`); if (lines.some((line) => line.quantity <= 0 || line.unitPrice < 0 || (line.taxExcludedPrice !== undefined && line.taxExcludedPrice < 0) || (line.taxRate !== undefined && (line.taxRate < 0 || line.taxRate > 1)))) throw new BadRequestException("物料数量必须大于零，单价不能为负数，税点必须在 0 到 1 之间"); }

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly posting: InventoryPostingService) {}
  private company() { return this.prisma.company.findFirstOrThrow(); }
  async purchaseOrders(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const where: any = { ...(createdAtFilter(query) ? { createdAt: createdAtFilter(query) } : {}), ...(query.partnerId ? { supplierId: query.partnerId } : {}) }; const [items, total] = await Promise.all([this.prisma.purchaseOrder.findMany({ where, include: { supplier: true, lines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.purchaseOrder.count({ where })]); return pageResult(items, total, page, pageSize); }
  async salesOrders(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const where: any = { ...(createdAtFilter(query) ? { createdAt: createdAtFilter(query) } : {}), ...(query.partnerId ? { customerId: query.partnerId } : {}) }; const [items, total] = await Promise.all([this.prisma.salesOrder.findMany({ where, include: { customer: true, lines: true, shipments: { include: { lines: true, shippedBy: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.salesOrder.count({ where })]); return pageResult(items, total, page, pageSize); }
  salesOrderOptions(q?: string, take?: string, status?: string) { const parsedTake = take === undefined ? undefined : Math.min(Math.max(Number(take) || 10, 1), 50); const statuses = status?.split(",").map((item) => item.trim()).filter(Boolean); const where: any = { ...(statuses?.length ? { status: { in: statuses } } : {}), ...(q?.trim() ? { OR: [{ documentNo: { contains: q.trim(), mode: "insensitive" } }, { customer: { name: { contains: q.trim(), mode: "insensitive" } } }] } : {}) }; return this.prisma.salesOrder.findMany({ where, select: { id: true, documentNo: true, customerId: true, customer: { select: { id: true, name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(parsedTake ? { take: parsedTake } : {}) }); } async shipmentBootstrap() { const [orders, balances, batches, locations] = await Promise.all([this.prisma.salesOrder.findMany({ where: { status: { in: ["CONFIRMED", "READY", "IN_PRODUCTION", "PARTIALLY_SHIPPED"] } }, include: { customer: true, lines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.inventoryBalance.findMany({ where: { availableQty: { gt: 0 } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }), this.prisma.inventoryBatch.findMany({ where: { batchStatus: "AVAILABLE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.location.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })]); return { orders, balances, batches, locations }; }
  async salesShipments(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const where: any = { ...(createdAtFilter(query) ? { createdAt: createdAtFilter(query) } : {}), ...(query.partnerId ? { customerId: query.partnerId } : {}) }; const [items, total] = await Promise.all([this.prisma.salesShipment.findMany({ where, include: { customer: true, shippedBy: true, order: { include: { customer: true } }, lines: { include: { salesOrderLine: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.salesShipment.count({ where })]); return pageResult(items, total, page, pageSize); }
  salesOrderDetail(id: string) { return this.prisma.salesOrder.findUniqueOrThrow({ where: { id }, include: { customer: true, lines: true } }); }
  salesShipment(id: string) { return this.prisma.salesShipment.findUniqueOrThrow({ where: { id }, include: { customer: true, shippedBy: true, order: { include: { customer: true } }, lines: { include: { salesOrderLine: true } } } }); }
  async removePurchase(id: string) { const order = ensureFound(await this.prisma.purchaseOrder.findUnique({ where: { id } }), "采购订单不存在"); const [transactions, bills] = await Promise.all([this.prisma.inventoryTransaction.count({ where: { sourceDocumentType: { in: ["PURCHASE_ORDER", "PURCHASE_RECEIPT"] }, sourceDocumentId: id } }), this.prisma.bill.count({ where: { sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: id } })]); if (transactions || bills) deleteConflict(`采购订单“${order.documentNo}”存在过账或账单引用，无法删除`, [{ resource: "库存事务", count: transactions }, { resource: "账单", count: bills }].filter((x) => x.count)); await this.prisma.$transaction(async (tx) => { await tx.purchaseOrderLine.deleteMany({ where: { orderId: id } }); await tx.purchaseOrder.delete({ where: { id } }); }); return deleted(id); }
  async removeSales(id: string) { const order = ensureFound(await this.prisma.salesOrder.findUnique({ where: { id } }), "销售订单不存在"); const [shipments, production, productionLinks, bills] = await Promise.all([this.prisma.salesShipment.count({ where: { salesOrderId: id } }), this.prisma.productionOrder.count({ where: { sourceSalesOrderId: id } }), this.prisma.productionOrderLink.count({ where: { salesOrderId: id } }), this.prisma.bill.count({ where: { sourceDocumentType: "SALES_ORDER", sourceDocumentId: id } })]); if (shipments || production || productionLinks || bills) deleteConflict(`销售订单“${order.documentNo}”存在下游业务引用，无法删除`, [{ resource: "出库单", count: shipments }, { resource: "生产订单", count: production + productionLinks }, { resource: "账单", count: bills }].filter((x) => x.count)); await this.prisma.$transaction(async (tx) => { await tx.salesOrderLine.deleteMany({ where: { orderId: id } }); await tx.salesOrder.delete({ where: { id } }); }); return deleted(id); }
  async removeShipment(id: string) { const shipment = ensureFound(await this.prisma.salesShipment.findUnique({ where: { id } }), "出库单不存在"); const transactions = await this.prisma.inventoryTransaction.count({ where: { sourceDocumentType: "SALES_SHIPMENT", sourceDocumentId: id } }); if (transactions) deleteConflict(`出库单“${shipment.documentNo}”仍有库存事务，请先完成冲销后再删除`, [{ resource: "库存事务", count: transactions }], "到现场作业逐笔冲销该出库单的库存事务"); await this.prisma.$transaction(async (tx) => { await tx.salesShipmentLine.deleteMany({ where: { shipmentId: id } }); await tx.salesShipment.delete({ where: { id } }); }); return deleted(id); }

  private async money(companyId: string, body: MoneyFields, date: Date, lines: OrderLineInput[]) {
    const currencyCode = body.currencyCode ?? "CNY";
    if (!["CNY", "USD"].includes(currencyCode)) throw new BadRequestException("一期只支持 CNY 和 USD");
    const exchangeRateDate = body.exchangeRateDate ? new Date(body.exchangeRateDate) : date;
    let exchangeRate = currencyCode === "CNY" ? 1 : body.exchangeRate;
    if (currencyCode === "USD" && !exchangeRate) exchangeRate = Number((await this.prisma.exchangeRate.findFirst({ where: { companyId, currencyCode: "USD", rateDate: { lte: exchangeRateDate }, isActive: true }, orderBy: { rateDate: "desc" } }))?.rateToCny ?? 0);
    if (!exchangeRate || exchangeRate <= 0) throw new BadRequestException("USD 单据必须维护并锁定有效汇率");
    const taxIds = [...new Set(lines.map((line) => line.taxRateId ?? body.taxRateId).filter(Boolean) as string[])];
    const rates = await this.prisma.taxRate.findMany({ where: { id: { in: taxIds } } });
    const mapped = lines.map((line) => {
      const taxRateId = line.taxRateId ?? body.taxRateId;
      const taxRate = line.taxRate !== undefined ? Number(line.taxRate) : line.supplierTaxRateSnapshot !== undefined ? Number(line.supplierTaxRateSnapshot) : Number(rates.find((item) => item.id === taxRateId)?.rate ?? 0);
      const amounts = calculateLineAmounts(line.quantity, line.unitPrice, taxRate, body.priceIncludesTax !== false, exchangeRate!);
      return { ...line, taxRateId, taxRateSnapshot: taxRate, ...amounts };
    });
    const netAmount = roundMoney(mapped.reduce((sum, line) => sum + line.netAmount, 0));
    const taxAmount = roundMoney(mapped.reduce((sum, line) => sum + line.taxAmount, 0));
    const totalAmount = roundMoney(mapped.reduce((sum, line) => sum + line.grossAmount, 0));
    return { currencyCode, exchangeRate, exchangeRateDate, lines: mapped, netAmount, taxAmount, totalAmount, totalAmountCny: roundMoney(totalAmount * exchangeRate) };
  }
  private async ensureTradeableMaterials(lines: OrderLineInput[]) { const ids = [...new Set(lines.map((line) => line.materialId))]; const parents = await (this.prisma as any).material.findMany({ where: { id: { in: ids }, parentMaterialId: null, variantEnabled: true }, select: { name: true } }); if (parents.length) throw new BadRequestException(`多属性产品“${parents[0].name}”必须选择具体 SKU`); }

  private async resolveSupplierQuotes(supplierId: string, orderDate: Date, lines: OrderLineInput[]) {
    const db: any = this.prisma as any;
    return Promise.all(lines.map(async (line) => {
      const requestedQuoteId = line.supplierQuoteId?.trim() || undefined;
      const quote = requestedQuoteId
        ? await db.supplierProductQuote.findFirst({ where: { id: requestedQuoteId, supplierProduct: { supplierId, materialId: line.materialId, isActive: true } } })
        : await db.supplierProductQuote.findFirst({ where: { supplierProduct: { supplierId, materialId: line.materialId, isActive: true }, isActive: true, effectiveFrom: { lte: orderDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: orderDate } }] }, orderBy: { effectiveFrom: "desc" } });
      if (requestedQuoteId && !quote) throw new BadRequestException("供应商报价不存在或不属于所选 SKU");
      if (!quote) return { ...line, supplierQuoteId: undefined };
      const basis = line.priceBasis ?? "TAX_INCLUDED";
      const price = basis === "CASH" ? quote.cashPrice : quote.taxIncludedPrice;
      if (price === null || price === undefined) throw new BadRequestException("该供应商 SKU 没有维护现金价");
      const taxRate = line.taxRate !== undefined ? Number(line.taxRate) : Number(quote.supplierTaxRate);
      const taxExcludedPrice = line.taxExcludedPrice !== undefined ? Number(line.taxExcludedPrice) : basis === "CASH" ? Number(price) : roundMoney(Number(price) / (1 + taxRate));
      return { ...line, supplierQuoteId: quote.id, priceBasis: basis, unitId: line.unitId || quote.unitId, unitPrice: Number(price), taxExcludedPrice, taxRate, supplierTaxRateSnapshot: Number(quote.supplierTaxRate) };
    }));
  }

  async createPurchase(body: PurchaseBody) {
    requireLines(body.lines, "采购订单");
    await this.ensureTradeableMaterials(body.lines);
    const company = await this.company();
    await this.prisma.supplier.findUniqueOrThrow({ where: { id: body.supplierId } });
    const orderDate = body.orderDate ? new Date(body.orderDate) : new Date();
    // 采购的产品不在供应商供应列表时自动加入（已存在则跳过）
    await (this.prisma as any).supplierProduct.createMany({ data: [...new Set(body.lines.map((line) => line.materialId))].map((materialId) => ({ supplierId: body.supplierId, materialId })), skipDuplicates: true });
    const resolvedLines = await this.resolveSupplierQuotes(body.supplierId, orderDate, body.lines);
    const money = await this.money(company.id, body, orderDate, resolvedLines);
    return this.prisma.purchaseOrder.create({ data: { documentNo: `PO-${Date.now()}`, companyId: company.id, supplierId: body.supplierId, orderDate, expectedDate: body.expectedDate ? new Date(body.expectedDate) : undefined, currencyCode: money.currencyCode, exchangeRate: money.exchangeRate, exchangeRateDate: money.exchangeRateDate, taxRateId: body.taxRateId, netAmount: money.netAmount, taxAmount: money.taxAmount, totalAmount: money.totalAmount, totalAmountCny: money.totalAmountCny, remark: body.remark, lines: { create: money.lines.map((line, index) => ({ lineNo: index + 1, materialId: line.materialId, quantity: line.quantity, unitId: line.unitId, unitPrice: line.unitPrice, taxExcludedPrice: line.taxExcludedPrice ?? 0, taxRate: line.taxRate ?? line.taxRateSnapshot ?? 0, supplierQuoteId: line.supplierQuoteId || undefined, priceBasis: line.priceBasis ?? "TAX_INCLUDED", supplierTaxRateSnapshot: line.supplierTaxRateSnapshot ?? line.taxRateSnapshot, taxRateId: line.taxRateId, taxRateSnapshot: line.taxRateSnapshot, netAmount: line.netAmount, taxAmount: line.taxAmount, grossAmount: line.grossAmount, grossAmountCny: line.grossAmountCny, batchNo: line.batchNo, supplierBatchNo: line.supplierBatchNo, productionDate: line.productionDate ? new Date(line.productionDate) : undefined, expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined })) } }, include: { supplier: true, lines: true } });
  }

  confirmPurchase(id: string) { return this.prisma.purchaseOrder.update({ where: { id, status: "DRAFT" }, data: { status: "CONFIRMED" }, include: { supplier: true, lines: true } }); }

  private async nextDailyBatchNo(tx: Prisma.TransactionClient, companyId: string, materialId: string) {
    const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const sameDay = await tx.inventoryBatch.findMany({ where: { companyId, materialId, batchNo: { startsWith: prefix } }, select: { batchNo: true } });
    const used = new Set(sameDay.map((item) => item.batchNo));
    for (let sequence = 1; sequence <= 99; sequence++) { const candidate = `${prefix}${String(sequence).padStart(2, "0")}`; if (!used.has(candidate)) return candidate; }
    throw new BadRequestException("当日批次号已用尽，请手工指定内部批次号");
  }

  async completePurchase(id: string) {
    const order = await this.prisma.purchaseOrder.findFirstOrThrow({ where: { id, status: "CONFIRMED" }, include: { supplier: true, lines: true } });
    const [company, warehouse, fallbackLocation] = await Promise.all([this.company(), this.prisma.warehouse.findFirstOrThrow(), this.prisma.location.findFirstOrThrow()]);
    return this.prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        const material = await tx.material.findUniqueOrThrow({ where: { id: line.materialId } });
        const locationId = material.defaultLocationId ?? fallbackLocation.id;
        const productionDate = line.productionDate ?? new Date();
        const expiryDate = line.expiryDate ?? new Date(productionDate.getTime() + (material.shelfLifeDays ?? 365) * 86400000);
        const batchNo = line.batchNo?.trim() || await this.nextDailyBatchNo(tx, company.id, line.materialId);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (expiryDate < today) throw new BadRequestException("已过期批次禁止入库");
        const unitCostCny = Number(line.grossAmountCny) / Number(line.quantity);
        const batch = await tx.inventoryBatch.upsert({ where: { companyId_materialId_batchNo: { companyId: company.id, materialId: line.materialId, batchNo } }, update: {}, create: { companyId: company.id, materialId: line.materialId, batchNo, supplierBatchNo: line.supplierBatchNo ?? null, productionDate, expiryDate, supplierName: order.supplier.name, sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: order.id, unitCostCny } });
        await this.posting.post(tx, { idempotencyKey: `PO-RECEIVE:${order.id}:${line.id}`, companyId: company.id, warehouseId: warehouse.id, locationId, materialId: line.materialId, batchId: batch.id, unitId: line.unitId, quantityDelta: Number(line.quantity), unitCostCny, transactionType: InventoryTransactionType.PURCHASE_RECEIPT, sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: order.id, remark: order.remark ?? undefined });
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: line.quantity } });
      }
      return tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "RECEIVED" }, include: { supplier: true, lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async receivePurchase(id: string, lines: ReceiptLine[], key: string | undefined, actorUserId?: string) {
    if (!key || !lines?.length) throw new BadRequestException("采购收货必须提供幂等键和到货明细");
    const order = await this.prisma.purchaseOrder.findFirstOrThrow({ where: { id, status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] } }, include: { supplier: true, lines: true } });
    const [company, warehouse, fallbackLocation] = await Promise.all([this.company(), this.prisma.warehouse.findFirstOrThrow(), this.prisma.location.findFirstOrThrow()]);
    return this.prisma.$transaction(async (tx) => {
      for (const [index, receipt] of lines.entries()) {
        const line = order.lines.find((item) => item.id === receipt.orderLineId);
        if (!line || receipt.quantity <= 0 || Number(line.receivedQty) + receipt.quantity > Number(line.quantity)) throw new BadRequestException("收货数量超过订单未收数量");
        const material = await tx.material.findUniqueOrThrow({ where: { id: line.materialId } });
        const batchNo = receipt.batchNo?.trim() || line.batchNo?.trim() || await this.nextDailyBatchNo(tx, company.id, line.materialId);
        const supplierBatchNo = receipt.supplierBatchNo ?? line.supplierBatchNo ?? null;
        const productionDate = receipt.productionDate ? new Date(receipt.productionDate) : line.productionDate ?? new Date();
        const expiryDate = receipt.expiryDate ? new Date(receipt.expiryDate) : line.expiryDate ?? new Date(productionDate.getTime() + (material.shelfLifeDays ?? 365) * 86400000);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (expiryDate <= productionDate || expiryDate < today) throw new BadRequestException("采购批次效期无效或已过期");
        const locationId = receipt.locationId ?? material.defaultLocationId ?? fallbackLocation.id;
        const unitCostCny = Number(line.grossAmountCny) / Number(line.quantity);
        const batch = await tx.inventoryBatch.upsert({ where: { companyId_materialId_batchNo: { companyId: company.id, materialId: line.materialId, batchNo } }, update: {}, create: { companyId: company.id, materialId: line.materialId, batchNo, supplierBatchNo, productionDate, expiryDate, supplierName: order.supplier.name, sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: order.id, unitCostCny } });
        await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: company.id, warehouseId: warehouse.id, locationId, materialId: line.materialId, batchId: batch.id, unitId: line.unitId, quantityDelta: receipt.quantity, unitCostCny, transactionType: InventoryTransactionType.PURCHASE_RECEIPT, sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: order.id, actorUserId });
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: { increment: receipt.quantity } } });
      }
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { orderId: order.id } });
      const complete = refreshed.every((item) => Number(item.receivedQty) >= Number(item.quantity));
      return tx.purchaseOrder.update({ where: { id: order.id }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" }, include: { supplier: true, lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async returnPurchase(id: string, lines: PurchaseReturnLine[], key: string | undefined, actorUserId?: string) {
    if (!key || !lines?.length) throw new BadRequestException("采购退货必须提供幂等键和来源批次");
    const order = await this.prisma.purchaseOrder.findFirstOrThrow({ where: { id, status: { in: ["PARTIALLY_RECEIVED", "RECEIVED"] } }, include: { lines: true } });
    const warehouse = await this.prisma.warehouse.findFirstOrThrow();
    return this.prisma.$transaction(async (tx) => {
      const posted = [];
      for (const [index, returned] of lines.entries()) {
        const line = order.lines.find((item) => item.id === returned.orderLineId);
        if (!line || returned.quantity <= 0 || Number(line.returnedQty) + returned.quantity > Number(line.receivedQty)) throw new BadRequestException("退货数量超过累计收货数量");
        posted.push(await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: order.companyId, warehouseId: warehouse.id, locationId: returned.locationId, materialId: line.materialId, batchId: returned.batchId, unitId: line.unitId, quantityDelta: -returned.quantity, transactionType: InventoryTransactionType.PURCHASE_RETURN, sourceDocumentType: "PURCHASE_RETURN", sourceDocumentId: order.id, actorUserId }));
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { returnedQty: { increment: returned.quantity } } });
      }
      return posted;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createSales(body: SalesBody) {
    requireLines(body.lines, "销售订单");
    await this.ensureTradeableMaterials(body.lines);
    const company = await this.company();
    await this.prisma.customer.findUniqueOrThrow({ where: { id: body.customerId } });
    const orderDate = body.orderDate ? new Date(body.orderDate) : new Date();
    const money = await this.money(company.id, body, orderDate, body.lines);
    return this.prisma.salesOrder.create({ data: { documentNo: `SO-${Date.now()}`, companyId: company.id, customerId: body.customerId, orderDate, expectedShipmentAt: body.expectedShipmentAt ? new Date(body.expectedShipmentAt) : undefined, actualShipmentAt: body.actualShipmentAt ? new Date(body.actualShipmentAt) : undefined, currencyCode: money.currencyCode, exchangeRate: money.exchangeRate, exchangeRateDate: money.exchangeRateDate, taxRateId: body.taxRateId, netAmount: money.netAmount, taxAmount: money.taxAmount, totalAmount: money.totalAmount, totalAmountCny: money.totalAmountCny, remark: body.remark, lines: { create: money.lines.map((line, index) => ({ lineNo: index + 1, materialId: line.materialId, quantity: line.quantity, unitId: line.unitId, unitPrice: line.unitPrice, taxRateId: line.taxRateId, taxRateSnapshot: line.taxRateSnapshot, netAmount: line.netAmount, taxAmount: line.taxAmount, grossAmount: line.grossAmount, grossAmountCny: line.grossAmountCny })) } }, include: { customer: true, lines: true } });
  }

  confirmSales(id: string) { return this.prisma.salesOrder.update({ where: { id, status: "DRAFT" }, data: { status: "CONFIRMED" }, include: { customer: true, lines: true } }); }

  async shipSales(id: string, body: ShipmentBody, key: string | undefined, actorUserId?: string) {
    const lines = body.lines;
    if (!key?.trim() || !lines?.length) throw new BadRequestException("出库单必须包含物料明细和幂等键");
    if (lines.some((line) => !line.salesOrderLineId || !line.batchId || !line.locationId || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0)) throw new BadRequestException("出库明细必须选择批次、库位并填写大于零的数量");
    const shippedAt = body.shippedAt ? new Date(body.shippedAt) : new Date();
    if (Number.isNaN(shippedAt.getTime())) throw new BadRequestException("出库时间无效");
    const warehouse = await this.prisma.warehouse.findFirstOrThrow();
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.salesShipment.findUnique({ where: { idempotencyKey: key }, include: { customer: true, shippedBy: true, order: true, lines: { include: { salesOrderLine: true } } } });
      if (previous) return previous;
      const order = await tx.salesOrder.findFirstOrThrow({ where: { id, status: { in: ["CONFIRMED", "READY", "IN_PRODUCTION", "PARTIALLY_SHIPPED"] } }, include: { lines: true } });
      const grouped = new Map<string, Array<{ line: ShipmentLine; index: number }>>();
      lines.forEach((line, index) => grouped.set(line.salesOrderLineId, [...(grouped.get(line.salesOrderLineId) ?? []), { line, index }]));
      for (const [orderLineId, shipmentLines] of grouped) {
        const orderLine = order.lines.find((item) => item.id === orderLineId);
        const quantity = shipmentLines.reduce((sum, item) => sum + Number(item.line.quantity), 0);
        if (!orderLine || Number(orderLine.shippedQty) + quantity > Number(orderLine.quantity) + 0.000001) throw new BadRequestException("本次出库数量超过销售单剩余数量");
      }
      const previousAmounts = await tx.salesShipmentLine.groupBy({ by: ["salesOrderLineId"], where: { salesOrderLineId: { in: [...grouped.keys()] } }, _sum: { lineAmount: true } });
      const lineAmounts = new Map<number, number>();
      for (const [orderLineId, shipmentLines] of grouped) {
        const orderLine = order.lines.find((item) => item.id === orderLineId)!;
        const quantity = shipmentLines.reduce((sum, item) => sum + Number(item.line.quantity), 0);
        const previousAmount = Number(previousAmounts.find((item) => item.salesOrderLineId === orderLineId)?._sum.lineAmount ?? 0);
        const orderLineAmount = Number(orderLine.grossAmount) || roundMoney(Number(orderLine.unitPrice) * Number(orderLine.quantity));
        const groupAmount = calculateShipmentAmount(Number(orderLine.quantity), orderLineAmount, Number(orderLine.shippedQty), previousAmount, quantity);
        let allocated = 0;
        shipmentLines.forEach((item, itemIndex) => {
          const amount = itemIndex === shipmentLines.length - 1 ? roundMoney(groupAmount - allocated) : roundMoney(groupAmount * Number(item.line.quantity) / quantity);
          lineAmounts.set(item.index, amount);
          allocated = roundMoney(allocated + amount);
        });
      }
      const actor = actorUserId ? await tx.user.findUnique({ where: { id: actorUserId } }) : null;
      const totalAmount = roundMoney(lines.reduce((sum, _line, index) => sum + (lineAmounts.get(index) ?? 0), 0));
      const shipment = await tx.salesShipment.create({ data: { documentNo: `OUT-${Date.now()}`, companyId: order.companyId, salesOrderId: order.id, customerId: order.customerId, shippedById: actor?.id, shippedByName: actor?.displayName ?? "系统", shippedAt, totalAmount, currencyCode: order.currencyCode, idempotencyKey: key.trim() } });
      for (const [index, line] of lines.entries()) {
        const orderLine = order.lines.find((item) => item.id === line.salesOrderLineId)!;
        await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: order.companyId, warehouseId: warehouse.id, locationId: line.locationId, materialId: orderLine.materialId, batchId: line.batchId, unitId: orderLine.unitId, quantityDelta: -Number(line.quantity), transactionType: InventoryTransactionType.SALES_SHIPMENT, sourceDocumentType: "SALES_SHIPMENT", sourceDocumentId: shipment.id, actorUserId });
        await tx.salesShipmentLine.create({ data: { shipmentId: shipment.id, salesOrderLineId: orderLine.id, materialId: orderLine.materialId, batchId: line.batchId, locationId: line.locationId, quantity: Number(line.quantity), unitId: orderLine.unitId, unitPrice: orderLine.unitPrice, lineAmount: lineAmounts.get(index) ?? 0 } });
        await tx.salesOrderLine.update({ where: { id: orderLine.id }, data: { shippedQty: { increment: Number(line.quantity) } } });
      }
      const refreshed = await tx.salesOrderLine.findMany({ where: { orderId: order.id } });
      const complete = refreshed.every((item) => Number(item.shippedQty) >= Number(item.quantity) - 0.000001);
      await tx.salesOrder.update({ where: { id: order.id }, data: { status: complete ? "SHIPPED" : "PARTIALLY_SHIPPED", actualShipmentAt: shippedAt } });
      return tx.salesShipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { customer: true, shippedBy: true, order: true, lines: { include: { salesOrderLine: true } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async returnSales(shipmentId: string, lines: { shipmentLineId: string; quantity: number }[], key: string | undefined, actorUserId?: string) {
    if (!key || !lines?.length) throw new BadRequestException("销售退货必须提供幂等键和来源发货明细");
    const shipment = await this.prisma.salesShipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { lines: true, order: true } });
    const warehouse = await this.prisma.warehouse.findFirstOrThrow();
    return this.prisma.$transaction(async (tx) => {
      const result = [];
      for (const [index, line] of lines.entries()) {
        const source = shipment.lines.find((item) => item.id === line.shipmentLineId);
        if (!source || line.quantity <= 0 || Number(source.returnedQty) + line.quantity > Number(source.quantity)) throw new BadRequestException("退货数量超过原发货数量");
        const issue = await tx.inventoryTransaction.findFirstOrThrow({ where: { sourceDocumentType: "SALES_SHIPMENT", sourceDocumentId: shipment.id, batchId: source.batchId }, orderBy: { postedAt: "desc" } });
        result.push(await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: shipment.companyId, warehouseId: warehouse.id, locationId: source.locationId, materialId: source.materialId, batchId: source.batchId, unitId: source.unitId, quantityDelta: line.quantity, unitCostCny: Number(issue.unitCostCny), transactionType: InventoryTransactionType.SALES_RETURN, sourceDocumentType: "SALES_RETURN", sourceDocumentId: shipment.id, actorUserId }));
        await tx.salesShipmentLine.update({ where: { id: source.id }, data: { returnedQty: { increment: line.quantity } } });
        await tx.salesOrderLine.update({ where: { id: source.salesOrderLineId }, data: { returnedQty: { increment: line.quantity } } });
      }
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  cancelPurchase(id: string) { return this.prisma.purchaseOrder.update({ where: { id, status: { in: ["DRAFT", "CONFIRMED"] } }, data: { status: "CANCELLED" } }); }
  cancelSales(id: string) { return this.prisma.salesOrder.update({ where: { id, status: { in: ["DRAFT", "CONFIRMED"] } }, data: { status: "CANCELLED" } }); }

  updateSalesShipment(id: string, body: { expectedShipmentAt?: string; actualShipmentAt?: string }) { return this.prisma.salesOrder.update({ where: { id }, data: { expectedShipmentAt: body.expectedShipmentAt ? new Date(body.expectedShipmentAt) : undefined, actualShipmentAt: body.actualShipmentAt ? new Date(body.actualShipmentAt) : undefined }, include: { customer: true, lines: true } }); }

  // 销售单不再需要“开始生产”：生产单创建时通过 ProductionOrderLink 关联多张销售单（见 production.ts）。
}

@Controller("purchase-orders")
@Permissions("purchase.view")
export class PurchaseOrdersController {
  constructor(private readonly service: OrdersService) {}
  @Get() list(@Query() query: PaginationQuery) { return this.service.purchaseOrders(query); }
  @Post() @Permissions("purchase.manage") create(@Body() body: PurchaseBody) { return this.service.createPurchase(body); }
  @Patch(":id/confirm") @Permissions("purchase.manage") confirm(@Param("id") id: string) { return this.service.confirmPurchase(id); }
  @Patch(":id/complete") @Permissions("purchase.manage") complete(@Param("id") id: string) { return this.service.completePurchase(id); }
  @Post(":id/receipts") @Permissions("inventory.receive") receive(@Param("id") id: string, @Body() body: { lines: ReceiptLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.receivePurchase(id, body.lines, key, req.user?.sub); }
  @Post(":id/returns") @Permissions("purchase.return") returnPurchase(@Param("id") id: string, @Body() body: { lines: PurchaseReturnLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.returnPurchase(id, body.lines, key, req.user?.sub); }
  @Patch(":id/cancel") @Permissions("purchase.manage") cancel(@Param("id") id: string) { return this.service.cancelPurchase(id); }
  @Delete(":id") @Permissions("purchase.manage") remove(@Param("id") id: string) { return this.service.removePurchase(id); }
}

@Controller("sales-orders")
@Permissions("sales.view")
export class SalesOrdersController {
  constructor(private readonly service: OrdersService) {}
  @Get() list(@Query() query: PaginationQuery) { return this.service.salesOrders(query); }
  @Get("options") options(@Query("q") q?: string, @Query("take") take?: string, @Query("status") status?: string) { return this.service.salesOrderOptions(q, take, status); }
  @Get("shipment-bootstrap") @Permissions("sales.ship") shipmentBootstrap() { return this.service.shipmentBootstrap(); }
  @Get("shipments") shipments(@Query() query: PaginationQuery) { return this.service.salesShipments(query); }
  @Get(":id") detail(@Param("id") id: string) { return this.service.salesOrderDetail(id); }
  @Get("shipments/:id") shipment(@Param("id") id: string) { return this.service.salesShipment(id); }
  @Post() @Permissions("sales.manage") create(@Body() body: SalesBody) { return this.service.createSales(body); }
  @Patch(":id/confirm") @Permissions("sales.manage") confirm(@Param("id") id: string) { return this.service.confirmSales(id); }
  @Patch(":id/cancel") @Permissions("sales.manage") cancel(@Param("id") id: string) { return this.service.cancelSales(id); }
  @Post(":id/shipments") @Permissions("sales.ship") ship(@Param("id") id: string, @Body() body: ShipmentBody, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.shipSales(id, body, key, req.user?.sub); }
  @Post("shipments/:shipmentId/returns") @Permissions("sales.return") returnSales(@Param("shipmentId") shipmentId: string, @Body() body: { lines: { shipmentLineId: string; quantity: number }[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.returnSales(shipmentId, body.lines, key, req.user?.sub); }
  @Patch(":id") @Permissions("sales.manage") updateShipment(@Param("id") id: string, @Body() body: { expectedShipmentAt?: string; actualShipmentAt?: string }) { return this.service.updateSalesShipment(id, body); }
  @Delete(":id") @Permissions("sales.manage") remove(@Param("id") id: string) { return this.service.removeSales(id); }
  @Delete("shipments/:id") @Permissions("sales.manage") removeShipment(@Param("id") id: string) { return this.service.removeShipment(id); }
}
