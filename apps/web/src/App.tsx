import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { request } from "./api";
import { LoginPage } from "./auth/LoginPage";
import { AppShell, canAccess, navItems } from "./layout/AppShell";
import type { CurrentUser } from "./types";
import { AdminPage, BillDetailPage, BomsPage, CustomersPage, CustomerDetailPage, DashboardPage, FinancePage, ForbiddenPage, ImportsPage, InventoryPage, MaterialsPage, NotFoundPage, OperationsPage, ProductionOrdersPage, PurchaseOrdersPage, ReportsPage, SalesOrdersPage, SettingsPage, ShipmentsPage, SuppliersPage, SupplierDetailPage } from "./pages/BusinessPages";

const pageComponents: Record<string, React.ComponentType> = { "/dashboard": DashboardPage, "/materials": MaterialsPage, "/boms": BomsPage, "/suppliers": SuppliersPage, "/customers": CustomersPage, "/purchase-orders": PurchaseOrdersPage, "/sales-orders": SalesOrdersPage, "/shipments": ShipmentsPage, "/inventory": InventoryPage, "/production-orders": ProductionOrdersPage, "/operations": OperationsPage, "/imports": ImportsPage, "/reports": ReportsPage, "/finance": FinancePage, "/admin": AdminPage, "/settings": SettingsPage };

class AppErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Application render failed", error, info); }
  render() {
    if (this.state.error) return <main className="login-shell"><div className="login-card"><h1>页面加载失败</h1><p className="error banner">{this.state.error.message || "发生未知错误"}</p><button className="primary" onClick={() => window.location.reload()}>重新加载</button></div></main>;
    return this.props.children;
  }
}

export function App() {
  const [user, setUser] = useState<CurrentUser | null>(() => { try { return JSON.parse(localStorage.getItem("erp_user") ?? "null"); } catch { return null; } });
  const [checking, setChecking] = useState(Boolean(localStorage.getItem("erp_token")));
  useEffect(() => { if (!localStorage.getItem("erp_token")) { setChecking(false); return; } void request<CurrentUser>("/auth/me").then((current) => { setUser(current); localStorage.setItem("erp_user", JSON.stringify(current)); }).catch(() => { localStorage.removeItem("erp_token"); localStorage.removeItem("erp_user"); setUser(null); }).finally(() => setChecking(false)); }, []);
  if (checking) return <main className="login-shell"><div className="login-card">正在验证登录...</div></main>;
  if (!user) return <LoginPage onLogin={setUser} />;
  const logout = () => { localStorage.removeItem("erp_token"); localStorage.removeItem("erp_user"); setUser(null); };
  const firstPath = navItems.find((item) => canAccess(user, item[3]))?.[0] ?? "/forbidden";
  return <AppErrorBoundary><BrowserRouter><Routes><Route element={<AppShell user={user} onLogout={logout} />}><Route index element={<Navigate to={firstPath} replace />} /><Route path="/suppliers/:id" element={canAccess(user, "supplier.view") ? <SupplierDetailPage /> : <ForbiddenPage />} /><Route path="/customers/:id" element={canAccess(user, "customer.view") ? <CustomerDetailPage /> : <ForbiddenPage />} /><Route path="/finance/bills/:id" element={canAccess(user, "finance.view") ? <BillDetailPage /> : <ForbiddenPage />} />{navItems.map(([path, _label, _icon, permission]) => { const Page = pageComponents[path]; return <Route key={path} path={path} element={canAccess(user, permission) ? <Page /> : <ForbiddenPage />} />; })}<Route path="forbidden" element={<ForbiddenPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes></BrowserRouter></AppErrorBoundary>;
}
