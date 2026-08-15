import { Controller, Get, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async inventory() {
    const [balances, batches, materials, costs] = await Promise.all([this.prisma.inventoryBalance.findMany(), this.prisma.inventoryBatch.findMany(), this.prisma.material.findMany(), this.prisma.materialCost.findMany()]);
    const batchMap = new Map(batches.map((item) => [item.id, item]));
    const materialMap = new Map(materials.map((item) => [item.id, item]));
    const costMap = new Map(costs.map((item) => [item.materialId, item]));
    return balances.map((balance) => ({ ...balance, batch: batchMap.get(balance.batchId), material: materialMap.get(balance.materialId), movingAverageCostCny: costMap.get(balance.materialId)?.movingAverageCostCny ?? 0, inventoryAmountCny: Number(balance.onHandQty) * Number(costMap.get(balance.materialId)?.movingAverageCostCny ?? 0) }));
  }

  async purchases() { const orders = await this.prisma.purchaseOrder.findMany({ include: { supplier: true, lines: true }, orderBy: { orderDate: "desc" } }); return orders.map((order) => ({ documentNo: order.documentNo, supplier: order.supplier.name, status: order.status, expectedDate: order.expectedDate, totalAmount: order.totalAmount, currencyCode: order.currencyCode, orderedQty: order.lines.reduce((sum, line) => sum + Number(line.quantity), 0), receivedQty: order.lines.reduce((sum, line) => sum + Number(line.receivedQty), 0), overdue: Boolean(order.expectedDate && order.expectedDate < new Date() && order.status !== "RECEIVED") })); }
  async sales() { const orders = await this.prisma.salesOrder.findMany({ include: { customer: true, lines: true }, orderBy: { orderDate: "desc" } }); return orders.map((order) => ({ documentNo: order.documentNo, customer: order.customer.name, status: order.status, expectedShipmentAt: order.expectedShipmentAt, actualShipmentAt: order.actualShipmentAt, totalAmount: order.totalAmount, currencyCode: order.currencyCode, orderedQty: order.lines.reduce((sum, line) => sum + Number(line.quantity), 0), shippedQty: order.lines.reduce((sum, line) => sum + Number(line.shippedQty), 0), overdue: Boolean(order.expectedShipmentAt && order.expectedShipmentAt < new Date() && order.status !== "SHIPPED") })); }
  async production() { const orders = await this.prisma.productionOrder.findMany({ include: { materials: true, outputLines: true }, orderBy: { createdAt: "desc" } }); const transactions = await this.prisma.inventoryTransaction.findMany({ where: { sourceDocumentType: "PRODUCTION_ORDER" } }); return orders.map((order) => { const actualCost = -transactions.filter((item) => item.sourceDocumentId === order.id && ["PRODUCTION_ISSUE", "PRODUCTION_RETURN"].includes(item.transactionType)).reduce((sum, item) => sum + Number(item.amountDeltaCny), 0); return { documentNo: order.documentNo, status: order.status, plannedQty: order.outputLines.reduce((sum, item) => sum + Number(item.plannedQty), 0), completedQty: order.outputLines.reduce((sum, item) => sum + Number(item.completedQty), 0), requiredQty: order.materials.reduce((sum, item) => sum + Number(item.requiredQty), 0), actualIssueQty: order.materials.reduce((sum, item) => sum + Number(item.issuedQty) - Number(item.returnedQty), 0), materialCostCny: actualCost }; }); }
  async alerts() { const today = new Date(); const in30Days = new Date(Date.now() + 30 * 86400000); const [expiring, expired, locked, pendingImports, lowMaterials] = await Promise.all([this.prisma.inventoryBatch.findMany({ where: { expiryDate: { gte: today, lte: in30Days }, batchStatus: "AVAILABLE" } }), this.prisma.inventoryBatch.findMany({ where: { expiryDate: { lt: today } } }), this.prisma.inventoryBatch.findMany({ where: { batchStatus: { in: ["LOCKED", "FROZEN", "QUARANTINE"] } } }), this.prisma.importTask.count({ where: { status: "NEEDS_REVIEW" } }), this.prisma.material.findMany({ where: { minStockQty: { not: null } } })]); const balances = await this.prisma.inventoryBalance.groupBy({ by: ["materialId"], _sum: { availableQty: true } }); const qtyMap = new Map(balances.map((item) => [item.materialId, Number(item._sum.availableQty ?? 0)])); return { expiring, expired, locked, pendingImports, lowStock: lowMaterials.filter((material) => (qtyMap.get(material.id) ?? 0) < Number(material.minStockQty)).map((material) => ({ materialId: material.id, code: material.code, name: material.name, availableQty: qtyMap.get(material.id) ?? 0, minStockQty: material.minStockQty })) }; }
}

@Controller("reports")
@Permissions("report.view")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Get("inventory") inventory() { return this.service.inventory(); }
  @Get("purchases") purchases() { return this.service.purchases(); }
  @Get("sales") sales() { return this.service.sales(); }
  @Get("production") production() { return this.service.production(); }
  @Get("alerts") alerts() { return this.service.alerts(); }
}
