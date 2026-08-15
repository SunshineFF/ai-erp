import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({ where: { code: "MAIN" }, update: {}, create: { code: "MAIN", name: "橡胶件制造 ERP" } });
  await prisma.currency.upsert({ where: { code: "CNY" }, update: {}, create: { code: "CNY", name: "人民币", symbol: "¥", isBaseCurrency: true } });
  await prisma.currency.upsert({ where: { code: "USD" }, update: {}, create: { code: "USD", name: "美元", symbol: "$" } });
  const adminRole = await prisma.role.upsert({ where: { code: "SYSTEM_ADMIN" }, update: {}, create: { code: "SYSTEM_ADMIN", name: "系统管理员", isSystem: true } });
  const permissionDefinitions = [
    ["system.manage", "系统管理", "系统", "manage"],
    ["material.view", "查看物料", "物料", "view"],
    ["material.manage", "维护物料", "物料", "manage"],
    ["bom.view", "查看 BOM", "BOM", "view"],
    ["bom.manage", "维护 BOM", "BOM", "manage"],
    ["bom.publish", "发布 BOM", "BOM", "publish"],
    ["bom.export", "导出 BOM", "BOM", "export"],
    ["inventory.view", "查看库存", "库存", "view"],
    ["inventory.receive", "采购收货", "库存", "receive"],
    ["inventory.post", "库存过账", "库存", "post"],
    ["inventory.reverse", "库存冲销", "库存", "reverse"],
    ["inventory.stocktake", "盘点调整", "库存", "stocktake"],
    ["inventory.trace", "批次追溯", "库存", "trace"],
    ["inventory.adjust", "库存调整", "库存", "adjust"],
    ["inventory.scrap", "库存报废", "库存", "scrap"],
    ["production.view", "查看生产订单", "生产", "view"],
    ["production.manage", "维护生产订单", "生产", "manage"],
    ["production.issue", "生产领退料", "生产", "issue"],
    ["production.complete", "生产完工", "生产", "complete"],
    ["supplier.view", "查看供应商", "供应商", "view"],
    ["supplier.manage", "维护供应商", "供应商", "manage"],
    ["customer.view", "查看客户", "客户", "view"],
    ["customer.manage", "维护客户", "客户", "manage"],
    ["purchase.view", "查看采购订单", "采购", "view"],
    ["purchase.manage", "维护采购订单", "采购", "manage"],
    ["purchase.return", "采购退货", "采购", "return"],
    ["sales.view", "查看销售订单", "销售", "view"],
    ["sales.manage", "维护销售订单", "销售", "manage"],
    ["sales.ship", "销售发货", "销售", "ship"],
    ["sales.return", "销售退货", "销售", "return"],
    ["finance.view", "查看财务流水", "财务", "view"],
    ["finance.manage", "维护财务流水", "财务", "manage"],
    ["import.view", "查看导入任务", "导入", "view"],
    ["import.upload", "上传并解析文件", "导入", "upload"],
    ["import.confirm", "确认导入草稿", "导入", "confirm"],
    ["report.view", "查看经营报表", "报表", "view"],
  ] as const;
  for (const [code, name, module, action] of permissionDefinitions) {
    const permission = await prisma.permission.upsert({ where: { code }, update: { name, module, action }, create: { code, name, module, action } });
    if (code === "system.manage") await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } }, update: {}, create: { roleId: adminRole.id, permissionId: permission.id } });
  }
  const user = await prisma.user.upsert({ where: { username: "admin" }, update: {}, create: { companyId: company.id, username: "admin", displayName: "系统管理员", passwordHash: await bcrypt.hash("Admin123!", 10) } });
  await prisma.userRole.upsert({ where: { userId_roleId_companyId: { userId: user.id, roleId: adminRole.id, companyId: company.id } }, update: {}, create: { userId: user.id, roleId: adminRole.id, companyId: company.id } });
  await prisma.systemSetting.upsert({ where: { companyId_settingKey: { companyId: company.id, settingKey: "inventory.reversal_window_days" } }, update: {}, create: { companyId: company.id, settingKey: "inventory.reversal_window_days", settingValue: 7, description: "库存冲销允许时限（天）" } });
  await prisma.systemSetting.upsert({ where: { companyId_settingKey: { companyId: company.id, settingKey: "finance.period_closed" } }, update: {}, create: { companyId: company.id, settingKey: "finance.period_closed", settingValue: false, description: "财务期间是否已结账" } });
  await prisma.exchangeRate.upsert({ where: { companyId_currencyCode_rateDate: { companyId: company.id, currencyCode: "USD", rateDate: new Date("2026-08-01") } }, update: {}, create: { companyId: company.id, currencyCode: "USD", rateDate: new Date("2026-08-01"), rateToCny: 7.18 } });
  const kg = await prisma.unit.upsert({ where: { companyId_code: { companyId: company.id, code: "KG" } }, update: {}, create: { companyId: company.id, code: "KG", name: "千克", precision: 3 } });
  await prisma.unit.upsert({ where: { companyId_code: { companyId: company.id, code: "PCS" } }, update: {}, create: { companyId: company.id, code: "PCS", name: "件", precision: 0 } });
  await prisma.materialCategory.upsert({ where: { companyId_code: { companyId: company.id, code: "RAW" } }, update: {}, create: { companyId: company.id, code: "RAW", name: "原材料" } });
  await prisma.materialCategory.upsert({ where: { companyId_code: { companyId: company.id, code: "FINISHED" } }, update: {}, create: { companyId: company.id, code: "FINISHED", name: "成品" } });
  const warehouse = await prisma.warehouse.upsert({ where: { companyId_code: { companyId: company.id, code: "MAIN" } }, update: {}, create: { companyId: company.id, code: "MAIN", name: "主仓库" } });
  await prisma.location.upsert({ where: { warehouseId_code: { warehouseId: warehouse.id, code: "RAW-A01" } }, update: {}, create: { warehouseId: warehouse.id, code: "RAW-A01", name: "原料区 A01", locationType: "RAW" } });
  await prisma.location.upsert({ where: { warehouseId_code: { warehouseId: warehouse.id, code: "FG-D01" } }, update: {}, create: { warehouseId: warehouse.id, code: "FG-D01", name: "成品区 D01", locationType: "FINISHED_GOODS" } });
  await prisma.location.upsert({ where: { warehouseId_code: { warehouseId: warehouse.id, code: "WIP-C01" } }, update: {}, create: { warehouseId: warehouse.id, code: "WIP-C01", name: "生产暂存区 C01", locationType: "WIP" } });
  await prisma.location.upsert({ where: { warehouseId_code: { warehouseId: warehouse.id, code: "RET-R01" } }, update: {}, create: { warehouseId: warehouse.id, code: "RET-R01", name: "退货区 R01", locationType: "RETURN" } });
  await prisma.location.upsert({ where: { warehouseId_code: { warehouseId: warehouse.id, code: "QUA-Q01" } }, update: {}, create: { warehouseId: warehouse.id, code: "QUA-Q01", name: "隔离区 Q01", locationType: "QUARANTINE" } });
  for (const rate of [0.13, 0.09, 0.06, 0.03, 0]) await prisma.taxRate.upsert({ where: { companyId_code_effectiveFrom: { companyId: company.id, code: `VAT-${rate}`, effectiveFrom: new Date("2020-01-01") } }, update: {}, create: { companyId: company.id, code: `VAT-${rate}`, name: `增值税 ${rate * 100}%`, rate, effectiveFrom: new Date("2020-01-01") } });
  console.log({ company: company.code, defaultUnit: kg.code, username: "admin" });
}
main().finally(async () => prisma.$disconnect());
