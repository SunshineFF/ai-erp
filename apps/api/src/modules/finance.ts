import { BadRequestException, Body, Controller, ConflictException, Delete, Get, Injectable, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { BillStatus, BillType, CashFlowType, Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { MediaStorageService } from "../media/media.service";
import { createdAtFilter, PaginationQuery, pageResult, parsePagination } from "../pagination";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type CashFlowBody = { occurredAt: string; flowType: CashFlowType; amount: number; currencyCode?: string; description: string };
type ReimbursementItemBody = { expenseType: string; amount: number; description?: string };
type UploadedVoucher = { buffer: Buffer; mimetype: string; originalname: string; size: number };
type UploadedCashFlowFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };
type ImportedCashFlow = { occurredAt: Date; documentNo?: string; flowType: CashFlowType; currencyCode: string; amount: number; description: string };
type ReimbursementBody = {
  occurredAt: string;
  currencyCode?: string;
  description?: string;
  items?: ReimbursementItemBody[];
  expenseType?: string;
  amount?: number;
};

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService, private readonly media: MediaStorageService) {}
  private company() { return this.prisma.company.findFirstOrThrow(); }
  private duplicateCashFlow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && JSON.stringify(error.meta?.target ?? "").includes("CashFlow")) throw new BadRequestException("同一时间同一金额只能存在一笔现金流水");
    throw error;
  }
  private cashFlowView<T extends { flowType: CashFlowType; amount: unknown }>(row: T) {
    const amount = Number(row.amount);
    return { ...row, actualAmount: row.flowType === CashFlowType.OUTFLOW ? -amount : amount };
  }
  private readonly reimbursementInclude = { items: { orderBy: { createdAt: "asc" as const }, include: { attachments: { orderBy: { createdAt: "asc" as const } } } }, cashFlows: true };
  async cashFlows(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const where = createdAtFilter(query) ? { createdAt: createdAtFilter(query) } : {}; const [rows, total] = await Promise.all([this.prisma.cashFlow.findMany({ where, include: { reimbursement: { include: this.reimbursementInclude } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.cashFlow.count({ where })]); return pageResult(rows.map((row) => this.cashFlowView(row)), total, page, pageSize); }
  async cashFlow(id: string) { return this.cashFlowView(await this.prisma.cashFlow.findUniqueOrThrow({ where: { id }, include: { reimbursement: { include: this.reimbursementInclude } } })); }
  async createCashFlow(body: CashFlowBody) {
    if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) throw new BadRequestException("现金流水金额必须大于零");
    const company = await this.company();
    const occurredAt = new Date(body.occurredAt);
    if (await this.prisma.cashFlow.findFirst({ where: { companyId: company.id, occurredAt, amount: Number(body.amount) } })) throw new BadRequestException("同一时间同一金额只能存在一笔现金流水");
    try {
      return this.cashFlowView(await this.prisma.cashFlow.create({ data: { documentNo: `CF-${Date.now()}`, companyId: company.id, occurredAt, flowType: body.flowType, amount: Number(body.amount), currencyCode: body.currencyCode ?? company.baseCurrencyCode, description: body.description } }));
    } catch (error) { return this.duplicateCashFlow(error); }
  }
  async reimbursements(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const where = createdAtFilter(query) ? { createdAt: createdAtFilter(query) } : {}; const [items, total] = await Promise.all([this.prisma.reimbursement.findMany({ where, include: this.reimbursementInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.reimbursement.count({ where })]); return pageResult(items, total, page, pageSize); }
  reimbursement(id: string) { return this.prisma.reimbursement.findUniqueOrThrow({ where: { id }, include: this.reimbursementInclude }); }
  async createReimbursement(body: ReimbursementBody) {
    const items = body.items?.length ? body.items : (body.expenseType && body.amount !== undefined ? [{ expenseType: body.expenseType, amount: body.amount, description: body.description }] : []);
    if (!items.length) throw new BadRequestException("报销单至少需要一笔费用明细");
    if (items.some((item) => !item.expenseType?.trim() || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0)) throw new BadRequestException("费用类型不能为空，金额必须大于零");
    const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);
    const company = await this.company();
    const reimbursementNo = `RB-${Date.now()}`;
    const cashFlowNo = `CF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
      const reimbursement = await tx.reimbursement.create({
        data: {
          documentNo: reimbursementNo,
          companyId: company.id,
          occurredAt: new Date(body.occurredAt),
          expenseType: items.length === 1 ? items[0].expenseType : "多笔费用",
          amount: totalAmount,
          currencyCode: body.currencyCode ?? company.baseCurrencyCode,
          description: body.description?.trim() || items.map((item) => item.description).filter(Boolean).join("；") || "费用报销",
          items: { create: items.map((item) => ({ expenseType: item.expenseType.trim(), amount: Number(item.amount), description: item.description?.trim() || null })) },
        },
        include: { items: { orderBy: { createdAt: "asc" }, include: { attachments: true } } },
      });
      const occurredAt = new Date(body.occurredAt);
      if (await tx.cashFlow.findFirst({ where: { companyId: company.id, occurredAt, amount: totalAmount } })) throw new BadRequestException("同一时间同一金额只能存在一笔现金流水");
      await tx.cashFlow.create({ data: { documentNo: cashFlowNo, companyId: company.id, occurredAt, flowType: CashFlowType.OUTFLOW, amount: totalAmount, currencyCode: body.currencyCode ?? company.baseCurrencyCode, description: `报销单 ${reimbursement.documentNo}${body.description?.trim() ? `：${body.description.trim()}` : ""}`, reimbursementId: reimbursement.id } });
      return tx.reimbursement.findUniqueOrThrow({ where: { id: reimbursement.id }, include: this.reimbursementInclude });
      });
    } catch (error) { return this.duplicateCashFlow(error); }
  }
  async cashFlowTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("财务流水");
    sheet.columns = [
      { header: "流水日期", key: "occurredAt", width: 15 },
      { header: "流水编号", key: "documentNo", width: 22 },
      { header: "收支类型", key: "flowType", width: 12 },
      { header: "交易币种", key: "currencyCode", width: 12 },
      { header: "交易金额", key: "amount", width: 15 },
      { header: "描述", key: "description", width: 32 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    sheet.getColumn("amount").numFmt = "0.00";
    const instructions = workbook.addWorksheet("填写说明");
    instructions.columns = [{ header: "字段", key: "field", width: 16 }, { header: "填写说明", key: "description", width: 56 }];
    instructions.addRows([
      { field: "流水日期", description: "必填，格式 YYYY-MM-DD，例如 2026-01-01" },
      { field: "流水编号", description: "选填，留空时系统自动生成" },
      { field: "收支类型", description: "必填，填写 INFLOW/OUTFLOW 或 收入/支出" },
      { field: "交易币种", description: "选填，默认 CNY" },
      { field: "交易金额", description: "必填，大于 0，最多两位小数" },
      { field: "描述", description: "必填，填写流水用途或来源" },
    ]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  private cellText(value: ExcelJS.CellValue) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("").trim();
    return String(value).trim();
  }
  private parseImportDate(value: ExcelJS.CellValue) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    const text = this.cellText(value).replace(/[./]/g, "-");
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    if (!match) return undefined;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3]) ? undefined : date;
  }
  async importCashFlows(file?: UploadedCashFlowFile) {
    if (!file) throw new BadRequestException("请选择财务流水 Excel 文件");
    if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException("财务流水导入仅支持 XLSX 文件");
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(file.buffer); } catch { throw new BadRequestException("Excel 文件无法解析"); }
    const sheet = workbook.getWorksheet("财务流水") ?? workbook.worksheets[0];
    if (!sheet) throw new BadRequestException("未找到财务流水工作表");
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => headers.set(this.cellText(cell.value), column));
    const aliases: Record<string, string[]> = { occurredAt: ["流水日期", "发生日期", "日期"], documentNo: ["流水编号", "单据编号"], flowType: ["收支类型", "流水类型"], currencyCode: ["交易币种", "币种"], amount: ["交易金额", "金额"], description: ["描述", "说明"] };
    const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, names.map((name) => headers.get(name)).find((column) => column !== undefined)])) as Record<string, number | undefined>;
    const required = ["occurredAt", "flowType", "amount", "description"];
    const missingHeaders = required.filter((key) => !columns[key]).map((key) => aliases[key][0]);
    if (missingHeaders.length) throw new BadRequestException(`Excel 缺少必填列：${missingHeaders.join("、")}`);
    const errors: string[] = [];
    const rows: ImportedCashFlow[] = [];
    const seen = new Set<string>();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const values = Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, column ? row.getCell(column).value : ""])) as Record<string, ExcelJS.CellValue>;
      if (!Object.values(values).some((value) => this.cellText(value))) continue;
      const missing = required.filter((key) => !this.cellText(values[key]));
      if (missing.length) { errors.push(`第${rowNumber}行缺少必填字段：${missing.map((key) => aliases[key][0]).join("、")}`); continue; }
      const occurredAt = this.parseImportDate(values.occurredAt);
      const flowText = this.cellText(values.flowType).toUpperCase();
      const flowType = flowText === "INFLOW" || flowText === "收入" || flowText === "IN" ? CashFlowType.INFLOW : flowText === "OUTFLOW" || flowText === "支出" || flowText === "OUT" ? CashFlowType.OUTFLOW : undefined;
      const amount = Number(this.cellText(values.amount).replace(/,/g, ""));
      const validAmount = Number.isFinite(amount) && amount > 0 && Math.abs(Math.round(amount * 100) - amount * 100) < 1e-8;
      if (!occurredAt) errors.push(`第${rowNumber}行流水日期无效`);
      if (!flowType) errors.push(`第${rowNumber}行收支类型必须是 INFLOW/OUTFLOW 或 收入/支出`);
      if (!validAmount) errors.push(`第${rowNumber}行交易金额必须是大于零且最多两位小数的数字`);
      if (!occurredAt || !flowType || !validAmount) continue;
      const key = `${occurredAt.toISOString().slice(0, 10)}|${amount.toFixed(2)}`;
      if (seen.has(key)) { errors.push(`第${rowNumber}行与本次导入的其他行存在相同日期和金额`); continue; }
      seen.add(key);
      rows.push({ occurredAt, documentNo: this.cellText(values.documentNo) || undefined, flowType, currencyCode: (this.cellText(values.currencyCode) || "CNY").toUpperCase(), amount, description: this.cellText(values.description) });
    }
    if (!rows.length && !errors.length) throw new BadRequestException("Excel 中没有可导入的流水数据");
    if (errors.length) throw new BadRequestException({ message: "财务流水导入校验失败", errors });
    const company = await this.company();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = [];
        for (const [index, row] of rows.entries()) {
          if (await tx.cashFlow.findFirst({ where: { companyId: company.id, occurredAt: row.occurredAt, amount: row.amount } })) throw new BadRequestException(`第${index + 2}行与已有流水存在相同日期和金额`);
          created.push(await tx.cashFlow.create({ data: { documentNo: row.documentNo || `CF-IMP-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`, companyId: company.id, occurredAt: row.occurredAt, flowType: row.flowType, amount: row.amount, currencyCode: row.currencyCode, description: row.description } }));
        }
        return { imported: created.length, rows: created };
      });
    } catch (error) { return this.duplicateCashFlow(error); }
  }
  async uploadReimbursementAttachment(reimbursementId: string, itemId: string, file?: UploadedVoucher, uploadedById?: string) {
    const item = await this.prisma.reimbursementItem.findFirst({ where: { id: itemId, reimbursementId } });
    if (!item) throw new BadRequestException("费用明细不存在");
    if (!file) throw new BadRequestException("请选择支付凭证");
    const stored = await this.media.upload({ buffer: file.buffer, contentType: file.mimetype, originalName: file.originalname, size: file.size }, `reimbursements/${reimbursementId}/${itemId}`);
    return this.prisma.reimbursementAttachment.create({ data: { reimbursementItemId: itemId, originalName: file.originalname, objectKey: stored.key, url: stored.url, mimeType: file.mimetype, size: file.size, storageProvider: stored.provider, uploadedById } });
  }
  async removeReimbursementAttachment(reimbursementId: string, itemId: string, attachmentId: string) {
    const attachment = await this.prisma.reimbursementAttachment.findFirst({ where: { id: attachmentId, reimbursementItemId: itemId, reimbursementItem: { reimbursementId } } });
    if (!attachment) throw new BadRequestException("支付凭证不存在");
    await this.media.withRemoved({ key: attachment.objectKey, url: attachment.url, provider: attachment.storageProvider }, () => this.prisma.reimbursementAttachment.delete({ where: { id: attachment.id } }));
    return { ok: true };
  }
  async bills(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const partner = query.partnerId?.split(":"); const where: any = { ...(createdAtFilter(query) ? { createdAt: createdAtFilter(query) } : {}), ...(partner?.[0] === "customer" ? { customerId: partner[1] } : partner?.[0] === "supplier" ? { supplierId: partner[1] } : {}) }; const [items, total] = await Promise.all([this.prisma.bill.findMany({ where, include: { supplier: true, customer: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.bill.count({ where })]); return pageResult(items, total, page, pageSize); }
  async billCandidates() { const existing = await this.prisma.bill.findMany({ select: { sourceDocumentType: true, sourceDocumentId: true } }); const purchaseIds = existing.filter((item) => item.sourceDocumentType === "PURCHASE_ORDER").map((item) => item.sourceDocumentId); const salesIds = existing.filter((item) => item.sourceDocumentType === "SALES_ORDER").map((item) => item.sourceDocumentId); const [purchases, sales] = await Promise.all([this.prisma.purchaseOrder.findMany({ where: { id: { notIn: purchaseIds } }, select: { id: true, documentNo: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), this.prisma.salesOrder.findMany({ where: { id: { notIn: salesIds } }, select: { id: true, documentNo: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })]); return { purchases, sales }; }
  async removeCashFlow(id: string) { const row = ensureFound(await this.prisma.cashFlow.findUnique({ where: { id } }), "现金流水不存在"); if (row.reimbursementId) deleteConflict("该流水由报销单生成，不能单独删除", [{ resource: "报销单", count: 1 }]); await this.prisma.cashFlow.delete({ where: { id } }); return deleted(id); }
  async removeReimbursement(id: string) { const row = ensureFound(await this.prisma.reimbursement.findUnique({ where: { id }, include: { items: { include: { attachments: true } } } }), "报销单不存在"); const attachments = row.items.flatMap((item) => item.attachments); const removeAt = (index: number): Promise<unknown> => index >= attachments.length ? this.prisma.$transaction(async (tx) => { await tx.cashFlow.deleteMany({ where: { reimbursementId: id } }); await tx.reimbursementItem.deleteMany({ where: { reimbursementId: id } }); await tx.reimbursement.delete({ where: { id } }); }) : this.media.withRemoved({ key: attachments[index].objectKey, url: attachments[index].url, provider: attachments[index].storageProvider }, () => removeAt(index + 1)); await removeAt(0); return deleted(id); }
  async removeBill(id: string) { const bill = ensureFound(await this.prisma.bill.findUnique({ where: { id } }), "账单不存在"); if (bill.status !== BillStatus.OPEN) throw new ConflictException({ code: "DELETE_CONFLICT", message: `账单“${bill.billNo}”已结算，无法删除`, dependencies: [{ resource: "结算记录", count: 1 }], suggestion: "请先冲销结算，再删除账单" }); await this.prisma.bill.delete({ where: { id } }); return deleted(id); }
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
  @Get("cash-flows") cashFlows(@Query() query: PaginationQuery) { return this.service.cashFlows(query); }
  @Get("cash-flows/template") @Permissions("finance.view") async cashFlowTemplate(@Res() response: any) { const template = await this.service.cashFlowTemplate(); response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''%E8%B4%A2%E5%8A%A1%E6%B5%81%E6%B0%B4%E5%AF%BC%E5%85%A5%E6%A8%A1%E6%9D%BF.xlsx"); response.send(template); }
  @Get("cash-flows/:id") cashFlow(@Param("id") id: string) { return this.service.cashFlow(id); }
  @Post("cash-flows") @Permissions("finance.manage") createCashFlow(@Body() body: CashFlowBody) { return this.service.createCashFlow(body); }
  @Post("cash-flows/import") @Permissions("finance.manage") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } })) importCashFlows(@UploadedFile() file?: UploadedCashFlowFile) { return this.service.importCashFlows(file); }
  @Get("reimbursements") reimbursements(@Query() query: PaginationQuery) { return this.service.reimbursements(query); }
  @Get("reimbursements/:id") reimbursement(@Param("id") id: string) { return this.service.reimbursement(id); }
  @Post("reimbursements") @Permissions("finance.manage") createReimbursement(@Body() body: ReimbursementBody) { return this.service.createReimbursement(body); }
  @Post("reimbursements/:reimbursementId/items/:itemId/attachments") @Permissions("finance.manage") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } })) uploadAttachment(@Param("reimbursementId") reimbursementId: string, @Param("itemId") itemId: string, @UploadedFile() file?: UploadedVoucher) { return this.service.uploadReimbursementAttachment(reimbursementId, itemId, file); }
  @Delete("reimbursements/:reimbursementId/items/:itemId/attachments/:attachmentId") @Permissions("finance.manage") removeAttachment(@Param("reimbursementId") reimbursementId: string, @Param("itemId") itemId: string, @Param("attachmentId") attachmentId: string) { return this.service.removeReimbursementAttachment(reimbursementId, itemId, attachmentId); }
  @Get("bills") bills(@Query() query: PaginationQuery) { return this.service.bills(query); }
  @Get("bill-candidates") billCandidates() { return this.service.billCandidates(); }
  @Post("bills/batch") @Permissions("finance.manage") createBillsBatch(@Body() body: { purchaseOrderIds?: string[]; salesOrderIds?: string[] }) { return this.service.createBillsBatch(body); }
  @Patch("bills/:id") @Permissions("finance.manage") updateBill(@Param("id") id: string, @Body() body: any) { return this.service.updateBill(id, body); }
  @Post("bills/purchase/:orderId") @Permissions("finance.manage") createPurchaseBill(@Param("orderId") orderId: string) { return this.service.createPurchaseBill(orderId); }
  @Post("bills/sales/:orderId") @Permissions("finance.manage") createSalesBill(@Param("orderId") orderId: string) { return this.service.createSalesBill(orderId); }
  @Delete("cash-flows/:id") @Permissions("finance.manage") removeCashFlow(@Param("id") id: string) { return this.service.removeCashFlow(id); }
  @Delete("reimbursements/:id") @Permissions("finance.manage") removeReimbursement(@Param("id") id: string) { return this.service.removeReimbursement(id); }
  @Delete("bills/:id") @Permissions("finance.manage") removeBill(@Param("id") id: string) { return this.service.removeBill(id); }
}
