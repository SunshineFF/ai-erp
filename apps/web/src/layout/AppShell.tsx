import { BarChart3, Boxes, Building2, Factory, FileCog, FileSpreadsheet, Handshake, LayoutDashboard, LogOut, PackageCheck, ReceiptText, ScanLine, Settings2, ShieldCheck, ShoppingCart, UserRoundCog, WalletCards, Warehouse } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { CurrentUser } from "../types";

export const navItems = [
  ["/dashboard", "工作台", LayoutDashboard], ["/materials", "物料主数据", Boxes, "material.view"], ["/boms", "配方 BOM", FileCog, "bom.view"], ["/suppliers", "供应商", Building2, "supplier.view"], ["/customers", "客户", Handshake, "customer.view"], ["/purchase-orders", "采购订单", ShoppingCart, "purchase.view"], ["/sales-orders", "销售订单", ReceiptText, "sales.view"], ["/shipments", "出库单", PackageCheck, "sales.ship"], ["/inventory", "库存", Warehouse, "inventory.view"], ["/production-orders", "生产订单", Factory, "production.view"], ["/operations", "现场作业", ScanLine, "inventory.post"], ["/imports", "文件导入", FileSpreadsheet, "import.view"], ["/reports", "查询报表", BarChart3, "report.view"], ["/finance", "财务", WalletCards, "finance.view"], ["/admin", "用户与权限", UserRoundCog, "system.manage"], ["/settings", "设置", Settings2, "system.manage"],
] as const;

export function canAccess(user: CurrentUser, permission?: string) { return !permission || user.permissions.includes("system.manage") || user.permissions.includes(permission); }

export function AppShell({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const location = useLocation(); const available = navItems.filter((item) => canAccess(user, item[3])); const title = navItems.find((item) => item[0] === location.pathname)?.[1] ?? "橡胶 ERP";
  return <div className="app-shell"><aside className="sidebar"><div className="brand-mark"><Factory size={20} /> 橡胶 ERP</div><div className="sidebar-caption">一期制造工作台</div><nav>{available.map(([path, label, Icon]) => <NavLink className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} to={path} key={path}><Icon size={18} /><span>{label}</span></NavLink>)}</nav><button className="nav-item logout" onClick={onLogout}><LogOut size={18} /><span>退出</span></button></aside><main className="content"><header><div><div className="eyebrow">单公司 · 单仓库 · CNY / USD</div><h1>{title}</h1></div><div className="user-chip"><ShieldCheck size={16} /> {user.displayName || user.username}</div></header><Outlet /></main></div>;
}
