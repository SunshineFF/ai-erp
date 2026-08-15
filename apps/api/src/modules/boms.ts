import { BadRequestException, Body, Controller, Delete, Get, Header, Injectable, Param, Patch, Post, Req } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";

type BomItemInput = { inputMaterialId: string; requiredQty: number; unitId: string; lossRate?: number };
type CreateBomBody = { outputMaterialId: string; versionNo: string; standardOutputQty: number; outputUnitId: string; effectiveFrom: string; items: BomItemInput[] };

@Injectable()
export class BomsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actorUserId?: string) { const rows = await this.prisma.bom.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } }); const companyId = rows[0]?.companyId ?? (await this.prisma.company.findFirst())?.id; await this.prisma.auditLog.create({ data: { companyId, actorUserId, action: "bom.view", resourceType: "Bom", afterData: { count: rows.length } } }); return rows; }
  async create(body: CreateBomBody) {
    if (!body.items?.length) throw new BadRequestException("BOM 至少需要一行投料");
    const company = await this.prisma.company.findFirstOrThrow();
    return this.prisma.bom.create({ data: { companyId: company.id, outputMaterialId: body.outputMaterialId, versionNo: body.versionNo, standardOutputQty: body.standardOutputQty, outputUnitId: body.outputUnitId, effectiveFrom: new Date(body.effectiveFrom), items: { create: body.items.map((item, index) => ({ lineNo: index + 1, inputMaterialId: item.inputMaterialId, requiredQty: item.requiredQty, unitId: item.unitId, lossRate: item.lossRate ?? 0 })) } }, include: { items: true } });
  }
  async update(id: string, body: Partial<CreateBomBody> & { status?: "DRAFT" | "PENDING_RELEASE" | "EFFECTIVE" | "DISABLED" }) {
    const current = await this.prisma.bom.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (current.status === "EFFECTIVE" && body.status !== "DISABLED") throw new BadRequestException("已生效 BOM 不能覆盖修改，请新建版本");
    return this.prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.bomItem.deleteMany({ where: { bomId: id } });
        await tx.bomItem.createMany({ data: body.items.map((item, index) => ({ bomId: id, lineNo: index + 1, inputMaterialId: item.inputMaterialId, requiredQty: item.requiredQty, unitId: item.unitId, lossRate: item.lossRate ?? 0 })) });
      }
      return tx.bom.update({ where: { id }, data: { versionNo: body.versionNo, standardOutputQty: body.standardOutputQty, effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined, status: body.status }, include: { items: true } });
    });
  }
  async remove(id: string) { const current = await this.prisma.bom.findUniqueOrThrow({ where: { id } }); if (current.status === "EFFECTIVE") return this.prisma.bom.update({ where: { id }, data: { status: "DISABLED" } }); return this.prisma.bom.delete({ where: { id } }); }
  async publish(id: string, actorUserId?: string) { return this.prisma.$transaction(async (tx) => { const current = await tx.bom.findFirstOrThrow({ where: { id, status: { in: ["DRAFT", "PENDING_RELEASE"] } } }); await tx.bom.updateMany({ where: { companyId: current.companyId, outputMaterialId: current.outputMaterialId, status: "EFFECTIVE", id: { not: id } }, data: { status: "DISABLED", effectiveTo: new Date() } }); const bom = await tx.bom.update({ where: { id }, data: { status: "EFFECTIVE" }, include: { items: true } }); await tx.auditLog.create({ data: { companyId: current.companyId, actorUserId, action: "bom.publish", resourceType: "Bom", resourceId: id, afterData: { versionNo: current.versionNo } } }); return bom; }); }
  async copy(id: string, versionNo: string) { const current = await this.prisma.bom.findUniqueOrThrow({ where: { id }, include: { items: true } }); return this.prisma.bom.create({ data: { companyId: current.companyId, outputMaterialId: current.outputMaterialId, versionNo, status: "DRAFT", standardOutputQty: current.standardOutputQty, outputUnitId: current.outputUnitId, effectiveFrom: new Date(), confidentialLevel: current.confidentialLevel, items: { create: current.items.map((item) => ({ lineNo: item.lineNo, inputMaterialId: item.inputMaterialId, requiredQty: item.requiredQty, unitId: item.unitId, lossRate: item.lossRate })) } }, include: { items: true } }); }
  async exportCsv(actorUserId?: string) { const rows = await this.list(actorUserId); await this.prisma.auditLog.create({ data: { companyId: rows[0]?.companyId, actorUserId, action: "bom.export", resourceType: "Bom", afterData: { count: rows.length } } }); const header = "产出物料,版本,状态,行号,投入物料,用量,损耗率"; return [header, ...rows.flatMap((bom) => bom.items.map((item) => [bom.outputMaterialId, bom.versionNo, bom.status, item.lineNo, item.inputMaterialId, item.requiredQty, item.lossRate].map((value) => `\"${String(value).replace(/\"/g, '\"\"')}\"`).join(",")))].join("\n"); }
}

@Controller("boms")
export class BomsController {
  constructor(private readonly service: BomsService) {}
  @Get() @Permissions("bom.view") list(@Req() req: any) { return this.service.list(req.user?.sub); }
  @Get("export/csv") @Permissions("bom.export") @Header("Content-Type", "text/csv; charset=utf-8") exportCsv(@Req() req: any) { return this.service.exportCsv(req.user?.sub); }
  @Post() @Permissions("bom.manage") create(@Body() body: CreateBomBody) { return this.service.create(body); }
  @Patch(":id") @Permissions("bom.manage") update(@Param("id") id: string, @Body() body: any) { return this.service.update(id, body); }
  @Post(":id/publish") @Permissions("bom.publish") publish(@Param("id") id: string, @Req() req: any) { return this.service.publish(id, req.user?.sub); }
  @Post(":id/copy") @Permissions("bom.manage") copy(@Param("id") id: string, @Body() body: { versionNo: string }) { return this.service.copy(id, body.versionNo); }
  @Delete(":id") @Permissions("bom.manage") remove(@Param("id") id: string) { return this.service.remove(id); }
}
