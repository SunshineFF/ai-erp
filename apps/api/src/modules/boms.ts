import { BadRequestException, Body, Controller, Delete, Get, Header, Injectable, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { PaginationQuery, pageResult, parsePagination } from "../pagination";
import { BOM_STATUS_TEXT, bomText } from "../status-text";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type BomItemInput = { inputMaterialId: string; requiredQty: number; unitId: string; lossRate?: number };
type CreateBomBody = { outputMaterialId: string; versionNo: string; standardOutputQty: number; outputUnitId: string; effectiveFrom: string; items: BomItemInput[] };

@Injectable()
export class BomsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: PaginationQuery = {}, actorUserId?: string) { const { page, pageSize, skip, take } = parsePagination(query); const where: any = query.q ? { OR: [{ versionNo: { contains: query.q, mode: "insensitive" } }, { outputMaterialId: { contains: query.q, mode: "insensitive" } }] } : {}; if (query.status) where.status = query.status; const [items, total] = await Promise.all([this.prisma.bom.findMany({ where, include: { items: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.bom.count({ where })]); const companyId = items[0]?.companyId ?? (await this.prisma.company.findFirst())?.id; if (companyId) await this.prisma.auditLog.create({ data: { companyId, actorUserId, action: "bom.view", resourceType: "Bom", afterData: { count: items.length, total } } }); return pageResult(items.map(bomText), total, page, pageSize); }
  async create(body: CreateBomBody) {
    if (!body.items?.length) throw new BadRequestException("BOM 至少需要一行投料");
    if (!body.outputMaterialId?.trim()) throw new BadRequestException("请选择产出物料");
    // 产出物料必须真实存在（普通物料或多属性产品族均可，配方对全部变体通用）；投入物料仍须是普通物料或具体 SKU。
    const outputMaterial = await (this.prisma as any).material.findUnique({ where: { id: body.outputMaterialId }, select: { id: true, isActive: true } });
    if (!outputMaterial) throw new BadRequestException("产出物料不存在，请重新选择");
    const parent = await (this.prisma as any).material.findFirst({ where: { id: { in: body.items.map((item) => item.inputMaterialId) }, parentMaterialId: null, variantEnabled: true }, select: { name: true } });
    if (parent) throw new BadRequestException(`投入物料“${parent.name}”是多属性产品，必须选择具体 SKU`);
    const company = await this.prisma.company.findFirstOrThrow();
    return bomText(await this.prisma.bom.create({ data: { companyId: company.id, outputMaterialId: body.outputMaterialId, versionNo: body.versionNo, standardOutputQty: body.standardOutputQty, outputUnitId: body.outputUnitId, effectiveFrom: new Date(body.effectiveFrom), items: { create: body.items.map((item, index) => ({ lineNo: index + 1, inputMaterialId: item.inputMaterialId, requiredQty: item.requiredQty, unitId: item.unitId, lossRate: item.lossRate ?? 0 })) } }, include: { items: true } }));
  }
  async update(id: string, body: Partial<CreateBomBody> & { status?: "DRAFT" | "PENDING_RELEASE" | "EFFECTIVE" | "DISABLED" }) {
    const current = await this.prisma.bom.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (current.status === "EFFECTIVE" && body.status !== "DISABLED") throw new BadRequestException("已生效 BOM 不能覆盖修改，请新建版本");
    if (body.outputMaterialId !== undefined && !body.outputMaterialId.trim()) throw new BadRequestException("请选择产出物料");
    return this.prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.bomItem.deleteMany({ where: { bomId: id } });
        await tx.bomItem.createMany({ data: body.items.map((item, index) => ({ bomId: id, lineNo: index + 1, inputMaterialId: item.inputMaterialId, requiredQty: item.requiredQty, unitId: item.unitId, lossRate: item.lossRate ?? 0 })) });
      }
      return bomText(await tx.bom.update({ where: { id }, data: { versionNo: body.versionNo, standardOutputQty: body.standardOutputQty, effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined, status: body.status }, include: { items: true } }));
    });
  }
  async remove(id: string) { const current = ensureFound(await this.prisma.bom.findUnique({ where: { id } }), "BOM 不存在"); const [productionOrders, audits] = await Promise.all([this.prisma.productionOrder.count({ where: { bomId: id } }), this.prisma.auditLog.count({ where: { resourceType: "Bom", resourceId: id } })]); if (productionOrders || audits) deleteConflict(`BOM“${current.versionNo}”存在历史引用，无法删除`, [{ resource: "生产订单", count: productionOrders }, { resource: "审计记录", count: audits }].filter((x) => x.count)); await this.prisma.$transaction(async (tx) => { await tx.bomItem.deleteMany({ where: { bomId: id } }); await tx.bom.delete({ where: { id } }); }); return deleted(id); }
  async publish(id: string, actorUserId?: string) { return this.prisma.$transaction(async (tx) => { const current = await tx.bom.findFirstOrThrow({ where: { id, status: { in: ["DRAFT", "PENDING_RELEASE"] } } }); await tx.bom.updateMany({ where: { companyId: current.companyId, outputMaterialId: current.outputMaterialId, status: "EFFECTIVE", id: { not: id } }, data: { status: "DISABLED", effectiveTo: new Date() } }); const bom = await tx.bom.update({ where: { id }, data: { status: "EFFECTIVE" }, include: { items: true } }); await tx.auditLog.create({ data: { companyId: current.companyId, actorUserId, action: "bom.publish", resourceType: "Bom", resourceId: id, afterData: { versionNo: current.versionNo } } }); return bomText(bom); }); }
  async copy(id: string, versionNo: string) { const current = await this.prisma.bom.findUniqueOrThrow({ where: { id }, include: { items: true } }); return bomText(await this.prisma.bom.create({ data: { companyId: current.companyId, outputMaterialId: current.outputMaterialId, versionNo, status: "DRAFT", standardOutputQty: current.standardOutputQty, outputUnitId: current.outputUnitId, effectiveFrom: new Date(), confidentialLevel: current.confidentialLevel, items: { create: current.items.map((item) => ({ lineNo: item.lineNo, inputMaterialId: item.inputMaterialId, requiredQty: item.requiredQty, unitId: item.unitId, lossRate: item.lossRate })) } }, include: { items: true } })); }
  async exportCsv(actorUserId?: string) { const rows = await this.prisma.bom.findMany({ include: { items: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }); await this.prisma.auditLog.create({ data: { companyId: rows[0]?.companyId, actorUserId, action: "bom.export", resourceType: "Bom", afterData: { count: rows.length } } }); const header = "产出物料,版本,状态,行号,投入物料,用量,损耗率"; return [header, ...rows.flatMap((bom) => bom.items.map((item) => [bom.outputMaterialId, bom.versionNo, BOM_STATUS_TEXT[bom.status] ?? bom.status, item.lineNo, item.inputMaterialId, item.requiredQty, item.lossRate].map((value) => `\"${String(value).replace(/\"/g, '\"\"')}\"`).join(",")))].join("\n"); }
}

@Controller("boms")
export class BomsController {
  constructor(private readonly service: BomsService) {}
  @Get() @Permissions("bom.view") list(@Query() query: PaginationQuery, @Req() req: any) { return this.service.list(query, req.user?.sub); }
  @Get("export/csv") @Permissions("bom.export") @Header("Content-Type", "text/csv; charset=utf-8") exportCsv(@Req() req: any) { return this.service.exportCsv(req.user?.sub); }
  @Post() @Permissions("bom.manage") create(@Body() body: CreateBomBody) { return this.service.create(body); }
  @Patch(":id") @Permissions("bom.manage") update(@Param("id") id: string, @Body() body: any) { return this.service.update(id, body); }
  @Post(":id/publish") @Permissions("bom.publish") publish(@Param("id") id: string, @Req() req: any) { return this.service.publish(id, req.user?.sub); }
  @Post(":id/copy") @Permissions("bom.manage") copy(@Param("id") id: string, @Body() body: { versionNo: string }) { return this.service.copy(id, body.versionNo); }
  @Delete(":id") @Permissions("bom.manage") remove(@Param("id") id: string) { return this.service.remove(id); }
}
