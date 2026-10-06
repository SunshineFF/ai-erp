import React, { useEffect, useState } from "react";
import { Warehouse, X } from "lucide-react";
import { DeleteConfirm } from "./DeleteConfirm";

// ── 字段级错误定位（Form 通过 context 把校验错误下发到各 Field/Select）──
export type FieldErrors = Record<string, string>;
export const FormFieldContext = React.createContext<{ errors: FieldErrors }>({ errors: {} });

export function Form({ children, onSubmit, validate }: { children: React.ReactNode; onSubmit: () => Promise<void>; validate?: () => FieldErrors }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  return <FormFieldContext.Provider value={{ errors: fieldErrors }}>
    <form className="form-grid" onSubmit={async (e) => {
      e.preventDefault(); setError(""); setFieldErrors({});
      if (validate) { const fe = validate(); if (Object.keys(fe).length) { setFieldErrors(fe); return; } }
      setSaving(true);
      try { await onSubmit(); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } finally { setSaving(false); }
    }}>
      {children}
      {Object.keys(fieldErrors).length > 0 && <div className="error banner form-error">部分必填项未填写，请检查标红的字段。</div>}
      {error && <div className="error banner form-error">{error}</div>}
      <button className="primary" disabled={saving} type="submit">{saving ? "保存中..." : "保存"}</button>
    </form>
  </FormFieldContext.Provider>;
}

function useFieldError(propsError: string | undefined, name: string | undefined): string | undefined {
  const { errors } = React.useContext(FormFieldContext);
  return propsError ?? (name && errors[name] ? errors[name] : undefined);
}

export function Field({ label, value, onChange, type = "text", disabled = false, readOnly = false, required = false, name, placeholder, error, autoFocus = false, onEnter }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; readOnly?: boolean; required?: boolean; name?: string; placeholder?: string; error?: string; autoFocus?: boolean; onEnter?: () => void }) {
  const err = useFieldError(error, name);
  return <label className={err ? "field has-error" : required ? "field required-field" : "field"}>{label}{required && <em className="req-mark">*</em>}{err && <span className="field-error-text">{err}</span>}<input type={type} value={value} disabled={disabled} readOnly={readOnly} placeholder={placeholder} autoFocus={autoFocus} className={err ? "has-error" : ""} aria-invalid={Boolean(err)} onChange={(event) => onChange(event.target.value)} onKeyDown={onEnter ? (event) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } } : undefined} /></label>;
}

export function SelectField({ label, value, options, onChange, required = false, name, error, placeholder = "请选择" }: { label: string; value: string; options: string[][]; onChange: (value: string) => void; required?: boolean; name?: string; error?: string; placeholder?: string }) {
  const err = useFieldError(error, name);
  return <label className={err ? "field has-error" : required ? "field required-field" : "field"}>{label}{required && <em className="req-mark">*</em>}{err && <span className="field-error-text">{err}</span>}<select value={value} aria-invalid={Boolean(err)} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>;
}

export function SearchSelectField({ label, value, options, onChange, placeholder = "输入名称或编码筛选", required = false, name, error, onEnter }: { label: string; value: string; options: string[][]; onChange: (value: string) => void; placeholder?: string; required?: boolean; name?: string; error?: string; onEnter?: () => void }) {
  const err = useFieldError(error, name);
  const [keyword, setKeyword] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find(([v]) => v === value);
  const text = keyword ?? selected?.[1] ?? "";
  const filter = (keyword ?? "").trim().toLowerCase();
  const filtered = filter ? options.filter(([, optionText]) => String(optionText).toLowerCase().includes(filter)) : options;
  return <label className={err ? "search-select has-error" : required ? "search-select required-field" : "search-select"}>{label}{required && <em className="req-mark">*</em>}{err && <span className="field-error-text">{err}</span>}<div className="search-select-box"><input type="text" value={text} placeholder={placeholder} className={err ? "has-error" : ""} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(event) => { setKeyword(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && onEnter) { event.preventDefault(); onEnter(); } }} />{open && <div className="search-select-menu">{!filtered.length && <div className="search-select-empty">无匹配项</div>}{filtered.map(([v, optionText]) => <button type="button" key={v} className={v === value ? "search-select-option active" : "search-select-option"} onMouseDown={(event) => { event.preventDefault(); onChange(v); setKeyword(optionText); setOpen(false); }}>{optionText}</button>)}</div>}</div></label>;
}

export function RemoteSelectField({ label, value, onChange, fetchOptions, placeholder = "输入名称或编码搜索", initialOptions, required = false, name, error, onEnter }: { label: string; value: string; onChange: (value: string) => void; fetchOptions: (keyword: string) => Promise<string[][]>; placeholder?: string; initialOptions?: string[][]; required?: boolean; name?: string; error?: string; onEnter?: () => void }) {
  const err = useFieldError(error, name);
  const [keyword, setKeyword] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const selected = [...(options ?? []), ...(initialOptions ?? [])].find(([v]) => v === value);
  const text = keyword ?? selected?.[1] ?? "";
  // 输入框获得焦点即触发远程搜索：关键字为空（或恰好等于已选项文本）时按空关键字搜索，返回前 N 条。
  const query = keyword === null || keyword === selected?.[1] ? "" : keyword.trim();
  const displayOptions = options !== null ? options : (initialOptions ?? []).slice(0, 10);
  const search = async (searchKeyword: string) => {
    setLoading(true); setErrorMessage("");
    try { setOptions(await fetchOptions(searchKeyword)); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : "加载失败"); } finally { setLoading(false); }
  };
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => { void search(query); }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);
  return <label className={err ? "search-select has-error" : required ? "search-select required-field" : "search-select"}>{label}{required && <em className="req-mark">*</em>}{err && <span className="field-error-text">{err}</span>}<div className="search-select-box"><input type="text" value={text} placeholder={placeholder} className={err ? "has-error" : ""} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(event) => { setKeyword(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && onEnter) { event.preventDefault(); onEnter(); } }} />{open && <div className="search-select-menu">{loading && <div className="search-select-empty">加载中...</div>}{!loading && errorMessage && <div className="search-select-empty">{errorMessage}</div>}{!loading && !errorMessage && !displayOptions.length && <div className="search-select-empty">无匹配项</div>}{!loading && !errorMessage && displayOptions.map(([v, optionText]) => <button type="button" key={v} className={v === value ? "search-select-option active" : "search-select-option"} onMouseDown={(event) => { event.preventDefault(); onChange(v); setKeyword(optionText); setOpen(false); }}>{optionText}</button>)}</div>}</div></label>;
}
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) { if (!open) return null; return <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} type="button"><X size={18} /></button></div>{children}</div></div>; }
export function PanelHeader({ icon, title, action, onAction }: { icon: React.ReactNode; title: string; action: string; onAction: () => void }) { return <div className="panel-title"><span>{icon}</span><h2>{title}</h2><button className="primary small" onClick={onAction}>{action}</button></div>; }
export function Actions({ onEdit, onDelete, name = "该记录" }: { onEdit?: () => void; onDelete?: () => void | Promise<void>; name?: string }) { const [confirming, setConfirming] = useState(false); const [deleting, setDeleting] = useState(false); const [deleteError, setDeleteError] = useState(""); const confirm = async () => { if (!onDelete) return; setDeleting(true); setDeleteError(""); try { await onDelete(); setConfirming(false); } catch (reason) { setDeleteError(reason instanceof Error ? reason.message : "删除失败"); } finally { setDeleting(false); } }; return <><span className="actions">{onEdit && <button className="link-button" onClick={onEdit}>编辑</button>}{onDelete && <button className="link-button danger" onClick={() => setConfirming(true)}>删除</button>}</span><DeleteConfirm target={confirming ? { title: name, run: async () => undefined } : undefined} busy={deleting} error={deleteError} onClose={() => { setConfirming(false); setDeleteError(""); }} onConfirm={() => void confirm()} /></>; }
export function DataTable({ columns, rows }: { columns: React.ReactNode[]; rows: (React.ReactNode)[][] }) { return <div className="table-scroll"><table><thead><tr>{columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <Empty />}</div>; }
export function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="panel"><div className="panel-title">{icon}<h2>{title}</h2></div>{children}</section>; }
export function Metric({ label, value, tone }: { label: string; value: string | number; tone: string }) { return <div className={`metric-card ${tone}`}><div className="metric-icon"><Warehouse size={18} /></div><div><span>{label}</span><strong>{value}</strong></div></div>; }
export function Empty() { return <div className="empty">暂无数据</div>; }