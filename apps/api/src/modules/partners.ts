import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, Patch, Post, Query } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";
import { PaginationQuery, pageResult, parsePagination } from "../pagination";
import { deleteConflict, deleted, ensureFound } from "../delete-errors";

type PartnerBody = { code?: string; name: string; partnerCategoryId?: string; materialCategoryId?: string; contactName?: string; phone?: string; address?: string; currencyCode?: string };
type CategoryLinkBody = { categoryId: string; isActive?: boolean };
type ProductBody = { materialId: string; isActive?: boolean; remark?: string };
type QuoteBody = { currencyCode?: string; unitId: string; taxIncludedPrice: number; cashPrice?: number; supplierTaxRate: number; effectiveFrom: string; effectiveTo?: string; transportMode?: string; deliveryTerms?: string; freightNote?: string; isActive?: boolean };
type ContactBody = { name: string; title?: string; mobile?: string; landline?: string; email?: string; isPrimary?: boolean; isActive?: boolean };
type AddressBody = { province?: string; city?: string; district?: string; detail: string; shippingPlace?: string; isDefault?: boolean; isActive?: boolean };

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}
  private company() { return this.prisma.company.findFirstOrThrow(); }

  private async nextCodeWith(client: any, kind: "supplier" | "customer", categoryId: string) {
    if (!categoryId?.trim()) throw new BadRequestException(kind === "supplier" ? "请选择物料分类" : "请选择客户分类");
    const company = await client.company.findFirstOrThrow();
    if (kind === "supplier") {
      const category = ensureFound(await client.materialCategory.findFirst({ where: { id: categoryId, companyId: company.id } }), "物料分类不存在");
      const prefix = `${category.code.trim().toUpperCase()}S`;
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const existing = await client.supplier.findMany({ where: { companyId: company.id, materialCategoryId: categoryId, code: { startsWith: prefix } }, select: { code: true } });
      const pattern = new RegExp(`^${escapedPrefix}(\\d{5})$`, "i");
      const maxSequence = existing.reduce((max: number, item: { code: string }) => { const match = pattern.exec(item.code); return match ? Math.max(max, Number(match[1])) : max; }, 0);
      if (maxSequence >= 99999) throw new BadRequestException(`物料分类“${category.name}”的供应商编码序号已达到上限`);
      return `${prefix}${String(maxSequence + 1).padStart(5, "0")}`;
    }
    const category = ensureFound(await client.partnerCategory.findFirst({ where: { id: categoryId, companyId: company.id, partnerType: kind } }), "往来单位分类不存在");
    const prefix = `${category.code.trim().toUpperCase()}C`;
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await client[kind].findMany({ where: { companyId: company.id, partnerCategoryId: categoryId, code: { startsWith: prefix } }, select: { code: true } });
    const pattern = new RegExp(`^${escapedPrefix}(\\d{5})$`, "i");
    const maxSequence = existing.reduce((max: number, item: { code: string }) => { const match = pattern.exec(item.code); return match ? Math.max(max, Number(match[1])) : max; }, 0);
    if (maxSequence >= 99999) throw new BadRequestException(`分类“${category.name}”的客户编码序号已达到上限`);
    return `${prefix}${String(maxSequence + 1).padStart(5, "0")}`;
  }

  async nextCode(kind: "supplier" | "customer", categoryId: string) {
    return this.nextCodeWith(this.prisma, kind, categoryId);
  }

  private async createPartner(kind: "supplier" | "customer", body: PartnerBody) {
    const company = await this.prisma.company.findFirstOrThrow();
    if (kind === "supplier") {
      if (!body.materialCategoryId?.trim()) throw new BadRequestException("请选择物料分类");
      ensureFound(await (this.prisma as any).materialCategory.findFirst({ where: { id: body.materialCategoryId, companyId: company.id } }), "物料分类不存在");
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = await this.nextCode(kind, kind === "supplier" ? body.materialCategoryId! : body.partnerCategoryId!);
      try {
        return await this.prisma.$transaction(async (tx: any) => tx[kind].create({ data: kind === "supplier" ? { companyId: company.id, code, name: body.name, materialCategoryId: body.materialCategoryId, contactName: body.contactName, phone: body.phone, address: body.address, currencyCode: body.currencyCode } : { companyId: company.id, code, name: body.name, partnerCategoryId: body.partnerCategoryId, contactName: body.contactName, phone: body.phone, address: body.address, currencyCode: body.currencyCode } }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if ((error as any)?.code !== "P2002" || attempt === 4) throw error;
      }
    }
    throw new BadRequestException("编码生成失败，请重试");
  }

  async suppliers(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const where: any = query.q ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } : {}; const [items, total] = await Promise.all([this.prisma.supplier.findMany({ where, include: { materialCategory: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.supplier.count({ where })]); return pageResult(items, total, page, pageSize); }
  async customers(query: PaginationQuery = {}) { const { page, pageSize, skip, take } = parsePagination(query); const where: any = query.q ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } : {}; const [items, total] = await Promise.all([this.prisma.customer.findMany({ where, include: { partnerCategory: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.customer.count({ where })]); return pageResult(items, total, page, pageSize); }
  supplierOptions(q?: string, take?: string) { const parsedTake = take === undefined ? undefined : Math.min(Math.max(Number(take) || 10, 1), 50); return this.prisma.supplier.findMany({ where: { isActive: true, ...(q?.trim() ? { OR: [{ code: { contains: q.trim(), mode: "insensitive" } }, { name: { contains: q.trim(), mode: "insensitive" } }] } : {}) }, select: { id: true, code: true, name: true, currencyCode: true, isActive: true }, orderBy: { name: "asc" }, ...(parsedTake ? { take: parsedTake } : {}) }); }
  customerOptions(q?: string, take?: string) { const parsedTake = take === undefined ? undefined : Math.min(Math.max(Number(take) || 10, 1), 50); return this.prisma.customer.findMany({ where: { isActive: true, ...(q?.trim() ? { OR: [{ code: { contains: q.trim(), mode: "insensitive" } }, { name: { contains: q.trim(), mode: "insensitive" } }] } : {}) }, select: { id: true, code: true, name: true, currencyCode: true, isActive: true }, orderBy: { name: "asc" }, ...(parsedTake ? { take: parsedTake } : {}) }); }
  async createSupplier(body: PartnerBody) { return this.createPartner("supplier", body); }
  async createCustomer(body: PartnerBody) { return this.createPartner("customer", body); }
  async updateSupplier(id: string, body: Partial<PartnerBody>) { const { code, partnerCategoryId, ...data } = body; if (data.materialCategoryId !== undefined) { if (!data.materialCategoryId?.trim()) throw new BadRequestException("请选择物料分类"); const company = await this.prisma.company.findFirstOrThrow(); ensureFound(await (this.prisma as any).materialCategory.findFirst({ where: { id: data.materialCategoryId, companyId: company.id } }), "物料分类不存在"); } await this.prisma.supplier.update({ where: { id }, data: { name: data.name, materialCategoryId: data.materialCategoryId, contactName: data.contactName, phone: data.phone, address: data.address, currencyCode: data.currencyCode } }); return this.supplier(id); }
  updateCustomer(id: string, body: Partial<PartnerBody>) { const { code, ...data } = body; return this.prisma.customer.update({ where: { id }, data: { name: data.name, partnerCategoryId: data.partnerCategoryId, contactName: data.contactName, phone: data.phone, address: data.address, currencyCode: data.currencyCode } }); }
  async supplier(id: string) { return (this.prisma as any).supplier.findUniqueOrThrow({ where: { id }, include: { materialCategory: true, contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }, addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] } } }); }
  private async ensureSupplierProduct(supplierId: string, productId: string) { return ensureFound(await (this.prisma as any).supplierProduct.findFirst({ where: { id: productId, supplierId }, include: { material: true } }), "供应商产品不存在"); }
  private async ensureTradeable(materialId: string) { const material: any = ensureFound(await (this.prisma as any).material.findUnique({ where: { id: materialId } }), "物料不存在"); if ((!material.parentMaterialId && material.variantEnabled) || material.materialType === "SERVICE") throw new BadRequestException("供应商产品必须选择普通可交易物料或具体 SKU"); return material; }
  async supplierProducts(supplierId: string, query: PaginationQuery = {}) { await this.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }); const { page, pageSize, skip, take } = parsePagination(query); const where: any = { supplierId, ...(query.q ? { OR: [{ material: { code: { contains: query.q, mode: "insensitive" } } }, { material: { name: { contains: query.q, mode: "insensitive" } } }] } : {}) }; const asOf = new Date(); const include = { material: { include: { variantValues: { include: { attributeValue: { include: { attribute: true } } } } } }, quotes: { where: { isActive: true, effectiveFrom: { lte: asOf }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] }, orderBy: { effectiveFrom: "desc" }, take: 1 } }; const [items, total] = await Promise.all([(this.prisma as any).supplierProduct.findMany({ where, include, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), (this.prisma as any).supplierProduct.count({ where })]); return pageResult(items, total, page, pageSize); }
  async supplierProductOptions(supplierId: string, asOf?: string, q?: string, take?: string) { await this.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }); const date = asOf ? new Date(asOf) : new Date(); const parsedTake = take === undefined ? undefined : Math.min(Math.max(Number(take) || 10, 1), 50); return (this.prisma as any).supplierProduct.findMany({ where: { supplierId, isActive: true, material: { isActive: true, ...(q?.trim() ? { OR: [{ code: { contains: q.trim(), mode: "insensitive" } }, { name: { contains: q.trim(), mode: "insensitive" } }] } : {}) } }, include: { material: { include: { variantValues: { include: { attributeValue: { include: { attribute: true } } } } } }, quotes: { where: { isActive: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }, orderBy: { effectiveFrom: "desc" }, take: 1 } }, orderBy: { material: { code: "asc" } }, ...(parsedTake ? { take: parsedTake } : {}) }); }
  async createSupplierProduct(supplierId: string, body: ProductBody) { await this.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }); await this.ensureTradeable(body.materialId); return (this.prisma as any).supplierProduct.create({ data: { supplierId, materialId: body.materialId, isActive: body.isActive ?? true, remark: body.remark } }); }
  async updateSupplierProduct(supplierId: string, productId: string, body: Partial<ProductBody>) { await this.ensureSupplierProduct(supplierId, productId); if (body.materialId) await this.ensureTradeable(body.materialId); return (this.prisma as any).supplierProduct.update({ where: { id: productId }, data: { materialId: body.materialId, isActive: body.isActive, remark: body.remark } }); }
  async removeSupplierProduct(supplierId: string, productId: string) { const product: any = await this.ensureSupplierProduct(supplierId, productId); const count = await (this.prisma as any).purchaseOrderLine.count({ where: { supplierQuote: { supplierProductId: productId } } }); if (count) deleteConflict(`供应商产品“${product.material.code}”已被采购订单引用，无法删除`, [{ resource: "采购订单明细", count }]); await (this.prisma as any).supplierProduct.delete({ where: { id: productId } }); return deleted(productId); }
  private quoteData(body: QuoteBody) { const from = new Date(body.effectiveFrom); const to = body.effectiveTo ? new Date(body.effectiveTo) : undefined; if (Number.isNaN(from.getTime()) || (to && Number.isNaN(to.getTime())) || (to && to < from)) throw new BadRequestException("报价有效日期无效"); if (body.taxIncludedPrice < 0 || (body.cashPrice !== undefined && body.cashPrice < 0)) throw new BadRequestException("报价不能为负数"); if (body.supplierTaxRate < 0 || body.supplierTaxRate > 1) throw new BadRequestException("供应商税点必须在 0 到 1 之间"); return { currencyCode: body.currencyCode ?? "CNY", unitId: body.unitId, taxIncludedPrice: body.taxIncludedPrice, cashPrice: body.cashPrice, supplierTaxRate: body.supplierTaxRate, effectiveFrom: from, effectiveTo: to, transportMode: body.transportMode, deliveryTerms: body.deliveryTerms, freightNote: body.freightNote, isActive: body.isActive ?? true }; }
  private async assertQuoteNoOverlap(productId: string, data: any, excludeId?: string) { const overlap = await (this.prisma as any).supplierProductQuote.findFirst({ where: { supplierProductId: productId, isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}), effectiveFrom: { lte: data.effectiveTo ?? new Date("9999-12-31") }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: data.effectiveFrom } }] } }); if (overlap) throw new BadRequestException("同一供应商产品的报价有效期不能重叠"); }
  async supplierQuotes(supplierId: string, productId: string, query: PaginationQuery = {}) { await this.ensureSupplierProduct(supplierId, productId); const { page, pageSize, skip, take } = parsePagination(query); const where = { supplierProductId: productId }; const [items, total] = await Promise.all([(this.prisma as any).supplierProductQuote.findMany({ where, orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }], skip, take }), (this.prisma as any).supplierProductQuote.count({ where })]); return pageResult(items, total, page, pageSize); }
  async currentSupplierQuote(supplierId: string, productId: string, asOf?: string) { await this.ensureSupplierProduct(supplierId, productId); const date = asOf ? new Date(asOf) : new Date(); return (this.prisma as any).supplierProductQuote.findFirst({ where: { supplierProductId: productId, isActive: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }, orderBy: { effectiveFrom: "desc" } }); }
  async createSupplierQuote(supplierId: string, productId: string, body: QuoteBody) { await this.ensureSupplierProduct(supplierId, productId); const data = this.quoteData(body); await this.assertQuoteNoOverlap(productId, data); return (this.prisma as any).supplierProductQuote.create({ data: { ...data, supplierProductId: productId } }); }
  async updateSupplierQuote(supplierId: string, productId: string, id: string, body: Partial<QuoteBody>) { await this.ensureSupplierProduct(supplierId, productId); const current: any = ensureFound(await (this.prisma as any).supplierProductQuote.findFirst({ where: { id, supplierProductId: productId } }), "供应商报价不存在"); const data = this.quoteData({ ...current, ...body, effectiveFrom: body.effectiveFrom ?? current.effectiveFrom.toISOString().slice(0, 10) }); await this.assertQuoteNoOverlap(productId, data, id); return (this.prisma as any).supplierProductQuote.update({ where: { id }, data }); }
  async removeSupplierQuote(supplierId: string, productId: string, id: string) { await this.ensureSupplierProduct(supplierId, productId); ensureFound(await (this.prisma as any).supplierProductQuote.findFirst({ where: { id, supplierProductId: productId } }), "供应商报价不存在"); const count = await (this.prisma as any).purchaseOrderLine.count({ where: { supplierQuoteId: id } }); if (count) deleteConflict("该报价已被采购订单引用，无法删除", [{ resource: "采购订单明细", count }]); await (this.prisma as any).supplierProductQuote.delete({ where: { id } }); return deleted(id); }
  async supplierContacts(supplierId: string) { await this.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }); return (this.prisma as any).supplierContact.findMany({ where: { supplierId }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] }); }
  async createSupplierContact(supplierId: string, body: ContactBody) { await this.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }); return this.prisma.$transaction(async (tx: any) => { if (body.isPrimary) await tx.supplierContact.updateMany({ where: { supplierId }, data: { isPrimary: false } }); return tx.supplierContact.create({ data: { supplierId, ...body } }); }); }
  async updateSupplierContact(supplierId: string, id: string, body: Partial<ContactBody>) { ensureFound(await (this.prisma as any).supplierContact.findFirst({ where: { id, supplierId } }), "供应商联系人不存在"); return this.prisma.$transaction(async (tx: any) => { if (body.isPrimary) await tx.supplierContact.updateMany({ where: { supplierId }, data: { isPrimary: false } }); return tx.supplierContact.update({ where: { id }, data: body }); }); }
  async removeSupplierContact(supplierId: string, id: string) { ensureFound(await (this.prisma as any).supplierContact.findFirst({ where: { id, supplierId } }), "供应商联系人不存在"); await (this.prisma as any).supplierContact.delete({ where: { id } }); return deleted(id); }
  async supplierAddresses(supplierId: string) { await this.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }); return (this.prisma as any).supplierAddress.findMany({ where: { supplierId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }); }
  async createSupplierAddress(supplierId: string, body: AddressBody) { await this.prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } }); return this.prisma.$transaction(async (tx: any) => { if (body.isDefault) await tx.supplierAddress.updateMany({ where: { supplierId }, data: { isDefault: false } }); return tx.supplierAddress.create({ data: { supplierId, ...body } }); }); }
  async updateSupplierAddress(supplierId: string, id: string, body: Partial<AddressBody>) { ensureFound(await (this.prisma as any).supplierAddress.findFirst({ where: { id, supplierId } }), "供应商发货地址不存在"); return this.prisma.$transaction(async (tx: any) => { if (body.isDefault) await tx.supplierAddress.updateMany({ where: { supplierId }, data: { isDefault: false } }); return tx.supplierAddress.update({ where: { id }, data: body }); }); }
  async removeSupplierAddress(supplierId: string, id: string) { ensureFound(await (this.prisma as any).supplierAddress.findFirst({ where: { id, supplierId } }), "供应商发货地址不存在"); await (this.prisma as any).supplierAddress.delete({ where: { id } }); return deleted(id); }
  async removeSupplier(id: string) { const item = ensureFound(await this.prisma.supplier.findUnique({ where: { id } }), "供应商不存在"); const [orders, bills] = await Promise.all([this.prisma.purchaseOrder.count({ where: { supplierId: id } }), this.prisma.bill.count({ where: { supplierId: id } })]); if (orders || bills) deleteConflict(`供应商“${item.code} · ${item.name}”存在历史引用，无法删除`, [{ resource: "采购订单", count: orders }, { resource: "账单", count: bills }].filter((x) => x.count)); await this.prisma.supplier.delete({ where: { id } }); return deleted(id); }
  async removeCustomer(id: string) { const item = ensureFound(await this.prisma.customer.findUnique({ where: { id } }), "客户不存在"); const [orders, bills, shipments] = await Promise.all([this.prisma.salesOrder.count({ where: { customerId: id } }), this.prisma.bill.count({ where: { customerId: id } }), this.prisma.salesShipment.count({ where: { customerId: id } })]); if (orders || bills || shipments) deleteConflict(`客户“${item.code} · ${item.name}”存在历史引用，无法删除`, [{ resource: "销售订单", count: orders }, { resource: "账单", count: bills }, { resource: "出库单", count: shipments }].filter((x) => x.count)); await this.prisma.customer.delete({ where: { id } }); return deleted(id); }
}

@Controller("suppliers")
@Permissions("supplier.view")
export class SuppliersController {
  constructor(private readonly service: PartnersService) {}
  @Get() suppliers(@Query() query: PaginationQuery) { return this.service.suppliers(query); }
  @Get("options") options(@Query("q") q?: string, @Query("take") take?: string) { return this.service.supplierOptions(q, take); }
  @Get("next-code") @Permissions("supplier.view") async nextCode(@Query("categoryId") categoryId: string) { return { code: await this.service.nextCode("supplier", categoryId) }; }
  @Get(":id") detail(@Param("id") id: string) { return this.service.supplier(id); }
  @Get(":id/products") products(@Param("id") id: string, @Query() query: PaginationQuery) { return this.service.supplierProducts(id, query); }
  @Get(":id/products/options") productOptions(@Param("id") id: string, @Query("asOf") asOf?: string, @Query("q") q?: string, @Query("take") take?: string) { return this.service.supplierProductOptions(id, asOf, q, take); }
  @Post(":id/products") @Permissions("supplier.manage") createProduct(@Param("id") id: string, @Body() body: ProductBody) { return this.service.createSupplierProduct(id, body); }
  @Patch(":id/products/:productId") @Permissions("supplier.manage") updateProduct(@Param("id") id: string, @Param("productId") productId: string, @Body() body: Partial<ProductBody>) { return this.service.updateSupplierProduct(id, productId, body); }
  @Delete(":id/products/:productId") @Permissions("supplier.manage") removeProduct(@Param("id") id: string, @Param("productId") productId: string) { return this.service.removeSupplierProduct(id, productId); }
  @Get(":id/products/:productId/quotes") quotes(@Param("id") id: string, @Param("productId") productId: string, @Query() query: PaginationQuery) { return this.service.supplierQuotes(id, productId, query); }
  @Get(":id/products/:productId/quotes/current") currentQuote(@Param("id") id: string, @Param("productId") productId: string, @Query("asOf") asOf?: string) { return this.service.currentSupplierQuote(id, productId, asOf); }
  @Post(":id/products/:productId/quotes") @Permissions("supplier.manage") createQuote(@Param("id") id: string, @Param("productId") productId: string, @Body() body: QuoteBody) { return this.service.createSupplierQuote(id, productId, body); }
  @Patch(":id/products/:productId/quotes/:quoteId") @Permissions("supplier.manage") updateQuote(@Param("id") id: string, @Param("productId") productId: string, @Param("quoteId") quoteId: string, @Body() body: Partial<QuoteBody>) { return this.service.updateSupplierQuote(id, productId, quoteId, body); }
  @Delete(":id/products/:productId/quotes/:quoteId") @Permissions("supplier.manage") removeQuote(@Param("id") id: string, @Param("productId") productId: string, @Param("quoteId") quoteId: string) { return this.service.removeSupplierQuote(id, productId, quoteId); }
  @Get(":id/contacts") contacts(@Param("id") id: string) { return this.service.supplierContacts(id); }
  @Post(":id/contacts") @Permissions("supplier.manage") createContact(@Param("id") id: string, @Body() body: ContactBody) { return this.service.createSupplierContact(id, body); }
  @Patch(":id/contacts/:contactId") @Permissions("supplier.manage") updateContact(@Param("id") id: string, @Param("contactId") contactId: string, @Body() body: Partial<ContactBody>) { return this.service.updateSupplierContact(id, contactId, body); }
  @Delete(":id/contacts/:contactId") @Permissions("supplier.manage") removeContact(@Param("id") id: string, @Param("contactId") contactId: string) { return this.service.removeSupplierContact(id, contactId); }
  @Get(":id/addresses") addresses(@Param("id") id: string) { return this.service.supplierAddresses(id); }
  @Post(":id/addresses") @Permissions("supplier.manage") createAddress(@Param("id") id: string, @Body() body: AddressBody) { return this.service.createSupplierAddress(id, body); }
  @Patch(":id/addresses/:addressId") @Permissions("supplier.manage") updateAddress(@Param("id") id: string, @Param("addressId") addressId: string, @Body() body: Partial<AddressBody>) { return this.service.updateSupplierAddress(id, addressId, body); }
  @Delete(":id/addresses/:addressId") @Permissions("supplier.manage") removeAddress(@Param("id") id: string, @Param("addressId") addressId: string) { return this.service.removeSupplierAddress(id, addressId); }
  @Post() @Permissions("supplier.manage") create(@Body() body: PartnerBody) { return this.service.createSupplier(body); }
  @Patch(":id") @Permissions("supplier.manage") update(@Param("id") id: string, @Body() body: Partial<PartnerBody>) { return this.service.updateSupplier(id, body); }
  @Delete(":id") @Permissions("supplier.manage") remove(@Param("id") id: string) { return this.service.removeSupplier(id); }
}

@Controller("customers")
@Permissions("customer.view")
export class CustomersController {
  constructor(private readonly service: PartnersService) {}
  @Get() customers(@Query() query: PaginationQuery) { return this.service.customers(query); }
  @Get("options") options(@Query("q") q?: string, @Query("take") take?: string) { return this.service.customerOptions(q, take); }
  @Get("next-code") @Permissions("customer.view") async nextCode(@Query("categoryId") categoryId: string) { return { code: await this.service.nextCode("customer", categoryId) }; }
  @Post() @Permissions("customer.manage") create(@Body() body: PartnerBody) { return this.service.createCustomer(body); }
  @Patch(":id") @Permissions("customer.manage") update(@Param("id") id: string, @Body() body: Partial<PartnerBody>) { return this.service.updateCustomer(id, body); }
  @Delete(":id") @Permissions("customer.manage") remove(@Param("id") id: string) { return this.service.removeCustomer(id); }
}
