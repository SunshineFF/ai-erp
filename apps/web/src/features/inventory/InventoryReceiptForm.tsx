import { useState } from "react";
import type { Material } from "../../types";
import { Field, FieldErrors, Form, RemoteSelectField, SelectField } from "../../shared/CrudUi";
import { useReferenceData } from "../../hooks/useReferenceData";
import { request } from "../../api";

export function InventoryReceiptForm({ materials, onSubmit }: { materials: Material[]; onSubmit: (value: any) => Promise<void> }) {
  const reference = useReferenceData();
  const today = () => new Date().toISOString().slice(0, 10);
  const plusYear = () => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const blankLine = () => ({ key: Date.now() + Math.random(), materialId: "", locationId: "", batchNo: "", supplierBatchNo: "", quantity: "1", unitId: "", unitCostCny: "0", productionDate: today(), expiryDate: plusYear() });
  const [head, setHead] = useState({ supplierName: "", remark: "" });
  const [lines, setLines] = useState<any[]>([blankLine()]);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const updateLine = (index: number, patch: any) => setLines(lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  const addLine = () => setLines([...lines, blankLine()]);
  const fetchMaterialOptions = async (keyword: string) => { const items = await request<any[]>(`/materials/options?take=10${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); return items.map((item: any) => [item.id, `${item.name}`]); };
  const validate = (): FieldErrors => { const errs: FieldErrors = {}; lines.forEach((line, index) => { if (lines.slice(0, index + 1).some((l) => l.materialId) && !line.materialId) errs[`line-material-${index}`] = "请选物料"; if (line.materialId && !line.locationId) errs[`line-location-${index}`] = "请选库位"; if (line.materialId && !line.batchNo) errs[`line-batch-${index}`] = "请填写批次号"; if (line.materialId && !line.quantity) errs[`line-qty-${index}`] = "请填写数量"; }); return errs; };
  const submit = async () => { await onSubmit({ ...head, lines }); };
  return <Form onSubmit={submit} validate={validate}>
    <Field label="供应商（选填，整单共用）" value={head.supplierName} onChange={(v) => setHead({ ...head, supplierName: v })} placeholder="例如：A 供应商"/>
    <Field label="备注（选填）" value={head.remark} onChange={(v) => setHead({ ...head, remark: v })} />
    <div className="line-editor">
      <div className="line-editor-header"><span>收货明细（可一次录入多物料/多批次）</span><span className="muted">输完本行单价按 回车 自动加下一行</span><button className="primary small" type="button" onClick={addLine}>添加一行</button></div>
      {lines.map((line, index) => {
        const expanded = Boolean(expandedKeys[line.key]);
        return <div className="order-line" key={line.key}>
          <div className="order-line-head"><strong>收货 {index + 1}</strong><button className="link-button" type="button" onClick={() => setExpandedKeys({ ...expandedKeys, [line.key]: !expanded })}>{expanded ? "收起效期" : "供应商批号 / 生产期 / 到期日"}</button><button className="link-button danger" type="button" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>移除</button></div>
          <div className="order-line-grid">
            <RemoteSelectField label="物料" name={`line-material-${index}`} required value={line.materialId} onChange={(v) => { const material = materials.find((m) => m.id === v); updateLine(index, { materialId: v, unitId: material?.baseUnitId ?? line.unitId }); }} fetchOptions={fetchMaterialOptions} initialOptions={materials.map((m) => [m.id, `${m.name}`])} />
            <SelectField label="库位" name={`line-location-${index}`} required value={line.locationId} options={reference.locations.map((item: any) => [item.id, `${item.name}`])} onChange={(v) => updateLine(index, { locationId: v })} />
            <Field label="批次号" name={`line-batch-${index}`} required value={line.batchNo} onChange={(v) => updateLine(index, { batchNo: v })} placeholder="本批唯一标识"/>
            <Field label="数量" name={`line-qty-${index}`} required value={line.quantity} onChange={(v) => updateLine(index, { quantity: v })} />
            <SelectField label="单位" value={line.unitId} options={reference.units.map((item: any) => [item.id, `${item.name}`])} onChange={(v) => updateLine(index, { unitId: v })} />
            <Field label="含税单价（元）" value={line.unitCostCny} onChange={(v) => updateLine(index, { unitCostCny: v })} onEnter={addLine}/>
          </div>
          {expanded && <div className="order-line-advanced">
            <Field label="供应商批号（选填）" value={line.supplierBatchNo} onChange={(v) => updateLine(index, { supplierBatchNo: v })} />
            <Field label="生产日期" value={line.productionDate} onChange={(v) => updateLine(index, { productionDate: v })} type="date" />
            <Field label="到期日期" value={line.expiryDate} onChange={(v) => updateLine(index, { expiryDate: v })} type="date" />
          </div>}
        </div>;
      })}
    </div>
  </Form>;
}