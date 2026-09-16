import React, { useEffect, useState } from "react";
import { Warehouse, X } from "lucide-react";
import { DeleteConfirm } from "./DeleteConfirm";
export function Form({ children, onSubmit }: { children: React.ReactNode; onSubmit: () => Promise<void> }) { const [saving, setSaving] = useState(false); const [error, setError] = useState(""); return <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); setSaving(true); setError(""); try { await onSubmit(); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } finally { setSaving(false); } }}>{children}{error && <div className="error banner form-error">{error}</div>}<button className="primary" disabled={saving} type="submit">{saving ? "保存中..." : "保存"}</button></form>; }
export function Field({ label, value, onChange, type = "text", disabled = false, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; readOnly?: boolean }) { return <label>{label}<input type={type} value={value} disabled={disabled} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} /></label>; }
export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <label>{label}<select value={value} onChange={(e) => onChange(e.target.value)}><option value="">请选择</option>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>; }
export function SearchSelectField({ label, value, options, onChange, placeholder = "输入名称或编码筛选" }: { label: string; value: string; options: string[][]; onChange: (value: string) => void; placeholder?: string }) {
  const [keyword, setKeyword] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find(([v]) => v === value);
  const text = keyword ?? selected?.[1] ?? "";
  const filter = (keyword ?? "").trim().toLowerCase();
  const filtered = filter ? options.filter(([, optionText]) => String(optionText).toLowerCase().includes(filter)) : options;
  return <label className="search-select">{label}<div className="search-select-box"><input type="text" value={text} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(e) => { setKeyword(e.target.value); setOpen(true); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} />{open && <div className="search-select-menu">{!filtered.length && <div className="search-select-empty">无匹配项</div>}{filtered.map(([v, optionText]) => <button type="button" key={v} className={v === value ? "search-select-option active" : "search-select-option"} onMouseDown={(e) => { e.preventDefault(); onChange(v); setKeyword(optionText); setOpen(false); }}>{optionText}</button>)}</div>}</div></label>;
}
export function RemoteSelectField({ label, value, onChange, fetchOptions, placeholder = "输入名称或编码搜索", initialOptions }: { label: string; value: string; onChange: (value: string) => void; fetchOptions: (keyword: string) => Promise<string[][]>; placeholder?: string; initialOptions?: string[][] }) {
  const [keyword, setKeyword] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = [...(options ?? []), ...(initialOptions ?? [])].find(([v]) => v === value);
  const text = keyword ?? selected?.[1] ?? "";
  // 输入框获得焦点即触发远程搜索：关键字为空（或恰好等于已选项文本）时按空关键字搜索，返回前 N 条。
  const query = keyword === null || keyword === selected?.[1] ? "" : keyword.trim();
  const displayOptions = options !== null ? options : (initialOptions ?? []).slice(0, 10);
  const search = async (searchKeyword: string) => {
    setLoading(true); setError("");
    try { setOptions(await fetchOptions(searchKeyword)); } catch (reason) { setError(reason instanceof Error ? reason.message : "加载失败"); } finally { setLoading(false); }
  };
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => { void search(query); }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);
  return <label className="search-select">{label}<div className="search-select-box"><input type="text" value={text} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(e) => { setKeyword(e.target.value); setOpen(true); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} />{open && <div className="search-select-menu">{loading && <div className="search-select-empty">加载中...</div>}{!loading && error && <div className="search-select-empty">{error}</div>}{!loading && !error && !displayOptions.length && <div className="search-select-empty">无匹配项</div>}{!loading && !error && displayOptions.map(([v, optionText]) => <button type="button" key={v} className={v === value ? "search-select-option active" : "search-select-option"} onMouseDown={(e) => { e.preventDefault(); onChange(v); setKeyword(optionText); setOpen(false); }}>{optionText}</button>)}</div>}</div></label>;
}
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) { if (!open) return null; return <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} type="button"><X size={18} /></button></div>{children}</div></div>; }
export function PanelHeader({ icon, title, action, onAction }: { icon: React.ReactNode; title: string; action: string; onAction: () => void }) { return <div className="panel-title"><span>{icon}</span><h2>{title}</h2><button className="primary small" onClick={onAction}>{action}</button></div>; }
export function Actions({ onEdit, onDelete, name = "该记录" }: { onEdit?: () => void; onDelete?: () => void | Promise<void>; name?: string }) { const [confirming, setConfirming] = useState(false); const [deleting, setDeleting] = useState(false); const [deleteError, setDeleteError] = useState(""); const confirm = async () => { if (!onDelete) return; setDeleting(true); setDeleteError(""); try { await onDelete(); setConfirming(false); } catch (reason) { setDeleteError(reason instanceof Error ? reason.message : "删除失败"); } finally { setDeleting(false); } }; return <><span className="actions">{onEdit && <button className="link-button" onClick={onEdit}>编辑</button>}{onDelete && <button className="link-button danger" onClick={() => setConfirming(true)}>删除</button>}</span><DeleteConfirm target={confirming ? { title: name, run: async () => undefined } : undefined} busy={deleting} error={deleteError} onClose={() => { setConfirming(false); setDeleteError(""); }} onConfirm={() => void confirm()} /></>; }
export function DataTable({ columns, rows }: { columns: React.ReactNode[]; rows: (React.ReactNode)[][] }) { return <div className="table-scroll"><table><thead><tr>{columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <Empty />}</div>; }
export function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="panel"><div className="panel-title">{icon}<h2>{title}</h2></div>{children}</section>; }
export function Metric({ label, value, tone }: { label: string; value: string | number; tone: string }) { return <div className={`metric-card ${tone}`}><div className="metric-icon"><Warehouse size={18} /></div><div><span>{label}</span><strong>{value}</strong></div></div>; }
export function Empty() { return <div className="empty">暂无数据</div>; }
