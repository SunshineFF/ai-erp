import { BarChart3, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "./apiClient";
import { Pagination } from "./shared/Pagination";
import type { PageResult } from "./types";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3030/api";
async function api<T = any>(path: string) { return apiRequest<T>(API, path); }
const tabs = [["inventory", "实时库存"], ["purchases", "采购到货"], ["sales", "销售履约"], ["production", "生产耗料"], ["alerts", "异常预警"]] as const;

export function ReportsPanel() {
  const [params, setParams] = useSearchParams(); const [tab, setTab] = useState<(typeof tabs)[number][0]>("inventory"); const [data, setData] = useState<any>([]); const [error, setError] = useState(""); const page = Math.max(1, Number(params.get("page") || 1)); const pageSize = [20, 50, 100].includes(Number(params.get("pageSize"))) ? Number(params.get("pageSize")) : 20;
  const updatePage = (nextPage: number) => { const next = new URLSearchParams(params); next.set("page", String(nextPage)); setParams(next); };
  const updatePageSize = (nextPageSize: number) => { const next = new URLSearchParams(params); next.set("page", "1"); next.set("pageSize", String(nextPageSize)); setParams(next); };
  const load = async () => { try { setData(await api(`/reports/${tab}${tab === "alerts" ? "" : `?page=${page}&pageSize=${pageSize}`}`)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "加载失败"); } };
  useEffect(() => { void load(); }, [tab, page, pageSize]);
  const source = data?.items ?? data; const rows = Array.isArray(source) ? source : Object.entries(source ?? {}).flatMap(([group, values]) => Array.isArray(values) ? values.map((value) => ({ 分组: group, ...(typeof value === "object" ? value : { 数值: value }) })) : [{ 分组: group, 数值: values }]);
  const columns = [...new Set(rows.flatMap((row: any) => Object.keys(row)))].filter((column) => !/(^id$|Id$|Ids$)/.test(column)).slice(0, 12);
  return <section className="panel table-panel"><div className="panel-title"><BarChart3 size={18} /><h2>一期查询报表</h2><button className="ghost-action icon-text" onClick={() => void load()}><RefreshCw size={14} />刷新</button></div><div className="tabs">{tabs.map(([key, label]) => <button className={tab === key ? "tab active" : "tab"} key={key} onClick={() => { setTab(key); updatePage(1); }}>{label}</button>)}</div>{error && <div className="error">{error}</div>}<div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row: any, index: number) => <tr key={index}>{columns.map((column) => <td key={column}>{format(row[column])}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="empty">暂无数据</div>}</div>{tab !== "alerts" && <Pagination page={data.page ?? page} pageSize={data.pageSize ?? pageSize} total={data.total ?? 0} onPageChange={updatePage} onPageSizeChange={updatePageSize} />}</section>;
}

function format(value: any) { if (value === null || value === undefined) return "-"; if (typeof value === "object") return value.name ?? value.code ?? value.batchNo ?? "-"; if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleDateString(); return String(value); }
