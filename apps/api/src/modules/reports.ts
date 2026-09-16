import { Controller, Get, Injectable, Query } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { PaginationQuery, pageResult, parsePagination } from "../pagination";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async inventory(query: PaginationQuery = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const [balances, total] = await Promise.all([this.prisma.inventoryBalance.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.inventoryBalance.count()]);
    const materialIds = [...new Set(balances.map((item) => item.materialId))]; const batchIds = [...new Set(balances.map((item) => item.batchId))];
    const [batches, materials, costs] = await Promise.all([this.prisma.inventoryBatch.findMany({ where: { id: { in: batchIds } } }), this.prisma.material.findMany({ where: { id: { in: materialIds } } }), this.prisma.materialCost.findMany({ where: { materialId: { in: materialIds } } })]);
    const batchMap = new Map(batches.map((item) => [item.id, item]));
    const materialMap = new Map(materials.map((item) => [item.id, item]));
    const costMap = new Map(costs.map((item) => [item.materialId, item]));
    return pageResult(balances.map((balance) => ({ ...balance, batch: batchMap.get(balance.batchId), material: materialMap.get(balance.materialId), movingAverageCostCny: costMap.get(balance.materialId)?.movingAverageCostCny ?? 0, inventoryAmountCny: Number(balance.onHandQty) * Number(costMap.get(balance.materialId)?.movingAverageCostCny ?? 0) })), total, page, pageSize);
  }

  async purchases(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [orders, total] = await Promise.all([this.prisma.purchaseOrder.findMany({ include: { supplier: true, lines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.purchaseOrder.count()]); return pageResult(orders.map((order) => ({ documentNo: order.documentNo, supplier: order.supplier.name, status: order.status, expectedDate: order.expectedDate, totalAmount: order.totalAmount, currencyCode: order.currencyCode, orderedQty: order.lines.reduce((sum, line) => sum + Number(line.quantity), 0), receivedQty: order.lines.reduce((sum, line) => sum + Number(line.receivedQty), 0), overdue: Boolean(order.expectedDate && order.expectedDate < new Date() && order.status !== "RECEIVED") })), total, page, pageSize); }
  async sales(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [orders, total] = await Promise.all([this.prisma.salesOrder.findMany({ include: { customer: true, lines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.salesOrder.count()]); return pageResult(orders.map((order) => ({ documentNo: order.documentNo, customer: order.customer.name, status: order.status, expectedShipmentAt: order.expectedShipmentAt, actualShipmentAt: order.actualShipmentAt, totalAmount: order.totalAmount, currencyCode: order.currencyCode, orderedQty: order.lines.reduce((sum, line) => sum + Number(line.quantity), 0), shippedQty: order.lines.reduce((sum, line) => sum + Number(line.shippedQty), 0), overdue: Boolean(order.expectedShipmentAt && order.expectedShipmentAt < new Date() && order.status !== "SHIPPED") })), total, page, pageSize); }
  async production(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [orders, total] = await Promise.all([this.prisma.productionOrder.findMany({ include: { materials: true, outputLines: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.productionOrder.count()]); const ids = orders.map((item) => item.id); const transactions = await this.prisma.inventoryTransaction.findMany({ where: { sourceDocumentType: "PRODUCTION_ORDER", sourceDocumentId: { in: ids } } }); return pageResult(orders.map((order) => { const actualCost = -transactions.filter((item) => item.sourceDocumentId === order.id && ["PRODUCTION_ISSUE", "PRODUCTION_RETURN"].includes(item.transactionType)).reduce((sum, item) => sum + Number(item.amountDeltaCny), 0); return { documentNo: order.documentNo, status: order.status, plannedQty: order.outputLines.reduce((sum, item) => sum + Number(item.plannedQty), 0), completedQty: order.outputLines.reduce((sum, item) => sum + Number(item.completedQty), 0), requiredQty: order.materials.reduce((sum, item) => sum + Number(item.requiredQty), 0), actualIssueQty: order.materials.reduce((sum, item) => sum + Number(item.issuedQty) - Number(item.returnedQty), 0), materialCostCny: actualCost }; }), total, page, pageSize); }
  async alerts() { const today = new Date(); const in30Days = new Date(Date.now() + 30 * 86400000); const [expiring, expired, locked, pendingImports, lowMaterials] = await Promise.all([this.prisma.inventoryBatch.findMany({ where: { expiryDate: { gte: today, lte: in30Days }, batchStatus: "AVAILABLE" } }), this.prisma.inventoryBatch.findMany({ where: { expiryDate: { lt: today } } }), this.prisma.inventoryBatch.findMany({ where: { batchStatus: { in: ["LOCKED", "FROZEN", "QUARANTINE"] } } }), this.prisma.importTask.count({ where: { status: "NEEDS_REVIEW" } }), this.prisma.material.findMany({ where: { minStockQty: { not: null } } })]); const balances = await this.prisma.inventoryBalance.groupBy({ by: ["materialId"], _sum: { availableQty: true } }); const qtyMap = new Map(balances.map((item) => [item.materialId, Number(item._sum.availableQty ?? 0)])); return { expiring, expired, locked, pendingImports, lowStock: lowMaterials.filter((material) => (qtyMap.get(material.id) ?? 0) < Number(material.minStockQty)).map((material) => ({ materialId: material.id, code: material.code, name: material.name, availableQty: qtyMap.get(material.id) ?? 0, minStockQty: material.minStockQty })) }; }
}

@Controller("reports")
@Permissions("report.view")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Get("inventory") inventory(@Query() query: PaginationQuery) { return this.service.inventory(query); }
  @Get("purchases") purchases(@Query() query: PaginationQuery) { return this.service.purchases(query); }
  @Get("sales") sales(@Query() query: PaginationQuery) { return this.service.sales(query); }
  @Get("production") production(@Query() query: PaginationQuery) { return this.service.production(query); }
  @Get("alerts") alerts() { return this.service.alerts(); }
}
