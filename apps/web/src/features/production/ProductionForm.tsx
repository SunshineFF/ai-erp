import { useEffect, useState } from "react";
import type { Material } from "../../types";
import { Field, Form, RemoteSelectField, SelectField } from "../../shared/CrudUi";
import { useReferenceData } from "../../hooks/useReferenceData";
import { request } from "../../api";

const SALES_STATUS_QUERY = "DRAFT,CONFIRMED,IN_PRODUCTION,READY,PARTIALLY_SHIPPED";

export function ProductionForm({ initial, materials, onSubmit }: { initial: any; materials: Material[]; onSubmit: (value: any) => Promise<void> }) {
  const reference = useReferenceData();
  const first = materials.find((m) => m.manufacturable) ?? materials[0];
  const initialLines = initial.id ? [{ key: 1, materialId: initial.outputMaterialId ?? first?.id ?? "", plannedQty: String(initial.plannedQty ?? 1), unitId: initial.unitId ?? first?.baseUnitId ?? "" }] : [{ key: 1, materialId: first?.id ?? "", plannedQty: "1", unitId: first?.baseUnitId ?? "" }];
  const [form, setForm] = useState({ targetLocationId: initial.targetLocationId ?? "", plannedDate: initial.plannedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), productionType: initial.productionType ?? "MAKE_TO_STOCK", remark: initial.remark ?? "" });
  const [lines, setLines] = useState(initialLines);
  // 关联销售单（可多选）：合并后的未完成明细作为生产明细初始值，可自由调整。
  const [salesOrderIds, setSalesOrderIds] = useState<string[]>([]);
  const [salesOptions, setSalesOptions] = useState<[string, string][]>([]);
  const [salesKeyword, setSalesKeyword] = useState("");
  const [salesLoading, setSalesLoading] = useState(false);
  const options = materials.filter((m) => m.isActive && !(m.parentMaterialId === null && m.variantEnabled)).map((m) => [m.id, `${m.code} · ${m.name}`]);
  const fetchMaterialOptions = async (keyword: string) => { const items = await request<any[]>(`/materials/options?take=10${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); return items.filter((item: any) => item.isActive && !(item.parentMaterialId === null && item.variantEnabled)).map((item: any) => [item.id, `${item.code} · ${item.name}`]); };
  const fetchSalesOptions = async (keyword: string) => { setSalesLoading(true); try { const items = await request<any[]>(`/sales-orders/options?take=10&status=${SALES_STATUS_QUERY}${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); setSalesOptions(items.map((item: any) => [item.id, `${item.documentNo} · ${item.customerName ?? ""}`])); } finally { setSalesLoading(false); } };
  useEffect(() => { void fetchSalesOptions(""); }, []);
  useEffect(() => { if (!salesOrderIds.length) return; let cancelled = false; const timer = setTimeout(async () => { try { const result = await request<any>(`/production-orders/sales-order-requirements`, { method: "POST", body: JSON.stringify({ salesOrderIds }) }); if (cancelled || !result.lines?.length) return; setLines(result.lines.map((line: any, index: number) => ({ key: Date.now() + index, materialId: line.materialId, plannedQty: String(line.quantity), unitId: line.unitId }))); } catch { /* 保留当前明细，提交时后端会校验 */ } }, 200); return () => { cancelled = true; clearTimeout(timer); }; }, [salesOrderIds]);
  const toggleSalesOrder = (id: string) => setSalesOrderIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const updateLine = (index: number, patch: any) => setLines(lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  const addLine = () => setLines([...lines, { key: Date.now(), materialId: "", plannedQty: "1", unitId: "" }]);
  return <Form onSubmit={() => onSubmit({ ...form, salesOrderIds: salesOrderIds.length ? salesOrderIds : undefined, lines: lines.map((line) => ({ materialId: line.materialId, plannedQty: Number(line.plannedQty), unitId: line.unitId })) })}>
    <SelectField label="生产类型" value={form.productionType} options={[["MAKE_TO_STOCK", "按库存生产"], ["MAKE_TO_ORDER", "按订单生产"]]} onChange={(v) => setForm({ ...form, productionType: v })} />
    <SelectField label="目标库位" value={form.targetLocationId} options={reference.locations.map((item: any) => [item.id, `${item.code} · ${item.name}`])} onChange={(v) => setForm({ ...form, targetLocationId: v })} />
    <Field label="计划日期" value={form.plannedDate} onChange={(v) => setForm({ ...form, plannedDate: v })} type="date" />
    <div className="line-editor">
      <div className="line-editor-header"><span>关联销售订单（可选，可多选）</span>{salesLoading && <span className="muted">加载中…</span>}</div>
      <div className="sales-order-picker">
        <input className="sales-order-search" placeholder="搜索销售订单号 / 客户…" value={salesKeyword} onChange={(event) => { setSalesKeyword(event.target.value); void fetchSalesOptions(event.target.value); }} />
        <div className="sales-order-list">
          {salesOptions.map(([id, label]) => <label key={id} className="sales-order-option"><input type="checkbox" checked={salesOrderIds.includes(id)} onChange={() => toggleSalesOrder(id)} />{label}</label>)}
          {!salesOptions.length && <span className="muted">暂无可关联的销售订单</span>}
        </div>
        {salesOrderIds.length > 0 && <div className="sales-order-selected">已选 {salesOrderIds.length} 张销售订单，未完成明细已合并到下方生产明细，可自由调整（不得低于未完成数量）</div>}
      </div>
    </div>
    <div className="line-editor">
      <div className="line-editor-header"><span>产出物料排产</span><button className="primary small" type="button" onClick={addLine}>添加物料</button></div>
      {lines.map((line, index) => <div className="order-line" key={line.key}>
        <strong>第 {index + 1} 行</strong>
        <RemoteSelectField label="产出物料" value={line.materialId} onChange={(v) => { const material = materials.find((m) => m.id === v); updateLine(index, { materialId: v, unitId: material?.baseUnitId ?? line.unitId }); }} fetchOptions={fetchMaterialOptions} initialOptions={options} />
        <Field label="计划数量" value={line.plannedQty} onChange={(v) => updateLine(index, { plannedQty: v })} />
        <SelectField label="单位" value={line.unitId} options={reference.units.map((item: any) => [item.id, `${item.code} · ${item.name}`])} onChange={(v) => updateLine(index, { unitId: v })} />
        <button className="link-button danger line-remove" type="button" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>移除</button>
      </div>)}
    </div>
    <Field label="备注" value={form.remark} onChange={(v) => setForm({ ...form, remark: v })} />
  </Form>;
}
