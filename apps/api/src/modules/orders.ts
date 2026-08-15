import { BadRequestException, Body, Controller, Get, Headers, Injectable, Param, Patch, Post, Req } from "@nestjs/common";
import { InventoryTransactionType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { InventoryPostingService } from "./posting";
import { calculateLineAmounts, roundMoney } from "../domain";

type OrderLineInput = { materialId: string; quantity: number; unitId: string; unitPrice: number; taxRateId?: string; batchNo?: string; supplierBatchNo?: string; productionDate?: string; expiryDate?: string };
type MoneyFields = { currencyCode?: string; exchangeRate?: number; exchangeRateDate?: string; taxRateId?: string; priceIncludesTax?: boolean };
type PurchaseBody = MoneyFields & { supplierId: string; orderDate?: string; expectedDate?: string; remark?: string; lines: OrderLineInput[] };
type SalesBody = MoneyFields & { customerId: string; orderDate?: string; expectedShipmentAt?: string; actualShipmentAt?: string; remark?: string; lines: OrderLineInput[] };
type ReceiptLine = { orderLineId: string; quantity: number; locationId?: string; batchNo?: string; supplierBatchNo?: string; productionDate?: string; expiryDate?: string };
type ShipmentLine = { salesOrderLineId: string; batchId: string; locationId: string; quantity: number };
type PurchaseReturnLine = { orderLineId: string; batchId: string; locationId: string; quantity: number };

function requireLines(lines: OrderLineInput[], documentName: string) { if (!lines?.length) throw new BadRequestException(`${documentName}至少需要一行物料`); if (lines.some((line) => line.quantity <= 0 || line.unitPrice < 0)) throw new BadRequestException("物料数量必须大于零，单价不能为负数"); }

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly posting: InventoryPostingService) {}
  private company() { return this.prisma.company.findFirstOrThrow(); }
  purchaseOrders() { return this.prisma.purchaseOrder.findMany({ include: { supplier: true, lines: true }, orderBy: { createdAt: "desc" } }); }
  salesOrders() { return this.prisma.salesOrder.findMany({ include: { customer: true, lines: true, shipments: { include: { lines: true } } }, orderBy: { createdAt: "desc" } }); }

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
      const taxRate = Number(rates.find((item) => item.id === taxRateId)?.rate ?? 0);
      const amounts = calculateLineAmounts(line.quantity, line.unitPrice, taxRate, body.priceIncludesTax !== false, exchangeRate!);
      return { ...line, taxRateId, taxRateSnapshot: taxRate, ...amounts };
    });
    const netAmount = roundMoney(mapped.reduce((sum, line) => sum + line.netAmount, 0));
    const taxAmount = roundMoney(mapped.reduce((sum, line) => sum + line.taxAmount, 0));
    const totalAmount = roundMoney(mapped.reduce((sum, line) => sum + line.grossAmount, 0));
    return { currencyCode, exchangeRate, exchangeRateDate, lines: mapped, netAmount, taxAmount, totalAmount, totalAmountCny: roundMoney(totalAmount * exchangeRate) };
  }

  async createPurchase(body: PurchaseBody) {
    requireLines(body.lines, "采购订单");
    const company = await this.company();
    await this.prisma.supplier.findUniqueOrThrow({ where: { id: body.supplierId } });
    const orderDate = body.orderDate ? new Date(body.orderDate) : new Date();
    const money = await this.money(company.id, body, orderDate, body.lines);
    return this.prisma.purchaseOrder.create({ data: { documentNo: `PO-${Date.now()}`, companyId: company.id, supplierId: body.supplierId, orderDate, expectedDate: body.expectedDate ? new Date(body.expectedDate) : undefined, currencyCode: money.currencyCode, exchangeRate: money.exchangeRate, exchangeRateDate: money.exchangeRateDate, taxRateId: body.taxRateId, netAmount: money.netAmount, taxAmount: money.taxAmount, totalAmount: money.totalAmount, totalAmountCny: money.totalAmountCny, remark: body.remark, lines: { create: money.lines.map((line, index) => ({ lineNo: index + 1, materialId: line.materialId, quantity: line.quantity, unitId: line.unitId, unitPrice: line.unitPrice, taxRateId: line.taxRateId, taxRateSnapshot: line.taxRateSnapshot, netAmount: line.netAmount, taxAmount: line.taxAmount, grossAmount: line.grossAmount, grossAmountCny: line.grossAmountCny, batchNo: line.batchNo, supplierBatchNo: line.supplierBatchNo, productionDate: line.productionDate ? new Date(line.productionDate) : undefined, expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined })) } }, include: { supplier: true, lines: true } });
  }

  confirmPurchase(id: string) { return this.prisma.purchaseOrder.update({ where: { id, status: "DRAFT" }, data: { status: "CONFIRMED" }, include: { supplier: true, lines: true } }); }

  async completePurchase(id: string) {
    const order = await this.prisma.purchaseOrder.findFirstOrThrow({ where: { id, status: "CONFIRMED" }, include: { supplier: true, lines: true } });
    const [company, warehouse, fallbackLocation] = await Promise.all([this.company(), this.prisma.warehouse.findFirstOrThrow(), this.prisma.location.findFirstOrThrow()]);
    return this.prisma.$transaction(async (tx) => {
      for (const line of order.lines) {
        const material = await tx.material.findUniqueOrThrow({ where: { id: line.materialId } });
        const locationId = material.defaultLocationId ?? fallbackLocation.id;
        const productionDate = line.productionDate ?? new Date();
        const expiryDate = line.expiryDate ?? new Date(productionDate.getTime() + (material.shelfLifeDays ?? 365) * 86400000);
        const batchNo = line.batchNo ?? `${order.documentNo}-${line.lineNo}`;
        if (!line.batchNo || !line.supplierBatchNo || !line.productionDate || !line.expiryDate) throw new BadRequestException("采购入库必须确认内部批次、供应商批号、生产日期和到期日期");
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (expiryDate < today) throw new BadRequestException("已过期批次禁止入库");
        const unitCostCny = Number(line.grossAmountCny) / Number(line.quantity);
        const batch = await tx.inventoryBatch.upsert({ where: { companyId_materialId_batchNo: { companyId: company.id, materialId: line.materialId, batchNo } }, update: {}, create: { companyId: company.id, materialId: line.materialId, batchNo, supplierBatchNo: line.supplierBatchNo, productionDate, expiryDate, supplierName: order.supplier.name, sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: order.id, unitCostCny } });
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
        const batchNo = receipt.batchNo ?? line.batchNo;
        const supplierBatchNo = receipt.supplierBatchNo ?? line.supplierBatchNo;
        const productionDate = receipt.productionDate ? new Date(receipt.productionDate) : line.productionDate;
        const expiryDate = receipt.expiryDate ? new Date(receipt.expiryDate) : line.expiryDate;
        if (!batchNo || !supplierBatchNo || !productionDate || !expiryDate) throw new BadRequestException("采购入库必须填写内部批次、供应商批号、生产日期和到期日期");
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
    const company = await this.company();
    await this.prisma.customer.findUniqueOrThrow({ where: { id: body.customerId } });
    const orderDate = body.orderDate ? new Date(body.orderDate) : new Date();
    const money = await this.money(company.id, body, orderDate, body.lines);
    return this.prisma.salesOrder.create({ data: { documentNo: `SO-${Date.now()}`, companyId: company.id, customerId: body.customerId, orderDate, expectedShipmentAt: body.expectedShipmentAt ? new Date(body.expectedShipmentAt) : undefined, actualShipmentAt: body.actualShipmentAt ? new Date(body.actualShipmentAt) : undefined, currencyCode: money.currencyCode, exchangeRate: money.exchangeRate, exchangeRateDate: money.exchangeRateDate, taxRateId: body.taxRateId, netAmount: money.netAmount, taxAmount: money.taxAmount, totalAmount: money.totalAmount, totalAmountCny: money.totalAmountCny, remark: body.remark, lines: { create: money.lines.map((line, index) => ({ lineNo: index + 1, materialId: line.materialId, quantity: line.quantity, unitId: line.unitId, unitPrice: line.unitPrice, taxRateId: line.taxRateId, taxRateSnapshot: line.taxRateSnapshot, netAmount: line.netAmount, taxAmount: line.taxAmount, grossAmount: line.grossAmount, grossAmountCny: line.grossAmountCny })) } }, include: { customer: true, lines: true } });
  }

  confirmSales(id: string) { return this.prisma.salesOrder.update({ where: { id, status: "DRAFT" }, data: { status: "CONFIRMED" }, include: { customer: true, lines: true } }); }

  async shipSales(id: string, lines: ShipmentLine[], key: string | undefined, actorUserId?: string) {
    if (!key || !lines?.length) throw new BadRequestException("发货必须提供幂等键和批次明细");
    const order = await this.prisma.salesOrder.findFirstOrThrow({ where: { id, status: { in: ["CONFIRMED", "READY", "IN_PRODUCTION", "PARTIALLY_SHIPPED"] } }, include: { lines: true } });
    const warehouse = await this.prisma.warehouse.findFirstOrThrow();
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.salesShipment.findUnique({ where: { idempotencyKey: key } });
      if (previous) return previous;
      const shipment = await tx.salesShipment.create({ data: { documentNo: `SS-${Date.now()}`, companyId: order.companyId, salesOrderId: order.id, idempotencyKey: key } });
      for (const [index, line] of lines.entries()) {
        const orderLine = order.lines.find((item) => item.id === line.salesOrderLineId);
        if (!orderLine || line.quantity <= 0 || Number(orderLine.shippedQty) + line.quantity > Number(orderLine.quantity) + 0.000001) throw new BadRequestException("发货数量超过订单未发数量");
        await this.posting.post(tx, { idempotencyKey: `${key}:${index}`, companyId: order.companyId, warehouseId: warehouse.id, locationId: line.locationId, materialId: orderLine.materialId, batchId: line.batchId, unitId: orderLine.unitId, quantityDelta: -line.quantity, transactionType: InventoryTransactionType.SALES_SHIPMENT, sourceDocumentType: "SALES_SHIPMENT", sourceDocumentId: shipment.id, actorUserId });
        await tx.salesShipmentLine.create({ data: { shipmentId: shipment.id, salesOrderLineId: orderLine.id, materialId: orderLine.materialId, batchId: line.batchId, locationId: line.locationId, quantity: line.quantity, unitId: orderLine.unitId } });
        await tx.salesOrderLine.update({ where: { id: orderLine.id }, data: { shippedQty: { increment: line.quantity } } });
      }
      const refreshed = await tx.salesOrderLine.findMany({ where: { orderId: order.id } });
      const complete = refreshed.every((item) => Number(item.shippedQty) >= Number(item.quantity));
      await tx.salesOrder.update({ where: { id: order.id }, data: { status: complete ? "SHIPPED" : "PARTIALLY_SHIPPED", actualShipmentAt: new Date() } });
      return tx.salesShipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { lines: true } });
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

  async startSalesProduction(id: string) {
    const order = await this.prisma.salesOrder.findFirstOrThrow({ where: { id, status: "DRAFT" }, include: { lines: true } });
    const [company, warehouse, fallbackLocation] = await Promise.all([this.company(), this.prisma.warehouse.findFirstOrThrow(), this.prisma.location.findFirstOrThrow()]);
    return this.prisma.$transaction(async (tx) => {
      const scheduled: any[] = [];
      for (const line of order.lines) {
        const material = await tx.material.findUniqueOrThrow({ where: { id: line.materialId } });
        if (!material.manufacturable) continue;
        const bom = await tx.bom.findFirst({ where: { companyId: company.id, outputMaterialId: line.materialId, status: "EFFECTIVE" }, include: { items: true }, orderBy: { effectiveFrom: "desc" } });
        if (!bom) throw new BadRequestException(`物料 ${material.code} 没有生效 BOM`);
        scheduled.push({ line, material, bom });
      }
      if (!scheduled.length) return tx.salesOrder.update({ where: { id: order.id }, data: { status: "READY" }, include: { customer: true, lines: true } });
      const primary = scheduled[0];
      const productionOrder = await tx.productionOrder.create({ data: { documentNo: `MO-${Date.now()}`, companyId: company.id, warehouseId: warehouse.id, productionType: "MAKE_TO_ORDER", outputMaterialId: primary.line.materialId, bomId: primary.bom.id, bomVersionSnapshot: primary.bom.versionNo, plannedQty: primary.line.quantity, unitId: primary.line.unitId, plannedDate: order.expectedShipmentAt ?? new Date(), targetLocationId: primary.material.defaultLocationId ?? fallbackLocation.id, remark: `来源销售订单 ${order.documentNo}`, sourceSalesOrderId: order.id, sourceSalesOrderLineId: primary.line.id } });
      for (const [index, item] of scheduled.entries()) {
        const outputLine = await tx.productionOutputLine.create({ data: { productionOrderId: productionOrder.id, lineNo: index + 1, materialId: item.line.materialId, bomId: item.bom.id, bomVersionSnapshot: item.bom.versionNo, plannedQty: item.line.quantity, unitId: item.line.unitId, sourceSalesOrderLineId: item.line.id } });
        const ratio = Number(item.line.quantity) / Number(item.bom.standardOutputQty);
        await tx.productionMaterial.createMany({ data: item.bom.items.map((bomItem: any, materialIndex: number) => ({ productionOrderId: productionOrder.id, productionOutputLineId: outputLine.id, lineNo: index * 1000 + materialIndex + 1, materialId: bomItem.inputMaterialId, requiredQty: Number(bomItem.requiredQty) * ratio, unitId: bomItem.unitId, lossRate: bomItem.lossRate })) });
      }
      const salesOrder = await tx.salesOrder.update({ where: { id: order.id }, data: { status: "IN_PRODUCTION" }, include: { customer: true, lines: true } });
      return { salesOrder, productionOrder: await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrder.id }, include: { outputLines: true, materials: true } }) };
    });
  }

  async startSalesProductionBatch(ids: string[]) {
    const results = [];
    for (const id of [...new Set(ids ?? [])]) results.push(await this.startSalesProduction(id));
    return results;
  }
}

@Controller("purchase-orders")
@Permissions("purchase.view")
export class PurchaseOrdersController {
  constructor(private readonly service: OrdersService) {}
  @Get() list() { return this.service.purchaseOrders(); }
  @Post() @Permissions("purchase.manage") create(@Body() body: PurchaseBody) { return this.service.createPurchase(body); }
  @Patch(":id/confirm") @Permissions("purchase.manage") confirm(@Param("id") id: string) { return this.service.confirmPurchase(id); }
  @Patch(":id/complete") @Permissions("purchase.manage") complete(@Param("id") id: string) { return this.service.completePurchase(id); }
  @Post(":id/receipts") @Permissions("inventory.receive") receive(@Param("id") id: string, @Body() body: { lines: ReceiptLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.receivePurchase(id, body.lines, key, req.user?.sub); }
  @Post(":id/returns") @Permissions("purchase.return") returnPurchase(@Param("id") id: string, @Body() body: { lines: PurchaseReturnLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.returnPurchase(id, body.lines, key, req.user?.sub); }
  @Patch(":id/cancel") @Permissions("purchase.manage") cancel(@Param("id") id: string) { return this.service.cancelPurchase(id); }
}

@Controller("sales-orders")
@Permissions("sales.view")
export class SalesOrdersController {
  constructor(private readonly service: OrdersService) {}
  @Get() list() { return this.service.salesOrders(); }
  @Post() @Permissions("sales.manage") create(@Body() body: SalesBody) { return this.service.createSales(body); }
  @Patch(":id/confirm") @Permissions("sales.manage") confirm(@Param("id") id: string) { return this.service.confirmSales(id); }
  @Patch(":id/cancel") @Permissions("sales.manage") cancel(@Param("id") id: string) { return this.service.cancelSales(id); }
  @Post(":id/shipments") @Permissions("sales.ship") ship(@Param("id") id: string, @Body() body: { lines: ShipmentLine[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.shipSales(id, body.lines, key, req.user?.sub); }
  @Post("shipments/:shipmentId/returns") @Permissions("sales.return") returnSales(@Param("shipmentId") shipmentId: string, @Body() body: { lines: { shipmentLineId: string; quantity: number }[] }, @Headers("idempotency-key") key: string | undefined, @Req() req: any) { return this.service.returnSales(shipmentId, body.lines, key, req.user?.sub); }
  @Post("batch/start-production") @Permissions("sales.manage") startProductionBatch(@Body() body: { ids: string[] }) { return this.service.startSalesProductionBatch(body.ids); }
  @Patch(":id") @Permissions("sales.manage") updateShipment(@Param("id") id: string, @Body() body: { expectedShipmentAt?: string; actualShipmentAt?: string }) { return this.service.updateSalesShipment(id, body); }
  @Patch(":id/start-production") @Permissions("sales.manage") startProduction(@Param("id") id: string) { return this.service.startSalesProduction(id); }
}
