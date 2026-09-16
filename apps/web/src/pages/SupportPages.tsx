import { AdminPanel } from "../features/admin/AdminPanel";
import { FinancePanel } from "../FinancePanel";
import { ImportsPanel } from "../ImportsPanel";
import { OperationsPanel } from "../OperationsPanel";
import { ReportsPanel } from "../ReportsPanel";
import { SettingsPanel } from "../SettingsPanel";
import { useAuxiliaryData } from "./PageSupport";
export function FinancePage() { const { suppliers, customers } = useAuxiliaryData({ suppliers: true, customers: true }); return <FinancePanel suppliers={suppliers} customers={customers} />; }
export function AdminPage() { return <AdminPanel />; }
export function OperationsPage() { return <OperationsPanel />; }
export function ImportsPage() { return <ImportsPanel />; }
export function ReportsPage() { return <ReportsPanel />; }
export function SettingsPage() { return <SettingsPanel />; }
