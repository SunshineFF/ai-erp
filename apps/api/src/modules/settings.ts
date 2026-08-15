import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Req } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";

type NamedCodeBody = { code: string; name: string; isActive?: boolean };
type UnitBody = NamedCodeBody & { precision?: number };
type TaxRateBody = NamedCodeBody & { rate: number; effectiveFrom: string; effectiveTo?: string };
type CurrencyBody = NamedCodeBody & { symbol: string; decimalPlaces?: number; isBaseCurrency?: boolean };
type ExchangeRateBody = { currencyCode: string; rateDate: string; rateToCny: number; isActive?: boolean };
type LocationBody = NamedCodeBody & { warehouseId: string; locationType: string };

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  private company() { return this.prisma.company.findFirstOrThrow(); }

  categories() { return this.prisma.materialCategory.findMany({ orderBy: { code: "asc" } }); }
  async createCategory(body: NamedCodeBody) { const company = await this.company(); return this.prisma.materialCategory.create({ data: { companyId: company.id, code: body.code, name: body.name, isActive: body.isActive ?? true } }); }
  updateCategory(id: string, body: Partial<NamedCodeBody>) { return this.prisma.materialCategory.update({ where: { id }, data: body }); }
  disableCategory(id: string) { return this.prisma.materialCategory.update({ where: { id }, data: { isActive: false } }); }

  units() { return this.prisma.unit.findMany({ orderBy: { code: "asc" } }); }
  async createUnit(body: UnitBody) { const company = await this.company(); return this.prisma.unit.create({ data: { companyId: company.id, code: body.code, name: body.name, precision: body.precision ?? 3, isActive: body.isActive ?? true } }); }
  updateUnit(id: string, body: Partial<UnitBody>) { return this.prisma.unit.update({ where: { id }, data: body }); }
  disableUnit(id: string) { return this.prisma.unit.update({ where: { id }, data: { isActive: false } }); }

  taxRates() { return this.prisma.taxRate.findMany({ orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }] }); }
  async createTaxRate(body: TaxRateBody) {
    if (body.rate < 0 || body.rate > 1) throw new BadRequestException("税率必须在 0 到 1 之间");
    const company = await this.company();
    return this.prisma.taxRate.create({ data: { companyId: company.id, code: body.code, name: body.name, rate: body.rate, effectiveFrom: new Date(body.effectiveFrom), effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : undefined, isActive: body.isActive ?? true } });
  }
  updateTaxRate(id: string, body: Partial<TaxRateBody>) { return this.prisma.taxRate.update({ where: { id }, data: { code: body.code, name: body.name, rate: body.rate, effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined, effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : body.effectiveTo === "" ? null : undefined, isActive: body.isActive } }); }
  disableTaxRate(id: string) { return this.prisma.taxRate.update({ where: { id }, data: { isActive: false } }); }

  currencies() { return this.prisma.currency.findMany({ orderBy: { code: "asc" } }); }
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
  async disableCurrency(code: string) { const current = await this.prisma.currency.findUniqueOrThrow({ where: { code } }); if (current.isBaseCurrency) throw new BadRequestException("本位币不能停用"); return this.prisma.currency.update({ where: { code }, data: { isActive: false } }); }

  exchangeRates() { return this.prisma.exchangeRate.findMany({ orderBy: { rateDate: "desc" }, take: 365 }); }
  async createExchangeRate(body: ExchangeRateBody, actorUserId?: string) { const company = await this.company(); if (body.currencyCode !== "USD" || body.rateToCny <= 0) throw new BadRequestException("一期仅维护有效的 USD/CNY 汇率"); return this.prisma.$transaction(async (tx) => { const rate = await tx.exchangeRate.upsert({ where: { companyId_currencyCode_rateDate: { companyId: company.id, currencyCode: body.currencyCode, rateDate: new Date(body.rateDate) } }, update: { rateToCny: body.rateToCny, isActive: body.isActive ?? true, maintainedById: actorUserId }, create: { companyId: company.id, currencyCode: body.currencyCode, rateDate: new Date(body.rateDate), rateToCny: body.rateToCny, isActive: body.isActive ?? true, maintainedById: actorUserId } }); await tx.auditLog.create({ data: { companyId: company.id, actorUserId, action: "settings.exchange_rate", resourceType: "ExchangeRate", resourceId: rate.id, afterData: { currencyCode: rate.currencyCode, rateDate: rate.rateDate.toISOString(), rateToCny: String(rate.rateToCny) } } }); return rate; }); }

  warehouses() { return this.prisma.warehouse.findMany({ orderBy: { code: "asc" } }); }
  locations() { return this.prisma.location.findMany({ orderBy: { code: "asc" } }); }
  async createWarehouse(body: NamedCodeBody) { const company = await this.company(); return this.prisma.warehouse.create({ data: { companyId: company.id, code: body.code, name: body.name, isActive: body.isActive ?? true } }); }
  createLocation(body: LocationBody) { return this.prisma.location.create({ data: { warehouseId: body.warehouseId, code: body.code, name: body.name, locationType: body.locationType, isActive: body.isActive ?? true } }); }
  updateLocation(id: string, body: Partial<LocationBody>) { return this.prisma.location.update({ where: { id }, data: { code: body.code, name: body.name, locationType: body.locationType, isActive: body.isActive } }); }

  systemSettings() { return this.prisma.systemSetting.findMany({ orderBy: { settingKey: "asc" } }); }
  async updateSystemSetting(key: string, value: unknown, actorUserId?: string) { const company = await this.company(); return this.prisma.$transaction(async (tx) => { const setting = await tx.systemSetting.upsert({ where: { companyId_settingKey: { companyId: company.id, settingKey: key } }, update: { settingValue: value as any }, create: { companyId: company.id, settingKey: key, settingValue: value as any } }); await tx.auditLog.create({ data: { companyId: company.id, actorUserId, action: "settings.update", resourceType: "SystemSetting", resourceId: setting.id, afterData: { key, value } as any } }); return setting; }); }
}

@Controller("settings")
@Permissions("system.manage")
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get("categories") categories() { return this.service.categories(); }
  @Post("categories") createCategory(@Body() body: NamedCodeBody) { return this.service.createCategory(body); }
  @Patch("categories/:id") updateCategory(@Param("id") id: string, @Body() body: Partial<NamedCodeBody>) { return this.service.updateCategory(id, body); }
  @Delete("categories/:id") disableCategory(@Param("id") id: string) { return this.service.disableCategory(id); }

  @Get("units") units() { return this.service.units(); }
  @Post("units") createUnit(@Body() body: UnitBody) { return this.service.createUnit(body); }
  @Patch("units/:id") updateUnit(@Param("id") id: string, @Body() body: Partial<UnitBody>) { return this.service.updateUnit(id, body); }
  @Delete("units/:id") disableUnit(@Param("id") id: string) { return this.service.disableUnit(id); }

  @Get("tax-rates") taxRates() { return this.service.taxRates(); }
  @Post("tax-rates") createTaxRate(@Body() body: TaxRateBody) { return this.service.createTaxRate(body); }
  @Patch("tax-rates/:id") updateTaxRate(@Param("id") id: string, @Body() body: Partial<TaxRateBody>) { return this.service.updateTaxRate(id, body); }
  @Delete("tax-rates/:id") disableTaxRate(@Param("id") id: string) { return this.service.disableTaxRate(id); }

  @Get("currencies") currencies() { return this.service.currencies(); }
  @Post("currencies") createCurrency(@Body() body: CurrencyBody) { return this.service.createCurrency(body); }
  @Patch("currencies/:code") updateCurrency(@Param("code") code: string, @Body() body: Partial<CurrencyBody>) { return this.service.updateCurrency(code, body); }
  @Delete("currencies/:code") disableCurrency(@Param("code") code: string) { return this.service.disableCurrency(code); }

  @Get("exchange-rates") exchangeRates() { return this.service.exchangeRates(); }
  @Post("exchange-rates") createExchangeRate(@Body() body: ExchangeRateBody, @Req() req: any) { return this.service.createExchangeRate(body, req.user?.sub); }

  @Get("warehouses") warehouses() { return this.service.warehouses(); }
  @Post("warehouses") createWarehouse(@Body() body: NamedCodeBody) { return this.service.createWarehouse(body); }
  @Get("locations") locations() { return this.service.locations(); }
  @Post("locations") createLocation(@Body() body: LocationBody) { return this.service.createLocation(body); }
  @Patch("locations/:id") updateLocation(@Param("id") id: string, @Body() body: Partial<LocationBody>) { return this.service.updateLocation(id, body); }

  @Get("system") systemSettings() { return this.service.systemSettings(); }
  @Patch("system/:key") updateSystemSetting(@Param("key") key: string, @Body() body: { value: unknown }, @Req() req: any) { return this.service.updateSystemSetting(key, body.value, req.user?.sub); }
}
