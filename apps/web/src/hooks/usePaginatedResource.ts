import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { request } from "../api";
import type { PageResult } from "../types";

export function usePaginatedResource<T>(path: string, extra: Record<string, string> = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = [20, 50, 100].includes(Number(searchParams.get("pageSize"))) ? Number(searchParams.get("pageSize")) : 20;
  const [result, setResult] = useState<PageResult<T>>({ items: [], total: 0, page, pageSize, totalPages: 1 });
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...extra }); const value = await request<PageResult<T>>(`${path}?${query}`); if (!value.items.length && value.total > 0 && page > 1) { const next = new URLSearchParams(searchParams); next.set("page", String(page - 1)); setSearchParams(next, { replace: true }); return; } setResult(value); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "数据加载失败"); } finally { setLoading(false); } }, [path, page, pageSize, JSON.stringify(extra)]);
  useEffect(() => { void load(); }, [load]);
  const update = (patch: Record<string, string>) => { const next = new URLSearchParams(searchParams); Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); setSearchParams(next); };
  return { ...result, loading, error, setError, reload: load, setPage: (value: number) => update({ page: String(value) }), setPageSize: (value: number) => update({ page: "1", pageSize: String(value) }) };
}
