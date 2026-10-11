import { useEffect, useRef, useState } from "react";
import type { Material } from "../../types";
import { Field, Form, RemoteSelectField, SelectField } from "../../shared/CrudUi";
import { useReferenceData } from "../../hooks/useReferenceData";
import { request } from "../../api";

const SALES_STATUS_QUERY = "DRAFT,CONFIRMED,IN_PRODUCTION,READY,PARTIALLY_SHIPPED";
type BomCapacity = { found: boolean; standardOutputQty?: number; unitId?: string; versionNo?: string };
type Line = { key: number; materialId: string; batches: number; unitId: string; capacity: BomCapacity | null; salesQty?: number; batchResolved?: boolean };

export function ProductionForm({ initial, materials, onSubmit }: { initial: any; materials: Material[]; onSubmit: (value: any) => Promise<void> }) {
  const reference = useReferenceData();
  const first = materials.find((m) => m.manufacturable) ?? materials[0];
  const newLine = (materialId = "", unitId = ""): Line => ({ key: Date.now() + Math.random(), materialId, batches: 1, unitId, capacity: null, batchResolved: false });
  const [form, setForm] = useState({ targetLocationId: initial.targetLocationId ?? "", plannedDate: initial.plannedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), productionType: initial.productionType ?? "MAKE_TO_STOCK", remark: initial.remark ?? "" });
  const [lines, setLines] = useState<Line[]>(initial.id ? [newLine(initial.outputMaterialId ?? first?.id ?? "", initial.unitId ?? first?.baseUnitId ?? "")] : [newLine()]);
  // 关联销售单（可多选）：合并后的未完成明细作为生产明细初始值，按销量折算最小下料次数。
  const [salesOrderIds, setSalesOrderIds] = useState<string[]>([]);
  const [salesOptions, setSalesOptions] = useState<[string, string][]>([]);
  const [salesKeyword, setSalesKeyword] = useState("");
  const [salesLoading, setSalesLoading] = useState(false);
  const options = materials.filter((m) => m.isActive && !(m.parentMaterialId === null && m.variantEnabled)).map((m) => [m.id, `${m.name}`]);
  const unitByMaterial = useRef<Record<string, string>>({});
  const defaultUnitOf = (materialId: string) => unitByMaterial.current[materialId] ?? materials.find((m) => m.id === materialId)?.baseUnitId ?? "";
  const unitName = (unitId?: string) => { const unit = reference.units.find((item: any) => item.id === unitId); return unit ? `${unit.name}` : "-"; };
  const fetchMaterialOptions = async (keyword: string) => { const items = await request<any[]>(`/materials/options?take=10${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); for (const item of items) if (item.baseUnitId) unitByMaterial.current[item.id] = item.baseUnitId; return items.filter((item: any) => item.isActive && !(item.parentMaterialId === null && item.variantEnabled)).map((item: any) => [item.id, `${item.name}`]); };
  const fetchSalesOptions = async (keyword: string) => { setSalesLoading(true); try { const items = await request<any[]>(`/sales-orders/options?take=10&status=${SALES_STATUS_QUERY}${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); setSalesOptions(items.map((item: any) => [item.id, `${item.documentNo} · ${item.customerName ?? ""}`])); } finally { setSalesLoading(false); } };
  // 查询物料生效配方的“一次下料产出”（BOM 能力），并按时销量/编辑产量折算下料次数。
  const resolveCapacity = (index: number, materialId: string) => {
    if (!materialId) return;
    void request<BomCapacity>(`/production-orders/bom-capacity?materialId=${encodeURIComponent(materialId)}`).then((cap) => {
      setLines((current) => current.map((line, i) => {
        if (i !== index) return line;
        const next: Line = { ...line, capacity: cap.found ? { ...cap } : null, batchResolved: true };
        if (cap.found) {
          const S = cap.standardOutputQty as number;
          if (initial.id) next.batches = Math.max(1, Math.round((Number(initial.plannedQty) || S) / S));
          else if (line.salesQty) next.batches = Math.max(1, Math.ceil(line.salesQty / S));
        }
        return next;
      }));
    }).catch(() => { setLines((current) => current.map((line, i) => i === index ? { ...line, capacity: null, batchResolved: true } : line)); });
  };
  useEffect(() => { void fetchSalesOptions(""); }, []);
  useEffect(() => { if (initial.id) resolveCapacity(0, lines[0]?.materialId ?? ""); }, []); // 编辑：反推首行下料次数
  useEffect(() => { lines.forEach((line, index) => { if (line.materialId && !line.batchResolved) resolveCapacity(index, line.materialId); }); }, [lines.map((l) => l.materialId).join(","), lines.map((l) => l.batchResolved).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!salesOrderIds.length) return; let cancelled = false; const timer = setTimeout(async () => { try { const result = await request<any>(`/production-orders/sales-order-requirements`, { method: "POST", body: JSON.stringify({ salesOrderIds }) }); if (cancelled || !result.lines?.length) return; setLines(result.lines.map((line: any, index: number) => ({ ...newLine(line.materialId, line.unitId), salesQty: Number(line.quantity), batchResolved: false }))); } catch { /* 提交时后端会校验 */ } }, 200); return () => { cancelled = true; clearTimeout(timer); }; }, [salesOrderIds]);
  const toggleSalesOrder = (id: string) => setSalesOrderIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const updateLine = (index: number, patch: Partial<Line>) => setLines(lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  const addLine = () => setLines([...lines, newLine()]);
  return <Form onSubmit={() => onSubmit({ ...form, salesOrderIds: salesOrderIds.length ? salesOrderIds : undefined, lines: lines.map((line) => ({ materialId: line.materialId, batches: Math.max(1, Math.floor(Number(line.batches) || 0) || 1), unitId: line.unitId })) })}>
    <SelectField label="生产类型" value={form.productionType} options={[["MAKE_TO_STOCK", "按库存生产"], ["MAKE_TO_ORDER", "按订单生产"]]} onChange={(v) => setForm({ ...form, productionType: v })} />
    <SelectField label="目标库位" value={form.targetLocationId} options={reference.locations.map((item: any) => [item.id, `${item.name}`])} onChange={(v) => setForm({ ...form, targetLocationId: v })} />
    <Field label="计划日期" value={form.plannedDate} onChange={(v) => setForm({ ...form, plannedDate: v })} type="date" />
    <div className="line-editor">
      <div className="line-editor-header"><span>关联销售订单（可选，可多选）</span>{salesLoading && <span className="muted">加载中…</span>}</div>
      <div className="sales-order-picker">
        <input className="sales-order-search" placeholder="搜索销售订单号 / 客户…" value={salesKeyword} onChange={(event) => { setSalesKeyword(event.target.value); void fetchSalesOptions(event.target.value); }} />
        <div className="sales-order-list">
          {salesOptions.map(([id, label]) => <label key={id} className="sales-order-option"><input type="checkbox" checked={salesOrderIds.includes(id)} onChange={() => toggleSalesOrder(id)} />{label}</label>)}
          {!salesOptions.length && <span className="muted">暂无可关联的销售订单</span>}
        </div>
        {salesOrderIds.length > 0 && <div className="sales-order-selected">已选 {salesOrderIds.length} 张销售订单，下料次数已按销量折算（产量=次数×配方产出，不得低于销量）</div>}
      </div>
    </div>
    <div className="line-editor">
      <div className="line-editor-header"><span>产出物料排产（产量 = 下料次数 × 配方一次产出）</span><button className="primary small" type="button" onClick={addLine}>添加物料</button></div>
      {lines.map((line, index) => <div className="order-line" key={line.key}>
        <strong>第 {index + 1} 行</strong>
        <RemoteSelectField label="产出物料" value={line.materialId} onChange={(v) => { updateLine(index, { materialId: v, unitId: defaultUnitOf(v) || line.unitId, batches: 1, capacity: null, batchResolved: false }); resolveCapacity(index, v); }} fetchOptions={fetchMaterialOptions} initialOptions={options} />
        <Field label="配方一次产出" value={line.capacity?.found ? `${line.capacity.standardOutputQty} ${unitName(line.capacity.unitId)}` : (line.materialId ? "无生效配方" : "-")} readOnly onChange={() => {}} />
        <Field label="下料次数（整数）" value={String(line.batches)} onChange={(v) => updateLine(index, { batches: Number(v) })} type="number" />
        <Field label="计划产量（自动）" value={line.capacity?.found && Number(line.batches) > 0 ? String(Math.floor(Number(line.batches)) * (line.capacity.standardOutputQty as number)) : "0"} readOnly onChange={() => {}} />
        <Field label="单位（物料默认）" value={unitName(line.unitId)} readOnly onChange={() => {}} />
        <button className="link-button danger line-remove" type="button" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>移除</button>
      </div>)}
    </div>
    <Field label="备注" value={form.remark} onChange={(v) => setForm({ ...form, remark: v })} />
  </Form>;
}