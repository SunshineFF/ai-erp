import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { PaginationQuery, pageResult, parsePagination } from "../pagination";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type NamedCodeBody = { code: string; name: string; isActive?: boolean };
type UnitBody = NamedCodeBody & { precision?: number };
type TaxRateBody = NamedCodeBody & { rate: number; effectiveFrom: string; effectiveTo?: string };
type CurrencyBody = NamedCodeBody & { symbol: string; decimalPlaces?: number; isBaseCurrency?: boolean };
type ExchangeRateBody = { currencyCode: string; rateDate: string; rateToCny: number; isActive?: boolean };
type LocationBody = NamedCodeBody & { warehouseId: string; locationType: string };
type ProductAttributeBody = { code: string; name: string; sortOrder?: number; isActive?: boolean };
type ProductAttributeValueBody = { code: string; name: string; sortOrder?: number; isActive?: boolean };
type PartnerCategoryBody = { code: string; name: string; isActive?: boolean };

function validateProductCode(code: string, label: string) {
  if (!code?.trim() || !/^[A-Za-z0-9_-]+$/.test(code.trim())) throw new BadRequestException(`${label}编码只能包含字母、数字、下划线和短横线`);
  return code.trim().toUpperCase();
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  private company() { return this.prisma.company.findFirstOrThrow(); }
  private db(): any { return this.prisma as any; }

  async productAttributes(query: PaginationQuery = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = { ...(query.q ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } : {}) };
    const [items, total] = await Promise.all([
      this.db().productAttribute.findMany({ where, include: { values: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], skip, take }),
      this.db().productAttribute.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }
  async productAttributeOptions() {
    return this.db().productAttribute.findMany({ where: { isActive: true }, include: { values: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  }
  async createProductAttribute(body: ProductAttributeBody) {
    const company = await this.company();
    return this.db().productAttribute.create({ data: { companyId: company.id, code: validateProductCode(body.code, "产品属性"), name: body.name.trim(), sortOrder: body.sortOrder ?? 0, isActive: body.isActive ?? true } });
  }
  async updateProductAttribute(id: string, body: Partial<ProductAttributeBody>) {
    const data: any = { name: body.name?.trim(), sortOrder: body.sortOrder, isActive: body.isActive };
    return this.db().productAttribute.update({ where: { id }, data });
  }
  async removeProductAttribute(id: string) {
    const item = ensureFound(await this.db().productAttribute.findUnique({ where: { id } }), "产品属性不存在");
    const [materials, values] = await Promise.all([this.db().materialAttribute.count({ where: { attributeId: id } }), this.db().productAttributeValue.count({ where: { attributeId: id } })]);
    if (materials || values) deleteConflict(`产品属性“${item.name}”仍被使用，无法删除`, [{ resource: "物料属性", count: materials }, { resource: "属性值", count: values }].filter((x) => x.count));
    await this.db().productAttribute.delete({ where: { id } });
    return deleted(id);
  }
  async productAttributeValues(attributeId: string, query: PaginationQuery = {}) {
    ensureFound(await this.db().productAttribute.findUnique({ where: { id: attributeId } }), "产品属性不存在");
    const { page, pageSize, skip, take } = parsePagination(query);
    const where = { attributeId, ...(query.q ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } : {}) } as any;
    const [items, total] = await Promise.all([this.db().productAttributeValue.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], skip, take }), this.db().productAttributeValue.count({ where })]);
    return pageResult(items, total, page, pageSize);
  }
  async createProductAttributeValue(attributeId: string, body: ProductAttributeValueBody) {
    ensureFound(await this.db().productAttribute.findUnique({ where: { id: attributeId } }), "产品属性不存在");
    return this.db().productAttributeValue.create({ data: { attributeId, code: validateProductCode(body.code, "属性值"), name: body.name.trim(), sortOrder: body.sortOrder ?? 0, isActive: body.isActive ?? true } });
  }
  async updateProductAttributeValue(id: string, body: Partial<ProductAttributeValueBody>) {
    return this.db().productAttributeValue.update({ where: { id }, data: { name: body.name?.trim(), sortOrder: body.sortOrder, isActive: body.isActive } });
  }
  async updateProductAttributeValueForAttribute(attributeId: string, id: string, body: Partial<ProductAttributeValueBody>) { const item = ensureFound(await this.db().productAttributeValue.findUnique({ where: { id } }), "属性值不存在"); if (item.attributeId !== attributeId) throw new BadRequestException("属性值不属于指定产品属性"); return this.updateProductAttributeValue(id, body); }
  async removeProductAttributeValue(id: string) {
    const item = ensureFound(await this.db().productAttributeValue.findUnique({ where: { id } }), "属性值不存在");
    const count = await this.db().materialVariantValue.count({ where: { attributeValueId: id } });
    if (count) deleteConflict(`属性值“${item.name}”仍被 SKU 使用，无法删除`, [{ resource: "SKU", count }]);
    await this.db().productAttributeValue.delete({ where: { id } });
    return deleted(id);
  }
  async removeProductAttributeValueForAttribute(attributeId: string, id: string) { const item = ensureFound(await this.db().productAttributeValue.findUnique({ where: { id } }), "属性值不存在"); if (item.attributeId !== attributeId) throw new BadRequestException("属性值不属于指定产品属性"); return this.removeProductAttributeValue(id); }

  async categories(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const where: any = query.q ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } : undefined; const [items, total] = await Promise.all([this.prisma.materialCategory.findMany({ where, orderBy: { code: "asc" }, skip, take }), this.prisma.materialCategory.count({ where })]); return pageResult(items, total, page, pageSize); }
  async createCategory(body: NamedCodeBody) { const company = await this.company(); return this.prisma.materialCategory.create({ data: { companyId: company.id, code: body.code, name: body.name, isActive: body.isActive ?? true } }); }
  updateCategory(id: string, body: Partial<NamedCodeBody>) { return this.prisma.materialCategory.update({ where: { id }, data: body }); }
  async removeCategory(id: string) { const item = ensureFound(await this.prisma.materialCategory.findUnique({ where: { id } }), "物料分类不存在"); const [count, suppliers] = await Promise.all([this.prisma.material.count({ where: { categoryId: id } }), this.prisma.supplier.count({ where: { materialCategoryId: id } })]); if (count || suppliers) deleteConflict(`分类“${item.name}”仍被业务数据引用，无法删除`, [{ resource: "物料", count }, { resource: "供应商", count: suppliers }].filter((x) => x.count)); await this.prisma.materialCategory.delete({ where: { id } }); return deleted(id); }

  private static readonly PARTNER_TYPES = ["customer"] as const;
  private assertPartnerType(partnerType: string) { if (!(SettingsService.PARTNER_TYPES as readonly string[]).includes(partnerType)) throw new BadRequestException("往来单位类型无效"); }
  async partnerCategories(partnerType: string, query: PaginationQuery = {}) { this.assertPartnerType(partnerType); const { page, pageSize, skip, take } = parsePagination(query); const where: any = { partnerType, ...(query.q ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } : {}) }; const [items, total] = await Promise.all([this.db().partnerCategory.findMany({ where, orderBy: { code: "asc" }, skip, take }), this.db().partnerCategory.count({ where })]); return pageResult(items, total, page, pageSize); }
  partnerCategoryOptions(partnerType: string) { this.assertPartnerType(partnerType); return this.db().partnerCategory.findMany({ where: { partnerType, isActive: true }, orderBy: { code: "asc" } }); }
  async createPartnerCategory(partnerType: string, body: PartnerCategoryBody) { this.assertPartnerType(partnerType); const company = await this.company(); return this.db().partnerCategory.create({ data: { companyId: company.id, partnerType, code: validateProductCode(body.code, "往来单位分类"), name: body.name.trim(), isActive: body.isActive ?? true } }); }
  async updatePartnerCategory(partnerType: string, id: string, body: Partial<PartnerCategoryBody>) { this.assertPartnerType(partnerType); const item = ensureFound(await this.db().partnerCategory.findUnique({ where: { id } }), "往来单位分类不存在"); if (item.partnerType !== partnerType) throw new BadRequestException("分类类型不匹配"); return this.db().partnerCategory.update({ where: { id }, data: { name: body.name?.trim(), isActive: body.isActive } }); }
  async removePartnerCategory(partnerType: string, id: string) { this.assertPartnerType(partnerType); const item = ensureFound(await this.db().partnerCategory.findUnique({ where: { id } }), "往来单位分类不存在"); if (item.partnerType !== partnerType) throw new BadRequestException("分类类型不匹配"); const customers = await this.prisma.customer.count({ where: { partnerCategoryId: id } }); if (customers) deleteConflict(`分类“${item.name}”仍被业务数据引用，无法删除`, [{ resource: "客户", count: customers }].filter((x) => x.count)); await this.db().partnerCategory.delete({ where: { id } }); return deleted(id); }

  async units(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.unit.findMany({ orderBy: { code: "asc" }, skip, take }), this.prisma.unit.count()]); return pageResult(items, total, page, pageSize); }
  async createUnit(body: UnitBody) { const company = await this.company(); return this.prisma.unit.create({ data: { companyId: company.id, code: body.code, name: body.name, precision: body.precision ?? 3, isActive: body.isActive ?? true } }); }
  updateUnit(id: string, body: Partial<UnitBody>) { return this.prisma.unit.update({ where: { id }, data: body }); }
  async removeUnit(id: string) { const item = ensureFound(await this.prisma.unit.findUnique({ where: { id } }), "计量单位不存在"); const [materials, bomItems] = await Promise.all([this.prisma.material.count({ where: { baseUnitId: id } }), this.prisma.bomItem.count({ where: { unitId: id } })]); if (materials || bomItems) deleteConflict(`单位“${item.name}”仍被业务数据引用，无法删除`, [{ resource: "物料", count: materials }, { resource: "BOM 明细", count: bomItems }].filter((x) => x.count)); await this.prisma.unit.delete({ where: { id } }); return deleted(id); }

  async taxRates(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.taxRate.findMany({ orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }], skip, take }), this.prisma.taxRate.count()]); return pageResult(items, total, page, pageSize); }
  async createTaxRate(body: TaxRateBody) {
    if (body.rate < 0 || body.rate > 1) throw new BadRequestException("税率必须在 0 到 1 之间");
    const company = await this.company();
    return this.prisma.taxRate.create({ data: { companyId: company.id, code: body.code, name: body.name, rate: body.rate, effectiveFrom: new Date(body.effectiveFrom), effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : undefined, isActive: body.isActive ?? true } });
  }
  updateTaxRate(id: string, body: Partial<TaxRateBody>) { return this.prisma.taxRate.update({ where: { id }, data: { code: body.code, name: body.name, rate: body.rate, effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined, effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : body.effectiveTo === "" ? null : undefined, isActive: body.isActive } }); }
  async removeTaxRate(id: string) { const item = ensureFound(await this.prisma.taxRate.findUnique({ where: { id } }), "税率不存在"); const [materials, orders] = await Promise.all([this.prisma.material.count({ where: { defaultTaxRateId: id } }), this.prisma.purchaseOrder.count({ where: { taxRateId: id } })]); if (materials || orders) deleteConflict(`税率“${item.name}”仍被业务数据引用，无法删除`, [{ resource: "物料", count: materials }, { resource: "采购订单", count: orders }].filter((x) => x.count)); await this.prisma.taxRate.delete({ where: { id } }); return deleted(id); }

  async currencies(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.currency.findMany({ orderBy: { code: "asc" }, skip, take }), this.prisma.currency.count()]); return pageResult(items, total, page, pageSize); }
  async createCurrency(body: CurrencyBody) {
    if (!["CNY", "USD"].includes(body.code.toUpperCase())) throw new BadRequestException("一期只开放 CNY 和 USD");
    return this.prisma.$transaction(async (tx) => {
      if (body.isBaseCurrency) await tx.currency.updateMany({ data: { isBaseCurrency: false } });
      const currency = await tx.currency.create({ data: { code: body.code.toUpperCase(), name: body.name, symbol: body.symbol, decimalPlaces: body.decimalPlaces ?? 2, isBaseCurrency: body.isBaseCurrency ?? false, isActive: body.isActive ?? true } });
      if (currency.isBaseCurrency) await tx.company.updateMany({ data: { baseCurrencyCode: currency.code } });
      return currency;
    });
  }
  async updateCurrency(code: string, body: Partial<CurrencyBody>) {
    return this.prisma.$transaction(async (tx) => {
      if (body.isBaseCurrency) await tx.currency.updateMany({ data: { isBaseCurrency: false } });
      const currency = await tx.currency.update({ where: { code }, data: { name: body.name, symbol: body.symbol, decimalPlaces: body.decimalPlaces, isBaseCurrency: body.isBaseCurrency, isActive: body.isActive } });
      if (currency.isBaseCurrency) await tx.company.updateMany({ data: { baseCurrencyCode: currency.code } });
      return currency;
    });
  }
  async removeCurrency(code: string) { const current = ensureFound(await this.prisma.currency.findUnique({ where: { code } }), "货币不存在"); if (current.isBaseCurrency) throw new BadRequestException("本位币不能删除"); const [purchase, sales, cash] = await Promise.all([this.prisma.purchaseOrder.count({ where: { currencyCode: code } }), this.prisma.salesOrder.count({ where: { currencyCode: code } }), this.prisma.cashFlow.count({ where: { currencyCode: code } })]); if (purchase || sales || cash) deleteConflict(`货币“${code}”仍被业务数据引用，无法删除`, [{ resource: "采购订单", count: purchase }, { resource: "销售订单", count: sales }, { resource: "现金流水", count: cash }].filter((x) => x.count)); await this.prisma.currency.delete({ where: { code } }); return deleted(code); }

  async exchangeRates(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.exchangeRate.findMany({ orderBy: { rateDate: "desc" }, skip, take }), this.prisma.exchangeRate.count()]); return pageResult(items, total, page, pageSize); }
  async createExchangeRate(body: ExchangeRateBody, actorUserId?: string) { const company = await this.company(); if (body.currencyCode !== "USD" || body.rateToCny <= 0) throw new BadRequestException("一期仅维护有效的 USD/CNY 汇率"); return this.prisma.$transaction(async (tx) => { const rate = await tx.exchangeRate.upsert({ where: { companyId_currencyCode_rateDate: { companyId: company.id, currencyCode: body.currencyCode, rateDate: new Date(body.rateDate) } }, update: { rateToCny: body.rateToCny, isActive: body.isActive ?? true, maintainedById: actorUserId }, create: { companyId: company.id, currencyCode: body.currencyCode, rateDate: new Date(body.rateDate), rateToCny: body.rateToCny, isActive: body.isActive ?? true, maintainedById: actorUserId } }); await tx.auditLog.create({ data: { companyId: company.id, actorUserId, action: "settings.exchange_rate", resourceType: "ExchangeRate", resourceId: rate.id, afterData: { currencyCode: rate.currencyCode, rateDate: rate.rateDate.toISOString(), rateToCny: String(rate.rateToCny) } } }); return rate; }); }
  async removeExchangeRate(id: string) { const item = ensureFound(await this.prisma.exchangeRate.findUnique({ where: { id } }), "汇率不存在"); const audits = await this.prisma.auditLog.count({ where: { resourceType: "ExchangeRate", resourceId: id } }); if (audits) deleteConflict(`${item.currencyCode} ${item.rateDate.toISOString().slice(0, 10)} 汇率存在审计记录，无法删除`, [{ resource: "审计记录", count: audits }]); await this.prisma.exchangeRate.delete({ where: { id } }); return deleted(id); }

  async warehouses(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.warehouse.findMany({ orderBy: { code: "asc" }, skip, take }), this.prisma.warehouse.count()]); return pageResult(items, total, page, pageSize); }
  async locations(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const [items, total] = await Promise.all([this.prisma.location.findMany({ orderBy: { code: "asc" }, skip, take }), this.prisma.location.count()]); return pageResult(items, total, page, pageSize); }
  async createWarehouse(body: NamedCodeBody) { const company = await this.company(); return this.prisma.warehouse.create({ data: { companyId: company.id, code: body.code, name: body.name, isActive: body.isActive ?? true } }); }
  updateWarehouse(id: string, body: Partial<NamedCodeBody>) { return this.prisma.warehouse.update({ where: { id }, data: body }); }
  warehouseOptions() { return this.prisma.warehouse.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }); }
  createLocation(body: LocationBody) { return this.prisma.location.create({ data: { warehouseId: body.warehouseId, code: body.code, name: body.name, locationType: body.locationType, isActive: body.isActive ?? true } }); }
  updateLocation(id: string, body: Partial<LocationBody>) { return this.prisma.location.update({ where: { id }, data: { code: body.code, name: body.name, locationType: body.locationType, isActive: body.isActive } }); }
  async removeWarehouse(id: string) { const item = ensureFound(await this.prisma.warehouse.findUnique({ where: { id } }), "仓库不存在"); const [locations, productionOrders, balances, transactions] = await Promise.all([this.prisma.location.count({ where: { warehouseId: id } }), this.prisma.productionOrder.count({ where: { warehouseId: id } }), this.prisma.inventoryBalance.count({ where: { warehouseId: id } }), this.prisma.inventoryTransaction.count({ where: { warehouseId: id } })]); if (locations || productionOrders || balances || transactions) deleteConflict(`仓库“${item.name}”仍被业务数据引用，无法删除`, [{ resource: "库位", count: locations }, { resource: "生产订单", count: productionOrders }, { resource: "库存余额", count: balances }, { resource: "库存事务", count: transactions }].filter((x) => x.count)); await this.prisma.warehouse.delete({ where: { id } }); return deleted(id); }
  async removeLocation(id: string) { const item = ensureFound(await this.prisma.location.findUnique({ where: { id } }), "库位不存在"); const [productionOrders, balances, transactions, shipments] = await Promise.all([this.prisma.productionOrder.count({ where: { targetLocationId: id } }), this.prisma.inventoryBalance.count({ where: { locationId: id } }), this.prisma.inventoryTransaction.count({ where: { locationId: id } }), this.prisma.salesShipmentLine.count({ where: { locationId: id } })]); if (productionOrders || balances || transactions || shipments) deleteConflict(`库位“${item.name}”仍被业务数据引用，无法删除`, [{ resource: "生产订单", count: productionOrders }, { resource: "库存余额", count: balances }, { resource: "库存事务", count: transactions }, { resource: "出库明细", count: shipments }].filter((x) => x.count)); await this.prisma.location.delete({ where: { id } }); return deleted(id); }

  systemSettings() { return this.prisma.systemSetting.findMany({ orderBy: { settingKey: "asc" } }); }
  async updateSystemSetting(key: string, value: unknown, actorUserId?: string) { const company = await this.company(); return this.prisma.$transaction(async (tx) => { const setting = await tx.systemSetting.upsert({ where: { companyId_settingKey: { companyId: company.id, settingKey: key } }, update: { settingValue: value as any }, create: { companyId: company.id, settingKey: key, settingValue: value as any } }); await tx.auditLog.create({ data: { companyId: company.id, actorUserId, action: "settings.update", resourceType: "SystemSetting", resourceId: setting.id, afterData: { key, value } as any } }); return setting; }); }
}

@Controller("settings")
@Permissions("system.manage")
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get("product-attributes") productAttributes(@Query() query: PaginationQuery) { return this.service.productAttributes(query); }
  @Get("product-attributes/options") productAttributeOptions() { return this.service.productAttributeOptions(); }
  @Post("product-attributes") createProductAttribute(@Body() body: ProductAttributeBody) { return this.service.createProductAttribute(body); }
  @Patch("product-attributes/:id") updateProductAttribute(@Param("id") id: string, @Body() body: Partial<ProductAttributeBody>) { return this.service.updateProductAttribute(id, body); }
  @Delete("product-attributes/:id") removeProductAttribute(@Param("id") id: string) { return this.service.removeProductAttribute(id); }
  @Get("product-attributes/:attributeId/values") productAttributeValues(@Param("attributeId") attributeId: string, @Query() query: PaginationQuery) { return this.service.productAttributeValues(attributeId, query); }
  @Post("product-attributes/:attributeId/values") createProductAttributeValue(@Param("attributeId") attributeId: string, @Body() body: ProductAttributeValueBody) { return this.service.createProductAttributeValue(attributeId, body); }
  @Patch("product-attribute-values/:id") updateProductAttributeValue(@Param("id") id: string, @Body() body: Partial<ProductAttributeValueBody>) { return this.service.updateProductAttributeValue(id, body); }
  @Delete("product-attribute-values/:id") removeProductAttributeValue(@Param("id") id: string) { return this.service.removeProductAttributeValue(id); }
  @Patch("product-attributes/:attributeId/values/:id") updateProductAttributeValueNested(@Param("attributeId") attributeId: string, @Param("id") id: string, @Body() body: Partial<ProductAttributeValueBody>) { return this.service.updateProductAttributeValueForAttribute(attributeId, id, body); }
  @Delete("product-attributes/:attributeId/values/:id") removeProductAttributeValueNested(@Param("attributeId") attributeId: string, @Param("id") id: string) { return this.service.removeProductAttributeValueForAttribute(attributeId, id); }

  @Get("categories") categories(@Query() query: PaginationQuery) { return this.service.categories(query); }
  @Post("categories") createCategory(@Body() body: NamedCodeBody) { return this.service.createCategory(body); }
  @Patch("categories/:id") updateCategory(@Param("id") id: string, @Body() body: Partial<NamedCodeBody>) { return this.service.updateCategory(id, body); }
  @Delete("categories/:id") removeCategory(@Param("id") id: string) { return this.service.removeCategory(id); }

  @Get("partner-categories/:partnerType") partnerCategories(@Param("partnerType") partnerType: string, @Query() query: PaginationQuery) { return this.service.partnerCategories(partnerType, query); }
  @Get("partner-categories/:partnerType/options") partnerCategoryOptions(@Param("partnerType") partnerType: string) { return this.service.partnerCategoryOptions(partnerType); }
  @Post("partner-categories/:partnerType") createPartnerCategory(@Param("partnerType") partnerType: string, @Body() body: PartnerCategoryBody) { return this.service.createPartnerCategory(partnerType, body); }
  @Patch("partner-categories/:partnerType/:id") updatePartnerCategory(@Param("partnerType") partnerType: string, @Param("id") id: string, @Body() body: Partial<PartnerCategoryBody>) { return this.service.updatePartnerCategory(partnerType, id, body); }
  @Delete("partner-categories/:partnerType/:id") removePartnerCategory(@Param("partnerType") partnerType: string, @Param("id") id: string) { return this.service.removePartnerCategory(partnerType, id); }

  @Get("units") units(@Query() query: PaginationQuery) { return this.service.units(query); }
  @Post("units") createUnit(@Body() body: UnitBody) { return this.service.createUnit(body); }
  @Patch("units/:id") updateUnit(@Param("id") id: string, @Body() body: Partial<UnitBody>) { return this.service.updateUnit(id, body); }
  @Delete("units/:id") removeUnit(@Param("id") id: string) { return this.service.removeUnit(id); }

  @Get("tax-rates") taxRates(@Query() query: PaginationQuery) { return this.service.taxRates(query); }
  @Post("tax-rates") createTaxRate(@Body() body: TaxRateBody) { return this.service.createTaxRate(body); }
  @Patch("tax-rates/:id") updateTaxRate(@Param("id") id: string, @Body() body: Partial<TaxRateBody>) { return this.service.updateTaxRate(id, body); }
  @Delete("tax-rates/:id") removeTaxRate(@Param("id") id: string) { return this.service.removeTaxRate(id); }

  @Get("currencies") currencies(@Query() query: PaginationQuery) { return this.service.currencies(query); }
  @Post("currencies") createCurrency(@Body() body: CurrencyBody) { return this.service.createCurrency(body); }
  @Patch("currencies/:code") updateCurrency(@Param("code") code: string, @Body() body: Partial<CurrencyBody>) { return this.service.updateCurrency(code, body); }
  @Delete("currencies/:code") removeCurrency(@Param("code") code: string) { return this.service.removeCurrency(code); }

  @Get("exchange-rates") exchangeRates(@Query() query: PaginationQuery) { return this.service.exchangeRates(query); }
  @Post("exchange-rates") createExchangeRate(@Body() body: ExchangeRateBody, @Req() req: any) { return this.service.createExchangeRate(body, req.user?.sub); }
  @Delete("exchange-rates/:id") removeExchangeRate(@Param("id") id: string) { return this.service.removeExchangeRate(id); }

  @Get("warehouses") warehouses(@Query() query: PaginationQuery) { return this.service.warehouses(query); }
  @Get("warehouse-options") warehouseOptions() { return this.service.warehouseOptions(); }
  @Post("warehouses") createWarehouse(@Body() body: NamedCodeBody) { return this.service.createWarehouse(body); }
  @Patch("warehouses/:id") updateWarehouse(@Param("id") id: string, @Body() body: Partial<NamedCodeBody>) { return this.service.updateWarehouse(id, body); }
  @Delete("warehouses/:id") removeWarehouse(@Param("id") id: string) { return this.service.removeWarehouse(id); }
  @Get("locations") locations(@Query() query: PaginationQuery) { return this.service.locations(query); }
  @Post("locations") createLocation(@Body() body: LocationBody) { return this.service.createLocation(body); }
  @Patch("locations/:id") updateLocation(@Param("id") id: string, @Body() body: Partial<LocationBody>) { return this.service.updateLocation(id, body); }
  @Delete("locations/:id") removeLocation(@Param("id") id: string) { return this.service.removeLocation(id); }

  @Get("system") systemSettings() { return this.service.systemSettings(); }
  @Patch("system/:key") updateSystemSetting(@Param("key") key: string, @Body() body: { value: unknown }, @Req() req: any) { return this.service.updateSystemSetting(key, body.value, req.user?.sub); }
}
