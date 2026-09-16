import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MaterialType, Prisma } from "@prisma/client";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { MediaStorageService } from "../media/media.service";
import { PaginationQuery, pageResult, parsePagination } from "../pagination";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type AttributeSelection = { attributeId: string; valueIds: string[] };
type CreateMaterialBody = { code?: string; name: string; materialType: MaterialType; baseUnitId: string; categoryId: string; shelfLifeDays?: number; expiryWarningDays?: number; purchasable?: boolean; saleable?: boolean; manufacturable?: boolean; defaultLocationId?: string; defaultTaxRateId?: string; variantEnabled?: boolean; attributes?: AttributeSelection[] };
type UploadedImage = { buffer: Buffer; mimetype: string; size: number };

function cartesian<T>(sets: T[][]): T[][] {
  return sets.reduce<T[][]>((result, set) => result.flatMap((prefix) => set.map((item) => [...prefix, item])), [[]]);
}

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService, private readonly media: MediaStorageService) {}

  private async nextCodeWith(client: any, categoryId: string) {
    if (!categoryId?.trim()) throw new BadRequestException("请选择物料分类");
    const company = await client.company.findFirstOrThrow();
    const category = ensureFound(await client.materialCategory.findFirst({ where: { id: categoryId, companyId: company.id } }), "物料分类不存在");
    const prefix = category.code.trim().toUpperCase();
    if (!prefix) throw new BadRequestException("物料分类编码不能为空");
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await client.material.findMany({ where: { companyId: company.id, categoryId, code: { startsWith: prefix } }, select: { code: true } });
    const pattern = new RegExp(`^${escapedPrefix}(\\d{5})$`, "i");
    const maxSequence = existing.reduce((max: number, item: { code: string }) => { const match = pattern.exec(item.code); return match ? Math.max(max, Number(match[1])) : max; }, 0);
    if (maxSequence >= 99999) throw new BadRequestException(`物料分类“${category.name}”的编码序号已达到上限`);
    return `${prefix}${String(maxSequence + 1).padStart(5, "0")}`;
  }

  async list(query: PaginationQuery = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    // 主数据列表展示产品族/普通物料；多属性产品的 SKU 仅通过业务 options 选择。
    const where: any = {
      parentMaterialId: null,
      ...(query.q ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } : {}),
    };
    const [items, total] = await Promise.all([this.prisma.material.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.material.count({ where })]);
    return pageResult(items, total, page, pageSize);
  }

  async bootstrapData() {
    const [units, categories, locations, taxRates, currencies, materials] = await Promise.all([
      this.prisma.unit.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.materialCategory.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.location.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.taxRate.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      (this.prisma as any).material.findMany({ where: { isActive: true }, include: { variantValues: { include: { attributeValue: { include: { attribute: true } } } } }, orderBy: { code: "asc" } }),
    ]);
    return { units, categories, locations, taxRates, currencies, materials };
  }

  async options(q?: string, take?: string, topLevel?: string) {
    // 可选 q/take：供前端远程搜索选择组件使用；不传参数时保持全量返回（兼容移动端等现有调用方）。
    // topLevel=true 时仅返回顶层物料（普通物料 + 多属性产品族，不含 SKU），供 BOM 产出物料等场景直接选产品族。
    const parsedTake = take === undefined ? undefined : Math.min(Math.max(Number(take) || 10, 1), 50);
    return (this.prisma as any).material.findMany({
      where: {
        isActive: true,
        ...(topLevel === "true" ? { parentMaterialId: null } : { OR: [{ parentMaterialId: null, variantEnabled: false }, { parentMaterialId: { not: null } }] }),
        ...(q?.trim() ? { AND: [{ OR: [{ code: { contains: q.trim(), mode: "insensitive" } }, { name: { contains: q.trim(), mode: "insensitive" } }] }] } : {}),
      },
      include: { variantValues: { include: { attributeValue: { include: { attribute: true } } } } },
      orderBy: [{ parentMaterialId: "asc" }, { code: "asc" }],
      ...(parsedTake ? { take: parsedTake } : {}),
    });
  }

  async nextCode(categoryId: string) {
    return this.nextCodeWith(this.prisma, categoryId);
  }

  async create(body: CreateMaterialBody) {
    const company = await this.prisma.company.findFirstOrThrow();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = await this.nextCode(body.categoryId);
      try {
        return await this.prisma.$transaction(async (tx: any) => {
          const parent = await tx.material.create({ data: { companyId: company.id, code, name: body.name, materialType: body.materialType, baseUnitId: body.baseUnitId, categoryId: body.categoryId, shelfLifeDays: body.shelfLifeDays, expiryWarningDays: body.expiryWarningDays ?? 30, purchasable: body.variantEnabled ? false : body.purchasable ?? false, saleable: body.variantEnabled ? false : body.saleable ?? false, manufacturable: body.variantEnabled ? false : body.manufacturable ?? false, defaultLocationId: body.defaultLocationId, defaultTaxRateId: body.defaultTaxRateId, variantEnabled: body.variantEnabled ?? false } });
          if (!body.variantEnabled) return parent;
          const selections = await this.validateSelections(tx, body.attributes ?? [], company.id);
          const combinations = cartesian(selections.map((selection) => selection.values));
          if (!combinations.length) throw new BadRequestException("多属性物料至少需要为每个属性选择一个属性值");
          await tx.materialAttribute.createMany({ data: selections.map((selection) => ({ materialId: parent.id, attributeId: selection.attributeId })) });
          for (const values of combinations) {
            const suffix = values.map((value) => value.code).join("-");
            const sku = await tx.material.create({ data: { companyId: company.id, code: `${parent.code}-${suffix}`, name: `${parent.name} · ${values.map((value: any) => value.name).join(" · ")}`, parentMaterialId: parent.id, categoryId: parent.categoryId, materialType: parent.materialType, baseUnitId: parent.baseUnitId, shelfLifeDays: parent.shelfLifeDays, expiryWarningDays: parent.expiryWarningDays, purchasable: body.purchasable ?? false, saleable: body.saleable ?? false, manufacturable: body.manufacturable ?? false, defaultLocationId: parent.defaultLocationId, defaultTaxRateId: parent.defaultTaxRateId } });
            await tx.materialVariantValue.createMany({ data: values.map((value) => ({ materialId: sku.id, attributeValueId: value.id })) });
          }
          return tx.material.findUniqueOrThrow({ where: { id: parent.id }, include: { variants: { include: { variantValues: { include: { attributeValue: { include: { attribute: true } } } } } }, attributes: true } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if ((error as any)?.code !== "P2002" || attempt === 4) throw error;
      }
    }
    throw new BadRequestException("物料编码生成失败，请重试");
  }

  private async validateSelections(client: any, selections: AttributeSelection[], companyId: string) {
    if (!selections.length || new Set(selections.map((selection) => selection.attributeId)).size !== selections.length) throw new BadRequestException("多属性物料的属性不能为空且不能重复");
    const attributes: any[] = await client.productAttribute.findMany({ where: { companyId, id: { in: selections.map((selection) => selection.attributeId) }, isActive: true }, include: { values: { where: { isActive: true } } } });
    if (attributes.length !== selections.length) throw new BadRequestException("存在无效或停用的产品属性");
    return selections.map((selection) => {
      const attribute: any = attributes.find((item: any) => item.id === selection.attributeId)!;
      const ids = [...new Set(selection.valueIds ?? [])];
      const values = ids.map((id) => attribute.values.find((value: any) => value.id === id)).filter(Boolean) as any[];
      if (!values.length || values.length !== ids.length) throw new BadRequestException(`产品属性“${attribute.name}”包含无效属性值`);
      return { attributeId: attribute.id, values };
    }).sort((a, b) => attributes.find((item: any) => item.id === a.attributeId)!.sortOrder - attributes.find((item: any) => item.id === b.attributeId)!.sortOrder);
  }

  private async addMissingVariants(id: string, selections: AttributeSelection[]) {
    await this.prisma.$transaction(async (tx: any) => {
      const parent = await tx.material.findUniqueOrThrow({ where: { id }, include: { variants: { include: { variantValues: true } } } });
      const normalized = await this.validateSelections(tx, selections, parent.companyId);
      await tx.materialAttribute.createMany({ data: normalized.map((selection: any) => ({ materialId: parent.id, attributeId: selection.attributeId })), skipDuplicates: true });
      for (const values of cartesian(normalized.map((selection: any) => selection.values))) {
        const valueIds = values.map((value: any) => value.id).sort();
        const exists = parent.variants.some((variant: any) => variant.variantValues.map((link: any) => link.attributeValueId).sort().join("/") === valueIds.join("/"));
        if (exists) continue;
        const suffix = values.map((value: any) => value.code).join("-");
        const sku = await tx.material.create({ data: { companyId: parent.companyId, code: `${parent.code}-${suffix}`, name: `${parent.name} · ${values.map((value: any) => value.name).join(" · ")}`, parentMaterialId: parent.id, categoryId: parent.categoryId, materialType: parent.materialType, baseUnitId: parent.baseUnitId, shelfLifeDays: parent.shelfLifeDays, expiryWarningDays: parent.expiryWarningDays, purchasable: parent.purchasable, saleable: parent.saleable, manufacturable: parent.manufacturable, defaultLocationId: parent.defaultLocationId, defaultTaxRateId: parent.defaultTaxRateId } });
        await tx.materialVariantValue.createMany({ data: values.map((value: any) => ({ materialId: sku.id, attributeValueId: value.id })) });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  variants(id: string) { return (this.prisma as any).material.findUniqueOrThrow({ where: { id }, include: { variants: { include: { variantValues: { include: { attributeValue: { include: { attribute: true } } } } } } } }); }

  async update(id: string, body: Partial<CreateMaterialBody>) { const { code: _code, variantEnabled, attributes, ...data } = body; const updated = await this.prisma.material.update({ where: { id }, data: data as any }); if (variantEnabled && attributes?.length) await this.addMissingVariants(id, attributes); return updated; }
  async remove(id: string) {
    const current: any = ensureFound(await (this.prisma as any).material.findUnique({ where: { id } }), "物料不存在");
    const [purchaseLines, salesLines, bomItems, boms, productionLines, batches, variants] = await Promise.all([
      this.prisma.purchaseOrderLine.count({ where: { materialId: id } }), this.prisma.salesOrderLine.count({ where: { materialId: id } }),
      this.prisma.bomItem.count({ where: { inputMaterialId: id } }), this.prisma.bom.count({ where: { outputMaterialId: id } }),
      this.prisma.productionMaterial.count({ where: { materialId: id } }), this.prisma.inventoryBatch.count({ where: { materialId: id } }), (this.prisma as any).material.count({ where: { parentMaterialId: id } }),
    ]);
    const dependencies = [{ resource: "采购订单明细", count: purchaseLines }, { resource: "销售订单明细", count: salesLines }, { resource: "BOM", count: bomItems + boms }, { resource: "生产记录", count: productionLines }, { resource: "库存批次", count: batches }, { resource: "SKU", count: variants }].filter((item) => item.count);
    if (dependencies.length) deleteConflict(`物料“${current.code} · ${current.name}”存在业务引用，无法删除`, dependencies);
    const media = current.imageStorageKey && current.imageStorageProvider ? { key: current.imageStorageKey, url: current.imageUrl ?? "", provider: current.imageStorageProvider } : undefined;
    if (media) return this.media.withRemoved(media, () => this.prisma.material.delete({ where: { id } }).then(() => deleted(id)));
    const imagePath = current.imageUrl ? join(process.cwd(), "uploads", "materials", basename(current.imageUrl)) : undefined;
    const imageBackup = imagePath ? await readFile(imagePath) : undefined;
    if (imagePath) await unlink(imagePath);
    try { await this.prisma.material.delete({ where: { id } }); }
    catch (error) { if (imagePath && imageBackup) { await mkdir(join(process.cwd(), "uploads", "materials"), { recursive: true }); await writeFile(imagePath, imageBackup); } throw error; }
    return deleted(id);
  }

  async removeVariant(id: string) {
    const current = ensureFound(await (this.prisma as any).material.findUnique({ where: { id } }), "SKU 不存在");
    if (!current.parentMaterialId) throw new BadRequestException("普通物料不能按 SKU 删除");
    const [purchaseLines, salesLines, bomItems, boms, productionLines, batches, shipments] = await Promise.all([
      this.prisma.purchaseOrderLine.count({ where: { materialId: id } }), this.prisma.salesOrderLine.count({ where: { materialId: id } }), this.prisma.bomItem.count({ where: { inputMaterialId: id } }), this.prisma.bom.count({ where: { outputMaterialId: id } }), this.prisma.productionMaterial.count({ where: { materialId: id } }), this.prisma.inventoryBatch.count({ where: { materialId: id } }), this.prisma.salesShipmentLine.count({ where: { materialId: id } }),
    ]);
    const dependencies = [{ resource: "采购订单明细", count: purchaseLines }, { resource: "销售订单明细", count: salesLines }, { resource: "BOM", count: bomItems + boms }, { resource: "生产记录", count: productionLines }, { resource: "库存批次", count: batches }, { resource: "出库明细", count: shipments }].filter((item) => item.count);
    if (dependencies.length) deleteConflict(`SKU“${current.code} · ${current.name}”存在业务引用，无法删除`, dependencies);
    const stored = current.imageStorageKey && current.imageStorageProvider ? { key: current.imageStorageKey, url: current.imageUrl ?? "", provider: current.imageStorageProvider } : undefined;
    if (stored) return this.media.withRemoved(stored, () => this.prisma.$transaction((tx) => tx.material.delete({ where: { id } })).then(() => deleted(id)));
    await this.prisma.material.delete({ where: { id } });
    return deleted(id);
  }

  async uploadImage(id: string, file?: UploadedImage) {
    const current = ensureFound(await (this.prisma as any).material.findUnique({ where: { id } }), "物料不存在");
    if (!file) throw new BadRequestException("请选择物料图片");
    const stored = await this.media.upload({ buffer: file.buffer, contentType: file.mimetype, originalName: `material-${id}`, size: file.size }, `materials/${id}`);
    const previous = current.imageStorageKey && current.imageStorageProvider ? { key: current.imageStorageKey, url: current.imageUrl ?? "", provider: current.imageStorageProvider } : undefined;
    try {
      const updated = await (this.prisma as any).material.update({ where: { id }, data: { imageUrl: stored.url, imageStorageKey: stored.key, imageStorageProvider: stored.provider } });
      if (previous) await this.media.remove(previous);
      return updated;
    } catch (error) {
      try { await this.media.remove(stored); } catch { /* best effort cleanup; original error remains actionable */ }
      throw error;
    }
  }

  async removeImage(id: string) {
    const current = ensureFound(await (this.prisma as any).material.findUnique({ where: { id } }), "物料不存在");
    const stored = current.imageStorageKey && current.imageStorageProvider ? { key: current.imageStorageKey, url: current.imageUrl ?? "", provider: current.imageStorageProvider } : undefined;
    if (stored) {
      return this.media.withRemoved(stored, () => (this.prisma as any).material.update({ where: { id }, data: { imageUrl: null, imageStorageKey: null, imageStorageProvider: null } }));
    }
    if (current.imageUrl) {
      const imagePath = join(process.cwd(), "uploads", "materials", basename(current.imageUrl));
      try { await unlink(imagePath); } catch { /* legacy image may already be absent */ }
      return (this.prisma as any).material.update({ where: { id }, data: { imageUrl: null } });
    }
    return current;
  }
}

@Controller("materials")
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}
  @Get() @Permissions("material.view") list(@Query() query: PaginationQuery) { return this.service.list(query); }
  @Get("next-code") @Permissions("material.view") async nextCode(@Query("categoryId") categoryId: string) { return { code: await this.service.nextCode(categoryId) }; }
  @Get(":id/variants") @Permissions("material.view") variants(@Param("id") id: string) { return this.service.variants(id); }
  @Get("options") options(@Query("q") q?: string, @Query("take") take?: string, @Query("topLevel") topLevel?: string) { return this.service.options(q, take, topLevel); }
  @Get("bootstrap") @Permissions("material.view") bootstrap() { return this.service.bootstrapData(); }
  @Post() @Permissions("material.manage") create(@Body() body: CreateMaterialBody) { return this.service.create(body); }
  @Post(":id/image") @Permissions("material.manage") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } })) uploadImage(@Param("id") id: string, @UploadedFile() file?: UploadedImage) { return this.service.uploadImage(id, file); }
  @Delete(":id/image") @Permissions("material.manage") removeImage(@Param("id") id: string) { return this.service.removeImage(id); }
  @Patch(":id") @Permissions("material.manage") update(@Param("id") id: string, @Body() body: Partial<CreateMaterialBody>) { return this.service.update(id, body); }
  @Delete(":id") @Permissions("material.manage") remove(@Param("id") id: string) { return this.service.remove(id); }
  @Delete("variants/:id") @Permissions("material.manage") removeVariant(@Param("id") id: string) { return this.service.removeVariant(id); }
}
