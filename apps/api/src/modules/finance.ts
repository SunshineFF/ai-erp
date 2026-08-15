import { BadRequestException, Body, Controller, Get, Injectable, Param, Patch, Post } from "@nestjs/common";
import { BillStatus, BillType, CashFlowType } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";

type CashFlowBody = { occurredAt: string; flowType: CashFlowType; amount: number; currencyCode?: string; description: string };
type ReimbursementBody = { occurredAt: string; expenseType: string; amount: number; currencyCode?: string; description: string };

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}
  private company() { return this.prisma.company.findFirstOrThrow(); }
  cashFlows() { return this.prisma.cashFlow.findMany({ orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] }); }
  async createCashFlow(body: CashFlowBody) { if (body.amount <= 0) throw new BadRequestException("现金流水金额必须大于零"); const company = await this.company(); return this.prisma.cashFlow.create({ data: { documentNo: `CF-${Date.now()}`, companyId: company.id, occurredAt: new Date(body.occurredAt), flowType: body.flowType, amount: body.amount, currencyCode: body.currencyCode ?? company.baseCurrencyCode, description: body.description } }); }
  reimbursements() { return this.prisma.reimbursement.findMany({ orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] }); }
  async createReimbursement(body: ReimbursementBody) { if (body.amount <= 0) throw new BadRequestException("报销金额必须大于零"); const company = await this.company(); return this.prisma.reimbursement.create({ data: { documentNo: `RB-${Date.now()}`, companyId: company.id, occurredAt: new Date(body.occurredAt), expenseType: body.expenseType, amount: body.amount, currencyCode: body.currencyCode ?? company.baseCurrencyCode, description: body.description } }); }
  bills() { return this.prisma.bill.findMany({ include: { supplier: true, customer: true }, orderBy: [{ billDate: "desc" }, { createdAt: "desc" }] }); }
  async createPurchaseBill(orderId: string) {
    const order = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { supplier: true } });
    const existing = await this.prisma.bill.findUnique({ where: { sourceDocumentType_sourceDocumentId: { sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: order.id } } });
    if (existing) return existing;
    return this.prisma.bill.create({ data: { billNo: `BILL-P-${Date.now()}`, companyId: order.companyId, billType: BillType.PAYABLE, supplierId: order.supplierId, sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: order.id, sourceDocumentNo: order.documentNo, billDate: order.orderDate, currencyCode: order.currencyCode, amount: order.totalAmount, description: `采购订单 ${order.documentNo}` }, include: { supplier: true } });
  }
  async createSalesBill(orderId: string) {
    const order = await this.prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true } });
    const existing = await this.prisma.bill.findUnique({ where: { sourceDocumentType_sourceDocumentId: { sourceDocumentType: "SALES_ORDER", sourceDocumentId: order.id } } });
    if (existing) return existing;
    return this.prisma.bill.create({ data: { billNo: `BILL-S-${Date.now()}`, companyId: order.companyId, billType: BillType.RECEIVABLE, customerId: order.customerId, sourceDocumentType: "SALES_ORDER", sourceDocumentId: order.id, sourceDocumentNo: order.documentNo, billDate: order.orderDate, currencyCode: order.currencyCode, amount: order.totalAmount, description: `销售订单 ${order.documentNo}` }, include: { customer: true } });
  }
  async createBillsBatch(body: { purchaseOrderIds?: string[]; salesOrderIds?: string[] }) {
    const purchaseBills = [];
    const salesBills = [];
    for (const id of [...new Set(body.purchaseOrderIds ?? [])]) purchaseBills.push(await this.createPurchaseBill(id));
    for (const id of [...new Set(body.salesOrderIds ?? [])]) salesBills.push(await this.createSalesBill(id));
    return { purchaseBills, salesBills };
  }
  updateBill(id: string, body: { status?: BillStatus; dueDate?: string }) { return this.prisma.bill.update({ where: { id }, data: { status: body.status, dueDate: body.dueDate ? new Date(body.dueDate) : undefined }, include: { supplier: true, customer: true } }); }
}

@Controller("finance")
@Permissions("finance.view")
export class FinanceController {
  constructor(private readonly service: FinanceService) {}
  @Get("cash-flows") cashFlows() { return this.service.cashFlows(); }
  @Post("cash-flows") @Permissions("finance.manage") createCashFlow(@Body() body: CashFlowBody) { return this.service.createCashFlow(body); }
  @Get("reimbursements") reimbursements() { return this.service.reimbursements(); }
  @Post("reimbursements") @Permissions("finance.manage") createReimbursement(@Body() body: ReimbursementBody) { return this.service.createReimbursement(body); }
  @Get("bills") bills() { return this.service.bills(); }
  @Post("bills/batch") @Permissions("finance.manage") createBillsBatch(@Body() body: { purchaseOrderIds?: string[]; salesOrderIds?: string[] }) { return this.service.createBillsBatch(body); }
  @Patch("bills/:id") @Permissions("finance.manage") updateBill(@Param("id") id: string, @Body() body: any) { return this.service.updateBill(id, body); }
  @Post("bills/purchase/:orderId") @Permissions("finance.manage") createPurchaseBill(@Param("orderId") orderId: string) { return this.service.createPurchaseBill(orderId); }
  @Post("bills/sales/:orderId") @Permissions("finance.manage") createSalesBill(@Param("orderId") orderId: string) { return this.service.createSalesBill(orderId); }
}
