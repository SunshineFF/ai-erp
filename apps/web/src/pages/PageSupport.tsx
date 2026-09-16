import { useEffect, useState, type ReactNode } from "react";
import { request } from "../api";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { Pagination } from "../shared/Pagination";
export function useAuxiliaryData(needs: { suppliers?: boolean; customers?: boolean; sales?: boolean; topLevelMaterials?: boolean } = {}) {
  const [bootstrap, setBootstrap] = useState<any>({ materials: [], units: [], categories: [], locations: [], taxRates: [] });
  const [suppliers, setSuppliers] = useState<any[]>([]); const [customers, setCustomers] = useState<any[]>([]); const [sales, setSales] = useState<any[]>([]);
  const load = async () => { const [base, materialRows, supplierRows, customerRows, salesRows] = await Promise.all([request<any>("/materials/bootstrap"), request<any[]>(`/materials/options${needs.topLevelMaterials ? "?topLevel=true" : ""}`), needs.suppliers ? request<any[]>("/suppliers/options") : Promise.resolve([]), needs.customers ? request<any[]>("/customers/options") : Promise.resolve([]), needs.sales ? request<any[]>("/sales-orders/options") : Promise.resolve([])]); setBootstrap({ ...base, materials: materialRows }); setSuppliers(supplierRows); setCustomers(customerRows); setSales(salesRows); };
  useEffect(() => { void load(); }, []);
  return { bootstrap, suppliers, customers, sales, reload: load };
}
export function Paged({ resource, children }: { resource: ReturnType<typeof usePaginatedResource<any>>; children: ReactNode }) {
  return <>{resource.error && <div className="error banner">{resource.error}</div>}{resource.loading && !resource.items.length && <div className="empty">加载中...</div>}{children}<Pagination page={resource.page} pageSize={resource.pageSize} total={resource.total} onPageChange={resource.setPage} onPageSizeChange={resource.setPageSize} /></>;
}
