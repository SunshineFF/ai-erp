import { useEffect, useState } from "react";
import { request } from "../api";
import { Dashboard } from "../features/dashboard/Dashboard";
import type { Material, PageResult } from "../types";
export function DashboardPage() { const [summary, setSummary] = useState<any>(); const [orders, setOrders] = useState<any[]>([]); const [materials, setMaterials] = useState<Material[]>([]); useEffect(() => { void Promise.all([request<any>("/dashboard"), request<any>("/materials/bootstrap"), request<PageResult<any>>("/production-orders?page=1&pageSize=20")]).then(([value, base, production]) => { setSummary(value); setMaterials(base.materials ?? []); setOrders(production.items); }); }, []); return <Dashboard summary={summary} batches={summary?.expiringBatches ?? []} orders={orders} materials={materials} />; }
