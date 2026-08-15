import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, Patch, Post } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma.service";
import { Permissions } from "../security";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  users() { return this.prisma.user.findMany({ select: { id: true, username: true, displayName: true, wecomUserId: true, isActive: true, createdAt: true, userRoles: { select: { role: { select: { id: true, code: true, name: true } } } } }, orderBy: { username: "asc" } }); }
  async createUser(body: { username: string; displayName: string; password: string; wecomUserId?: string; roleIds?: string[] }) {
    const company = await this.prisma.company.findFirstOrThrow();
    const user = await this.prisma.user.create({ data: { companyId: company.id, username: body.username, displayName: body.displayName, wecomUserId: body.wecomUserId?.trim() || undefined, passwordHash: await bcrypt.hash(body.password || "ChangeMe123!", 10), userRoles: { create: (body.roleIds ?? []).map((roleId) => ({ roleId, companyId: company.id })) } }, select: { id: true, username: true, displayName: true, wecomUserId: true, isActive: true } });
    return user;
  }
  async updateUser(id: string, body: { displayName?: string; isActive?: boolean; password?: string; wecomUserId?: string; roleIds?: string[] }) {
    const data: any = { displayName: body.displayName, isActive: body.isActive };
    if (body.wecomUserId !== undefined) data.wecomUserId = body.wecomUserId.trim() || null;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);
    const user = await this.prisma.user.update({ where: { id }, data, select: { id: true, username: true, displayName: true, wecomUserId: true, isActive: true } });
    if (body.roleIds) { const current = await this.prisma.userRole.findMany({ where: { userId: id } }); const companyId = current[0]?.companyId ?? (await this.prisma.company.findFirstOrThrow()).id; await this.prisma.$transaction([this.prisma.userRole.deleteMany({ where: { userId: id } }), ...body.roleIds.map((roleId) => this.prisma.userRole.create({ data: { userId: id, roleId, companyId } }))]); }
    return user;
  }
  deactivateUser(id: string) { return this.prisma.user.update({ where: { id }, data: { isActive: false }, select: { id: true, username: true, isActive: true } }); }
  roles() { return this.prisma.role.findMany({ include: { rolePermissions: { include: { permission: true } } }, orderBy: { name: "asc" } }); }
  createRole(body: { code: string; name: string; description?: string; permissionIds?: string[] }) { return this.prisma.role.create({ data: { code: body.code, name: body.name, description: body.description, rolePermissions: { create: (body.permissionIds ?? []).map((permissionId) => ({ permissionId })) } }, include: { rolePermissions: true } }); }
  async updateRole(id: string, body: { name?: string; description?: string; isActive?: boolean; permissionIds?: string[] }) { const role = await this.prisma.role.update({ where: { id }, data: { name: body.name, description: body.description, isActive: body.isActive }, include: { rolePermissions: true } }); if (body.permissionIds) { await this.prisma.$transaction([this.prisma.rolePermission.deleteMany({ where: { roleId: id } }), ...body.permissionIds.map((permissionId) => this.prisma.rolePermission.create({ data: { roleId: id, permissionId } }))]); } return role; }
  async deactivateRole(id: string) { const role = await this.prisma.role.findUniqueOrThrow({ where: { id } }); if (role.isSystem) throw new BadRequestException("系统内置角色不能停用"); return this.prisma.role.update({ where: { id }, data: { isActive: false }, select: { id: true, code: true, isActive: true } }); }
  permissions() { return this.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { code: "asc" }] }); }
}

@Controller("admin")
@Permissions("system.manage")
export class AdminController {
  constructor(private readonly service: AdminService) {}
  @Get("users") users() { return this.service.users(); }
  @Post("users") createUser(@Body() body: any) { return this.service.createUser(body); }
  @Patch("users/:id") updateUser(@Param("id") id: string, @Body() body: any) { return this.service.updateUser(id, body); }
  @Delete("users/:id") deactivateUser(@Param("id") id: string) { return this.service.deactivateUser(id); }
  @Get("roles") roles() { return this.service.roles(); }
  @Post("roles") createRole(@Body() body: any) { return this.service.createRole(body); }
  @Patch("roles/:id") updateRole(@Param("id") id: string, @Body() body: any) { return this.service.updateRole(id, body); }
  @Delete("roles/:id") deactivateRole(@Param("id") id: string) { return this.service.deactivateRole(id); }
  @Get("permissions") permissions() { return this.service.permissions(); }
}
