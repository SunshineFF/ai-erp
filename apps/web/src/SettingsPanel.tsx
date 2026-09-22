import { useEffect, useState } from "react";
import { Pencil, Plus, Power, Settings2, X } from "lucide-react";
import { apiRequest } from "./apiClient";
import { DeleteConfirm } from "./shared/DeleteConfirm";
import { Pagination } from "./shared/Pagination";
import { usePaginatedResource } from "./hooks/usePaginatedResource";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3030/api";
type SettingView = "categories" | "units" | "tax-rates" | "currencies" | "exchange-rates" | "warehouses" | "locations" | "product-attributes" | "partner-categories";

async function api<T = any>(path: string, options?: RequestInit) { return apiRequest<T>(API, path, options); }

export function SettingsPanel() {
  const [view, setView] = useState<SettingView>("categories");
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState("");
  const [deleteItem, setDeleteItem] = useState<any>(null); const [deleting, setDeleting] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState<any[]>([]);
  const resource = usePaginatedResource<any>(view === "partner-categories" ? "/settings/partner-categories/customer" : `/settings/${view}`);
  const loadWarehouseOptions = () => api<any[]>("/settings/warehouse-options").then(setWarehouseOptions);
  useEffect(() => { void loadWarehouseOptions().catch(() => undefined); }, []);

  const save = async (form: any) => {
    const key = view === "exchange-rates" ? undefined : view === "currencies" ? editing?.code : editing?.id;
    const endpoint = view === "product-attributes" ? "/settings/product-attributes" : view === "partner-categories" ? "/settings/partner-categories/customer" : `/settings/${view}`;
    const saved = await api<any>(`${endpoint}${key ? `/${key}` : ""}`, { method: key ? "PATCH" : "POST", body: JSON.stringify(form) });
    if (view === "product-attributes") { for (const id of form.removedValueIds ?? []) await api(`/settings/product-attribute-values/${id}`, { method: "DELETE" }); for (const value of form.values ?? []) { if (!value.code || !value.name) continue; if (value.id) await api(`/settings/product-attribute-values/${value.id}`, { method: "PATCH", body: JSON.stringify({ name: value.name, sortOrder: Number(value.sortOrder || 0), isActive: value.isActive !== false }) }); else await api(`/settings/product-attributes/${saved.id}/values`, { method: "POST", body: JSON.stringify({ code: value.code, name: value.name, sortOrder: Number(value.sortOrder || 0), isActive: true }) }); } }
    setEditing(null);
    await Promise.all([resource.reload(), view === "warehouses" ? loadWarehouseOptions() : Promise.resolve()]);
  };
  const remove = async (item: any) => { const endpoint = view === "product-attributes" ? `/settings/product-attributes/${item.id}` : view === "partner-categories" ? `/settings/partner-categories/customer/${item.id}` : `/settings/${view}/${view === "currencies" ? item.code : item.id}`; await api(endpoint, { method: "DELETE" }); await Promise.all([resource.reload(), view === "warehouses" ? loadWarehouseOptions() : Promise.resolve()]); };
  const tabs: [SettingView, string][] = [["categories", "物料分类"], ["partner-categories", "往来单位分类"], ["units", "计量单位"], ["tax-rates", "税率"], ["currencies", "货币"], ["exchange-rates", "汇率"], ["warehouses", "仓库"], ["locations", "库位"], ["product-attributes", "产品属性"]];
  const rows = resource.items;

  return <section className="panel table-panel settings-panel">
    <div className="panel-title"><Settings2 size={18} /><h2>基础设置</h2><button className="primary small" onClick={() => setEditing({})}><Plus size={14} /> 新增</button></div>
    <div className="tabs">{tabs.map(([key, label]) => <button key={key} className={view === key ? "tab active" : "tab"} onClick={() => { setView(key); setEditing(null); }}>{label}</button>)}</div>
    {(error || resource.error) && <div className="error banner">{error || resource.error}</div>}
    <SettingsTable view={view} rows={rows} onEdit={setEditing} onDisable={async (item) => setDeleteItem(item)} />
    <Pagination page={resource.page} pageSize={resource.pageSize} total={resource.total} onPageChange={resource.setPage} onPageSizeChange={resource.setPageSize} />
    <DeleteConfirm target={deleteItem ? { title: deleteItem.name ?? deleteItem.code ?? deleteItem.currencyCode, run: async () => undefined } : undefined} busy={deleting} error={error} onClose={() => setDeleteItem(null)} onConfirm={() => { setDeleting(true); setError(""); void remove(deleteItem).then(() => setDeleteItem(null)).catch((reason) => setError(reason instanceof Error ? reason.message : "删除失败")).finally(() => setDeleting(false)); }} />
    {editing && <SettingsModal title={`${editing.id || editing.code ? "编辑" : "新增"}${tabs.find(([key]) => key === view)?.[1]}`} onClose={() => setEditing(null)}>{view === "product-attributes" ? <ProductAttributeForm initial={editing} onSubmit={save} /> : <SettingForm view={view} initial={editing} warehouseOptions={warehouseOptions} onSubmit={save} />}</SettingsModal>}
  </section>;
}

function SettingsTable({ view, rows, onEdit, onDisable }: { view: SettingView; rows: any[]; onEdit: (item: any) => void; onDisable: (item: any) => Promise<void> }) {
  const details = (item: any) => view === "units" ? `精度 ${item.precision}` : view === "tax-rates" ? `${Number(item.rate) * 100}% · ${new Date(item.effectiveFrom).toLocaleDateString()}` : view === "currencies" ? `${item.symbol} · ${item.decimalPlaces} 位小数${item.isBaseCurrency ? " · 本位币" : ""}` : view === "exchange-rates" ? `1 ${item.currencyCode} = ${item.rateToCny} CNY` : view === "locations" ? item.locationType : view === "warehouses" ? "仓储基础资料" : view === "partner-categories" ? "客户分类" : "物料归类";
  return <div className="table-scroll"><table><thead><tr><th>编码</th><th>名称/日期</th><th>配置</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id ?? item.code}><td>{item.code ?? item.currencyCode}</td><td>{item.name ?? new Date(item.rateDate).toLocaleDateString()}</td><td>{details(item)}</td><td>{item.isActive ? "启用" : "停用"}</td><td><span className="actions"><button className="link-button icon-text" onClick={() => onEdit(item)}><Pencil size={13} />编辑</button>{!(view === "currencies" && item.isBaseCurrency) && <button className="link-button danger icon-text" onClick={() => void onDisable(item)}><Power size={13} />删除</button>}</span></td></tr>)}</tbody></table>{!rows.length && <div className="empty">暂无数据</div>}</div>;
}

function SettingForm({ view, initial, warehouseOptions, onSubmit }: { view: SettingView; initial: any; warehouseOptions: any[]; onSubmit: (form: any) => Promise<void> }) {
  const [form, setForm] = useState({ code: initial.code ?? "", name: initial.name ?? "", precision: String(initial.precision ?? 3), ratePercent: String(initial.rate !== undefined ? Number(initial.rate) * 100 : 13), effectiveFrom: initial.effectiveFrom?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), effectiveTo: initial.effectiveTo?.slice(0, 10) ?? "", symbol: initial.symbol ?? "", decimalPlaces: String(initial.decimalPlaces ?? 2), isBaseCurrency: initial.isBaseCurrency ?? false, isActive: initial.isActive ?? true, currencyCode: initial.currencyCode ?? "USD", rateDate: initial.rateDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), rateToCny: String(initial.rateToCny ?? 7.18), warehouseId: initial.warehouseId ?? warehouseOptions[0]?.id ?? "", locationType: initial.locationType ?? "STORAGE" });
  const submit = () => onSubmit(view === "exchange-rates" ? { currencyCode: form.currencyCode, rateDate: form.rateDate, rateToCny: Number(form.rateToCny), isActive: form.isActive } : view === "locations" ? { code: form.code, name: form.name, warehouseId: form.warehouseId, locationType: form.locationType, isActive: form.isActive } : view === "units" ? { code: form.code, name: form.name, precision: Number(form.precision), isActive: form.isActive } : view === "tax-rates" ? { code: form.code, name: form.name, rate: Number(form.ratePercent) / 100, effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo, isActive: form.isActive } : view === "currencies" ? { ...form, code: form.code.toUpperCase(), decimalPlaces: Number(form.decimalPlaces), precision: undefined, ratePercent: undefined, effectiveFrom: undefined, effectiveTo: undefined } : { code: form.code, name: form.name, isActive: form.isActive });
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    {view !== "exchange-rates" && <><label>编码<input value={form.code} disabled={view === "currencies" && Boolean(initial.code)} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label><label>名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label></>}
    {view === "exchange-rates" && <><label>币种<select value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value })}><option value="USD">美元 USD</option></select></label><label>汇率日期<input type="date" value={form.rateDate} onChange={(event) => setForm({ ...form, rateDate: event.target.value })} /></label><label>USD/CNY<input type="number" min="0.000001" step="0.000001" value={form.rateToCny} onChange={(event) => setForm({ ...form, rateToCny: event.target.value })} /></label></>}
    {view === "units" && <label>数量精度<input type="number" min="0" max="6" value={form.precision} onChange={(event) => setForm({ ...form, precision: event.target.value })} /></label>}
    {view === "tax-rates" && <><label>税率（%）<input type="number" min="0" max="100" step="0.01" value={form.ratePercent} onChange={(event) => setForm({ ...form, ratePercent: event.target.value })} /></label><label>生效日期<input type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} /></label><label>失效日期（可空）<input type="date" value={form.effectiveTo} onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })} /></label></>}
    {view === "currencies" && <><label>货币符号<input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} /></label><label>金额小数位<input type="number" min="0" max="6" value={form.decimalPlaces} onChange={(event) => setForm({ ...form, decimalPlaces: event.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={form.isBaseCurrency} onChange={(event) => setForm({ ...form, isBaseCurrency: event.target.checked })} />设为本位币</label></>}
    {view === "locations" && <><label>所属仓库<select value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })}><option value="">请选择</option>{warehouseOptions.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label>库位类型<input value={form.locationType} onChange={(event) => setForm({ ...form, locationType: event.target.value })} /></label></>}
    <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />启用</label>
    <button className="primary" type="submit">保存</button>
  </form>;
}

function SettingsModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop"><div className="modal compact-modal"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} type="button"><X size={18} /></button></div>{children}</div></div>; }

function ProductAttributeForm({ initial, onSubmit }: { initial: any; onSubmit: (form: any) => Promise<void> }) {
  const [form, setForm] = useState<any>({ code: initial.code ?? "", name: initial.name ?? "", sortOrder: String(initial.sortOrder ?? 0), isActive: initial.isActive ?? true, values: (initial.values ?? []).map((value: any) => ({ id: value.id, code: value.code, name: value.name, sortOrder: String(value.sortOrder ?? 0), isActive: value.isActive !== false })), removedValueIds: [] });
  const addValue = () => setForm((current: any) => ({ ...current, values: [...current.values, { code: "", name: "", sortOrder: String(current.values.length), isActive: true }] }));
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void onSubmit({ code: form.code, name: form.name, sortOrder: Number(form.sortOrder), isActive: form.isActive, values: form.values, removedValueIds: form.removedValueIds }); }}><label>属性编码<input value={form.code} disabled={Boolean(initial.id)} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label><label>属性名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>排序<input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />启用</label><div className="attribute-values"><div className="line-editor-header"><strong>属性值</strong><button className="primary small" type="button" onClick={addValue}>添加属性值</button></div>{form.values.map((value: any, index: number) => <div className="attribute-value-row" key={value.id ?? index}><input placeholder="值编码" value={value.code} disabled={Boolean(value.id)} onChange={(event) => setForm({ ...form, values: form.values.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, code: event.target.value } : item) })} /><input placeholder="值名称" value={value.name} onChange={(event) => setForm({ ...form, values: form.values.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /><button className="link-button danger" type="button" onClick={() => setForm({ ...form, values: form.values.filter((_: any, itemIndex: number) => itemIndex !== index), removedValueIds: value.id ? [...form.removedValueIds, value.id] : form.removedValueIds })}>移除</button></div>)}</div><button className="primary" type="submit">保存</button></form>;
}
