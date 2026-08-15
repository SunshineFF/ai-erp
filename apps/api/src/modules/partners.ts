import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";

type PartnerBody = { code: string; name: string; contactName?: string; phone?: string; address?: string; currencyCode?: string };

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}
  private company() { return this.prisma.company.findFirstOrThrow(); }
  suppliers() { return this.prisma.supplier.findMany({ orderBy: { code: "asc" } }); }
  customers() { return this.prisma.customer.findMany({ orderBy: { code: "asc" } }); }
  async createSupplier(body: PartnerBody) { const company = await this.company(); return this.prisma.supplier.create({ data: { companyId: company.id, ...body } }); }
  async createCustomer(body: PartnerBody) { const company = await this.company(); return this.prisma.customer.create({ data: { companyId: company.id, ...body } }); }
  updateSupplier(id: string, body: Partial<PartnerBody>) { return this.prisma.supplier.update({ where: { id }, data: body }); }
  updateCustomer(id: string, body: Partial<PartnerBody>) { return this.prisma.customer.update({ where: { id }, data: body }); }
  removeSupplier(id: string) { return this.prisma.supplier.update({ where: { id }, data: { isActive: false } }); }
  removeCustomer(id: string) { return this.prisma.customer.update({ where: { id }, data: { isActive: false } }); }
}

@Controller("suppliers")
@Permissions("supplier.view")
export class SuppliersController {
  constructor(private readonly service: PartnersService) {}
  @Get() suppliers() { return this.service.suppliers(); }
  @Post() @Permissions("supplier.manage") create(@Body() body: PartnerBody) { return this.service.createSupplier(body); }
  @Patch(":id") @Permissions("supplier.manage") update(@Param("id") id: string, @Body() body: Partial<PartnerBody>) { return this.service.updateSupplier(id, body); }
  @Delete(":id") @Permissions("supplier.manage") remove(@Param("id") id: string) { return this.service.removeSupplier(id); }
}

@Controller("customers")
@Permissions("customer.view")
export class CustomersController {
  constructor(private readonly service: PartnersService) {}
  @Get() customers() { return this.service.customers(); }
  @Post() @Permissions("customer.manage") create(@Body() body: PartnerBody) { return this.service.createCustomer(body); }
  @Patch(":id") @Permissions("customer.manage") update(@Param("id") id: string, @Body() body: Partial<PartnerBody>) { return this.service.updateCustomer(id, body); }
  @Delete(":id") @Permissions("customer.manage") remove(@Param("id") id: string) { return this.service.removeCustomer(id); }
}
