import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ImportTaskStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import * as readExcelModule from "read-excel-file/node";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { InventoryPostingService } from "./posting";
import { PaginationQuery, pageResult, parsePagination } from "../pagination";
import { importTaskText } from "../status-text";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type UploadedDocument = { originalname: string; mimetype: string; size: number; buffer: Buffer };
type ParsedItem = { sheetName: string; rowNo: number; parsedData: Record<string, unknown>; confidence: number; needsConfirmation: boolean; validationErrors: string[] };

const requiredBySheet: Record<string, string[]> = {
  "期初库存": ["物料编码", "内部批次号", "库位", "数量", "单位", "生产日期", "到期日期"],
  "历史订单": ["单据类型", "单据编号", "单据日期", "往来单位", "物料编码", "数量", "单位", "交易币种"],
  "财务流水": ["流水日期", "流水编号", "收支类型", "交易币种", "交易金额"],
};
const readXlsxFile = readExcelModule.default;

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService, private readonly posting: InventoryPostingService) {}

  async list(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.importTask.findMany({ include: { file: true, items: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.importTask.count()]); return pageResult(items.map(importTaskText), total, page, pageSize); }
  get(id: string) { return this.prisma.importTask.findUniqueOrThrow({ where: { id }, include: { file: true, items: true } }).then(importTaskText); }
  async remove(id: string) { const task = ensureFound(await this.prisma.importTask.findUnique({ where: { id }, include: { file: true } }), "导入任务不存在"); if (task.status === "CONFIRMED") deleteConflict(`导入任务“${task.file.originalName}”已确认，无法删除`, [{ resource: "已确认导入", count: 1 }]); const filePath = join(process.cwd(), task.file.storagePath); const backup = await readFile(filePath); await unlink(filePath); try { await this.prisma.$transaction(async (tx) => { await tx.importTaskItem.deleteMany({ where: { importTaskId: id } }); await tx.importTask.delete({ where: { id } }); await tx.documentFile.delete({ where: { id: task.documentFileId } }); }); } catch (error) { await mkdir(dirname(filePath), { recursive: true }); await writeFile(filePath, backup); throw error; } return deleted(id); }
  async file(id: string, actorUserId?: string) { const task = await this.prisma.importTask.findUniqueOrThrow({ where: { id }, include: { file: true } }); await this.prisma.auditLog.create({ data: { companyId: task.companyId, actorUserId, action: "import.file_download", resourceType: "DocumentFile", resourceId: task.file.id } }); return { ...task.file, absolutePath: join(process.cwd(), task.file.storagePath) }; }

  private async parseWorkbook(buffer: Buffer): Promise<ParsedItem[]> {
    const result: ParsedItem[] = [];
    const sheets = await readExcelModule.readSheetNames(buffer);
    for (const sheetName of sheets) {
      const rows = (await readXlsxFile(buffer, { sheet: sheetName })).map((row) => row.map((value) => value instanceof Date ? value.toISOString().slice(0, 10) : value ?? ""));
      const required = requiredBySheet[sheetName] ?? [];
      const headerIndex = rows.findIndex((row) => Array.isArray(row) && required.some((field) => row.includes(field)));
      if (headerIndex < 0) continue;
      const headers = (rows[headerIndex] as unknown[]).map((value) => String(value).trim());
      for (let index = headerIndex + 1; index < rows.length; index += 1) {
        const row = rows[index] as unknown[];
        if (!row?.some((value) => String(value).trim())) continue;
        const parsedData = Object.fromEntries(headers.map((header, column) => [header || `列${column + 1}`, row[column] ?? ""]));
        const validationErrors = required.filter((field) => !String(parsedData[field] ?? "").trim()).map((field) => `缺少必填字段：${field}`);
        result.push({ sheetName, rowNo: index + 1, parsedData, confidence: validationErrors.length ? 0.6 : 0.95, needsConfirmation: true, validationErrors });
      }
    }
    if (!result.length) throw new BadRequestException("未识别到支持的工作表或表头");
    return result;
  }

  async upload(file: UploadedDocument | undefined, targetType: string, actorUserId?: string) {
    if (!file) throw new BadRequestException("请选择要解析的文件");
    const decodedName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const originalName = decodedName.includes("�") ? file.originalname : decodedName;
    const extension = extname(originalName).toLowerCase();
    if (![".xlsx", ".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new BadRequestException("仅支持 XLSX 或 PNG/JPG/WebP");
    const company = await this.prisma.company.findFirstOrThrow();
    const uploadDir = join(process.cwd(), "storage", "imports");
    await mkdir(uploadDir, { recursive: true });
    const storedName = `${randomUUID()}${extension}`;
    await writeFile(join(uploadDir, storedName), file.buffer);
    let items: ParsedItem[] = [];
    let errorMessage: string | undefined;
    try {
      if (extension === ".xlsx") items = await this.parseWorkbook(file.buffer);
      else items = [{ sheetName: "图片识别", rowNo: 1, parsedData: { 原文件名: originalName, 提示: "请人工录入并确认识别字段" }, confidence: 0, needsConfirmation: true, validationErrors: ["当前环境未配置 OCR 服务，需人工确认"] }];
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "解析失败";
    }
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.documentFile.create({ data: { companyId: company.id, originalName, storedName, mimeType: file.mimetype, size: file.size, storagePath: join("storage", "imports", storedName), uploadedById: actorUserId } });
      const task = await tx.importTask.create({ data: { companyId: company.id, documentFileId: document.id, targetType: targetType || "AUTO", status: errorMessage ? ImportTaskStatus.FAILED : ImportTaskStatus.NEEDS_REVIEW, errorMessage, items: { create: items.map((item) => ({ sheetName: item.sheetName, rowNo: item.rowNo, parsedData: item.parsedData as Prisma.InputJsonValue, confidence: item.confidence, needsConfirmation: item.needsConfirmation, validationErrors: item.validationErrors as Prisma.InputJsonValue })) } }, include: { file: true, items: true } });
      await this.posting.audit(tx, company.id, actorUserId, "import.upload", "ImportTask", task.id, { targetType: task.targetType, itemCount: items.length });
      return importTaskText(task);
    });
  }

  async updateItem(taskId: string, itemId: string, parsedData: Record<string, unknown>) {
    await this.prisma.importTask.findFirstOrThrow({ where: { id: taskId, status: "NEEDS_REVIEW" } });
    return this.prisma.importTaskItem.update({ where: { id: itemId }, data: { parsedData: parsedData as Prisma.InputJsonValue, needsConfirmation: false, validationErrors: [] } });
  }

  async confirm(id: string, fieldMapping: Record<string, unknown>, actorUserId?: string) {
    const task = await this.prisma.importTask.findFirstOrThrow({ where: { id, status: "NEEDS_REVIEW" }, include: { items: true } });
    if (task.items.some((item) => item.needsConfirmation || (Array.isArray(item.validationErrors) && item.validationErrors.length))) throw new BadRequestException("仍有待确认或校验失败的数据行");
    const draftDocumentNo = `DRAFT-${Date.now()}`;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.importTask.update({ where: { id }, data: { status: "CONFIRMED", fieldMapping: fieldMapping as Prisma.InputJsonValue, confirmedById: actorUserId, confirmedAt: new Date(), draftDocumentNo }, include: { file: true, items: true } });
      await this.posting.audit(tx, task.companyId, actorUserId, "import.confirm", "ImportTask", task.id, { draftDocumentNo });
      return importTaskText(updated);
    });
  }
}

@Controller("imports")
export class ImportsController {
  constructor(private readonly service: ImportsService) {}
  @Get() @Permissions("import.view") list(@Query() query: PaginationQuery) { return this.service.list(query); }
  @Get(":id") @Permissions("import.view") get(@Param("id") id: string) { return this.service.get(id); }
  @Get(":id/file") @Permissions("import.view") async file(@Param("id") id: string, @Req() req: any, @Res() response: any) { const file = await this.service.file(id, req.user?.sub); response.setHeader("Content-Type", file.mimeType); response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`); createReadStream(file.absolutePath).pipe(response); }
  @Post("upload") @Permissions("import.upload") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 15 * 1024 * 1024 } })) upload(@UploadedFile() file: UploadedDocument | undefined, @Body("targetType") targetType: string, @Req() req: any) { return this.service.upload(file, targetType, req.user?.sub); }
  @Patch(":id/items/:itemId") @Permissions("import.upload") updateItem(@Param("id") id: string, @Param("itemId") itemId: string, @Body() body: { parsedData: Record<string, unknown> }) { return this.service.updateItem(id, itemId, body.parsedData); }
  @Post(":id/confirm") @Permissions("import.confirm") confirm(@Param("id") id: string, @Body() body: { fieldMapping?: Record<string, unknown> }, @Req() req: any) { return this.service.confirm(id, body.fieldMapping ?? {}, req.user?.sub); }
  @Delete(":id") @Permissions("import.upload") remove(@Param("id") id: string) { return this.service.remove(id); }
}
