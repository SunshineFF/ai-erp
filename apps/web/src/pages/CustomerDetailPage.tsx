import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { request } from "../api";
import { Actions, DataTable, Field, Form, Modal, PanelHeader, RemoteSelectField, SelectField } from "../shared/BusinessUi";
import { useReferenceData } from "../hooks/useReferenceData";

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const reference = useReferenceData();
  const [customer, setCustomer] = useState<any>();
  const [groups, setGroups] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const [detail, groupRows] = await Promise.all([request<any>(`/customers/${id}`), request<any>(`/customers/${id}/product-groups`)]);
      setCustomer(detail);
      setGroups(groupRows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "加载失败"); }
  };
  useEffect(() => { void load(); }, [id]);
  useEffect(() => { void request<any[]>("/materials/options").then(setMaterials); }, []);
  const title = customer ? `${customer.name}` : "客户详情";
  return <section className="panel table-panel"><button className="ghost-action" onClick={() => navigate("/customers")}><ArrowLeft size={15} />返回客户</button><PanelHeader icon={<span>客户</span>} title={title} action="新增产品组" onAction={() => setEditing({ origin: "create" })} />{error && <div className="error banner">{error}</div>}<div className="tabs"><span className="tab active">产品组</span></div>{groups.map((group) => <div className="panel" key={group.id}><div className="panel-title"><span>产品组</span><h2>{group.name}{group.code ? `（${group.code}）` : ""}{group.isActive ? "" : "（停用）"}</h2><button className="primary small" onClick={() => setEditing({ origin: "edit", group })}>编辑</button></div>{group.remark ? <p className="muted">{group.remark}</p> : null}<DataTable columns={["#", "物料", "默认数量", "单位", "含税单价", "备注"]} rows={(group.lines ?? []).map((line: any, index: number) => [index + 1, line.material ? `${line.material.name}` : line.materialId, String(line.quantity), line.unit ? `${line.unit.name}` : line.unitId, String(line.taxIncludedPrice), line.remark ?? "-"])} /></div>)}<Modal open={Boolean(editing)} title={editing?.origin === "edit" ? "编辑产品组" : "新增产品组"} onClose={() => setEditing(null)}><CustomerProductGroupForm initial={editing?.origin === "edit" ? editing.group : undefined} materials={materials} units={reference.units} onSubmit={async (value) => { try { const endpoint = `/customers/${id}/product-groups`; await request(editing?.origin === "edit" ? `${endpoint}/${editing.group.id}` : endpoint, { method: editing?.origin === "edit" ? "PATCH" : "POST", body: JSON.stringify(value) }); setEditing(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } }} /></Modal></section>;
}

function CustomerProductGroupForm({ initial, materials, units, onSubmit }: { initial?: any; materials: any[]; units: any[]; onSubmit: (value: any) => Promise<void> }) {
  const blankLine = () => ({ key: Date.now() + Math.random(), materialId: "", quantity: "1", unitId: "", taxIncludedPrice: "0", remark: "" });
  const [form, setForm] = useState<any>({ name: initial?.name ?? "", code: initial?.code ?? "", remark: initial?.remark ?? "", lines: (initial?.lines ?? []).map((line: any) => ({ key: Date.now() + Math.random(), materialId: line.materialId ?? "", quantity: String(line.quantity ?? 1), unitId: line.unitId ?? "", taxIncludedPrice: String(line.taxIncludedPrice ?? 0), remark: line.remark ?? "" })) });
  const update = (key: string, value: any) => setForm({ ...form, [key]: value });
  const updateLine = (index: number, patch: any) => setForm({ ...form, lines: form.lines.map((line: any, i: number) => i === index ? { ...line, ...patch } : line) });
  const addLine = () => setForm({ ...form, lines: [...form.lines, blankLine()] });
  const removeLine = (index: number) => setForm({ ...form, lines: form.lines.filter((_: any, i: number) => i !== index) });
  const materialOptions = materials.filter((item: any) => item.isActive && !(item.parentMaterialId === null && item.variantEnabled)).map((item: any) => [item.id, `${item.name}`]);
  const fetchMaterialOptions = async (keyword: string) => { const items = await request<any[]>(`/materials/options?take=10${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`); return items.filter((item: any) => item.isActive && !(item.parentMaterialId === null && item.variantEnabled)).map((item: any) => [item.id, `${item.name}`]); };
  useEffect(() => { if (form.lines.length === 0) setForm({ ...form, lines: [blankLine()] }); // eslint-disable-line react-hooks/exhaustive-deps
  }, []);
  const submit = () => onSubmit({ name: form.name, code: form.code || undefined, remark: form.remark, lines: form.lines.filter((line: any) => line.materialId).map((line: any) => ({ materialId: line.materialId, quantity: Number(line.quantity) || 1, unitId: line.unitId, taxIncludedPrice: Number(line.taxIncludedPrice) || 0, remark: line.remark })) });
  return <Form onSubmit={submit}><Field label="产品组名称" required value={form.name} onChange={(v) => update("name", v)} /><Field label="产品组编码（留空自动生成）" value={form.code} onChange={(v) => update("code", v)} /><div className="line-editor"><div className="line-editor-header"><span>产品组明细（物料 + 默认数量 + 单位 + 单价）</span><button className="primary small" type="button" onClick={addLine}>添加物料</button></div>{form.lines.map((line: any, index: number) => <div className="order-line" key={line.key}><div className="order-line-head"><strong>第 {index + 1} 行</strong><button className="link-button danger" type="button" disabled={form.lines.length <= 1} onClick={() => removeLine(index)}>移除</button></div><div className="order-line-grid"><RemoteSelectField label="物料（可售 SKU）" value={line.materialId} onChange={(v) => { const material = materials.find((item: any) => item.id === v); updateLine(index, { materialId: v, unitId: material?.baseUnitId ?? line.unitId }); }} fetchOptions={fetchMaterialOptions} initialOptions={materialOptions} /><Field label="默认数量" value={line.quantity} onChange={(v) => updateLine(index, { quantity: v })} /><SelectField label="单位" value={line.unitId} options={units.map((unit: any) => [unit.id, `${unit.name}`])} onChange={(v) => updateLine(index, { unitId: v })} /><Field label="含税单价" value={line.taxIncludedPrice} onChange={(v) => updateLine(index, { taxIncludedPrice: v })} /><Field label="备注" value={line.remark} onChange={(v) => updateLine(index, { remark: v })} /></div></div>)}</div><Field label="产品组备注" value={form.remark} onChange={(v) => update("remark", v)} /></Form>;
}