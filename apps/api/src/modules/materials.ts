import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MaterialType } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";

type CreateMaterialBody = { code: string; name: string; materialType: MaterialType; baseUnitId: string; categoryId: string; shelfLifeDays?: number; expiryWarningDays?: number; purchasable?: boolean; saleable?: boolean; manufacturable?: boolean; defaultLocationId?: string; defaultTaxRateId?: string };
type UploadedImage = { buffer: Buffer; mimetype: string; size: number };

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  list() { return this.prisma.material.findMany({ orderBy: { code: "asc" } }); }

  async bootstrapData() {
    const [units, categories, locations, taxRates, currencies, materials] = await Promise.all([
      this.prisma.unit.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.materialCategory.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.location.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.taxRate.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      this.prisma.material.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    ]);
    return { units, categories, locations, taxRates, currencies, materials };
  }

  async create(body: CreateMaterialBody) {
    const company = await this.prisma.company.findFirstOrThrow();
    return this.prisma.material.create({ data: { companyId: company.id, code: body.code, name: body.name, materialType: body.materialType, baseUnitId: body.baseUnitId, categoryId: body.categoryId, shelfLifeDays: body.shelfLifeDays, expiryWarningDays: body.expiryWarningDays ?? 30, purchasable: body.purchasable ?? false, saleable: body.saleable ?? false, manufacturable: body.manufacturable ?? false, defaultLocationId: body.defaultLocationId, defaultTaxRateId: body.defaultTaxRateId } });
  }

  update(id: string, body: Partial<CreateMaterialBody>) { return this.prisma.material.update({ where: { id }, data: body as any }); }
  remove(id: string) { return this.prisma.material.update({ where: { id }, data: { isActive: false } }); }

  async uploadImage(id: string, file?: UploadedImage) {
    if (!file) throw new BadRequestException("请选择物料图片");
    const extensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
    const extension = extensions[file.mimetype];
    if (!extension) throw new BadRequestException("仅支持 JPG、PNG、WebP 或 GIF 图片");
    const directory = join(process.cwd(), "uploads", "materials");
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    await writeFile(join(directory, filename), file.buffer);
    return this.prisma.material.update({ where: { id }, data: { imageUrl: `/uploads/materials/${filename}` } });
  }
}

@Controller("materials")
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}
  @Get() @Permissions("material.view") list() { return this.service.list(); }
  @Get("bootstrap") @Permissions("material.view") bootstrap() { return this.service.bootstrapData(); }
  @Post() @Permissions("material.manage") create(@Body() body: CreateMaterialBody) { return this.service.create(body); }
  @Post(":id/image") @Permissions("material.manage") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } })) uploadImage(@Param("id") id: string, @UploadedFile() file?: UploadedImage) { return this.service.uploadImage(id, file); }
  @Patch(":id") @Permissions("material.manage") update(@Param("id") id: string, @Body() body: Partial<CreateMaterialBody>) { return this.service.update(id, body); }
  @Delete(":id") @Permissions("material.manage") remove(@Param("id") id: string) { return this.service.remove(id); }
}
