import { useEffect, useState } from "react";
import { Pencil, Plus, Power, Settings2, X } from "lucide-react";
import { apiRequest } from "./apiClient";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
type SettingView = "categories" | "units" | "tax-rates" | "currencies" | "exchange-rates";

async function api<T = any>(path: string, options?: RequestInit) { return apiRequest<T>(API, path, options); }

export function SettingsPanel() {
  const [view, setView] = useState<SettingView>("categories");
  const [data, setData] = useState<Record<SettingView, any[]>>({ categories: [], units: [], "tax-rates": [], currencies: [], "exchange-rates": [] });
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const [categories, units, taxRates, currencies, exchangeRates] = await Promise.all([api("/settings/categories"), api("/settings/units"), api("/settings/tax-rates"), api("/settings/currencies"), api("/settings/exchange-rates")]);
      setData({ categories, units, "tax-rates": taxRates, currencies, "exchange-rates": exchangeRates });
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "设置数据加载失败"); }
  };
  useEffect(() => { void load(); }, []);

  const save = async (form: any) => {
    const key = view === "exchange-rates" ? undefined : view === "currencies" ? editing?.code : editing?.id;
    await api(`/settings/${view}${key ? `/${key}` : ""}`, { method: key ? "PATCH" : "POST", body: JSON.stringify(form) });
    setEditing(null);
    await load();
  };
  const disable = async (item: any) => { await api(`/settings/${view}/${view === "currencies" ? item.code : item.id}`, { method: "DELETE" }); await load(); };
  const tabs: [SettingView, string][] = [["categories", "物料分类"], ["units", "计量单位"], ["tax-rates", "税率"], ["currencies", "货币"], ["exchange-rates", "汇率"]];
  const rows = data[view];

  return <section className="panel table-panel settings-panel">
    <div className="panel-title"><Settings2 size={18} /><h2>基础设置</h2><button className="primary small" onClick={() => setEditing({})}><Plus size={14} /> 新增</button></div>
    <div className="tabs">{tabs.map(([key, label]) => <button key={key} className={view === key ? "tab active" : "tab"} onClick={() => { setView(key); setEditing(null); }}>{label}</button>)}</div>
    {error && <div className="error banner">{error}</div>}
    <SettingsTable view={view} rows={rows} onEdit={setEditing} onDisable={disable} />
    {editing && <SettingsModal title={`${editing.id || editing.code ? "编辑" : "新增"}${tabs.find(([key]) => key === view)?.[1]}`} onClose={() => setEditing(null)}><SettingForm view={view} initial={editing} onSubmit={save} /></SettingsModal>}
  </section>;
}

function SettingsTable({ view, rows, onEdit, onDisable }: { view: SettingView; rows: any[]; onEdit: (item: any) => void; onDisable: (item: any) => Promise<void> }) {
  const details = (item: any) => view === "units" ? `精度 ${item.precision}` : view === "tax-rates" ? `${Number(item.rate) * 100}% · ${new Date(item.effectiveFrom).toLocaleDateString()}` : view === "currencies" ? `${item.symbol} · ${item.decimalPlaces} 位小数${item.isBaseCurrency ? " · 本位币" : ""}` : view === "exchange-rates" ? `1 ${item.currencyCode} = ${item.rateToCny} CNY` : "物料归类";
  return <div className="table-scroll"><table><thead><tr><th>编码</th><th>名称/日期</th><th>配置</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id ?? item.code}><td>{item.code ?? item.currencyCode}</td><td>{item.name ?? new Date(item.rateDate).toLocaleDateString()}</td><td>{details(item)}</td><td>{item.isActive ? "启用" : "停用"}</td><td><span className="actions"><button className="link-button icon-text" onClick={() => onEdit(item)}><Pencil size={13} />编辑</button>{view !== "exchange-rates" && item.isActive && !(view === "currencies" && item.isBaseCurrency) && <button className="link-button danger icon-text" onClick={() => void onDisable(item)}><Power size={13} />停用</button>}</span></td></tr>)}</tbody></table>{!rows.length && <div className="empty">暂无数据</div>}</div>;
}

function SettingForm({ view, initial, onSubmit }: { view: SettingView; initial: any; onSubmit: (form: any) => Promise<void> }) {
  const [form, setForm] = useState({ code: initial.code ?? "", name: initial.name ?? "", precision: String(initial.precision ?? 3), ratePercent: String(initial.rate !== undefined ? Number(initial.rate) * 100 : 13), effectiveFrom: initial.effectiveFrom?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), effectiveTo: initial.effectiveTo?.slice(0, 10) ?? "", symbol: initial.symbol ?? "", decimalPlaces: String(initial.decimalPlaces ?? 2), isBaseCurrency: initial.isBaseCurrency ?? false, isActive: initial.isActive ?? true, currencyCode: initial.currencyCode ?? "USD", rateDate: initial.rateDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), rateToCny: String(initial.rateToCny ?? 7.18) });
  const submit = () => onSubmit(view === "exchange-rates" ? { currencyCode: form.currencyCode, rateDate: form.rateDate, rateToCny: Number(form.rateToCny), isActive: form.isActive } : view === "units" ? { code: form.code, name: form.name, precision: Number(form.precision), isActive: form.isActive } : view === "tax-rates" ? { code: form.code, name: form.name, rate: Number(form.ratePercent) / 100, effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo, isActive: form.isActive } : view === "currencies" ? { ...form, code: form.code.toUpperCase(), decimalPlaces: Number(form.decimalPlaces), precision: undefined, ratePercent: undefined, effectiveFrom: undefined, effectiveTo: undefined } : { code: form.code, name: form.name, isActive: form.isActive });
  return <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    {view !== "exchange-rates" && <><label>编码<input value={form.code} disabled={view === "currencies" && Boolean(initial.code)} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label><label>名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label></>}
    {view === "exchange-rates" && <><label>币种<select value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value })}><option value="USD">美元 USD</option></select></label><label>汇率日期<input type="date" value={form.rateDate} onChange={(event) => setForm({ ...form, rateDate: event.target.value })} /></label><label>USD/CNY<input type="number" min="0.000001" step="0.000001" value={form.rateToCny} onChange={(event) => setForm({ ...form, rateToCny: event.target.value })} /></label></>}
    {view === "units" && <label>数量精度<input type="number" min="0" max="6" value={form.precision} onChange={(event) => setForm({ ...form, precision: event.target.value })} /></label>}
    {view === "tax-rates" && <><label>税率（%）<input type="number" min="0" max="100" step="0.01" value={form.ratePercent} onChange={(event) => setForm({ ...form, ratePercent: event.target.value })} /></label><label>生效日期<input type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} /></label><label>失效日期（可空）<input type="date" value={form.effectiveTo} onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })} /></label></>}
    {view === "currencies" && <><label>货币符号<input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} /></label><label>金额小数位<input type="number" min="0" max="6" value={form.decimalPlaces} onChange={(event) => setForm({ ...form, decimalPlaces: event.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={form.isBaseCurrency} onChange={(event) => setForm({ ...form, isBaseCurrency: event.target.checked })} />设为本位币</label></>}
    <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />启用</label>
    <button className="primary" type="submit">保存</button>
  </form>;
}

function SettingsModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop"><div className="modal compact-modal"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} type="button"><X size={18} /></button></div>{children}</div></div>; }
