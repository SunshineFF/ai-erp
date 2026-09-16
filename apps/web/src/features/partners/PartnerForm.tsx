import { useEffect, useState } from "react";
import { request } from "../../api";
import { Field, Form, SearchSelectField, SelectField } from "../../shared/CrudUi";

type CategoryOption = { id: string; code: string; name: string };

export function PartnerForm({ kind, initial, onSubmit }: { kind: "supplier" | "customer"; initial: any; onSubmit: (value: any) => Promise<void> }) {
  const isEditing = Boolean(initial.id);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [materialCategories, setMaterialCategories] = useState<CategoryOption[]>([]);
  const [form, setForm] = useState({ code: initial.code ?? "", name: initial.name ?? "", partnerCategoryId: initial.partnerCategoryId ?? initial.partnerCategory?.id ?? "", materialCategoryId: initial.materialCategoryId ?? initial.materialCategory?.id ?? "", contactName: initial.contactName ?? "", phone: initial.phone ?? "", address: initial.address ?? "", currencyCode: initial.currencyCode ?? "CNY" });
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  useEffect(() => { if (kind !== "customer") return; void request<CategoryOption[]>(`/settings/partner-categories/customer/options`).then(setCategories).catch(() => setCategories([])); }, [kind]);
  useEffect(() => { if (kind !== "supplier") return; void request<CategoryOption[]>("/settings/categories?page=1&pageSize=20").then((result: any) => setMaterialCategories(result.items ?? result)).catch(() => setMaterialCategories([])); }, [kind]);
  const codeCategoryId = kind === "supplier" ? form.materialCategoryId : form.partnerCategoryId;
  const categoryReady = Boolean(codeCategoryId);
  useEffect(() => { if (isEditing || !categoryReady) { setGeneratedCode(""); return; } let cancelled = false; setCodeLoading(true); const query = `categoryId=${encodeURIComponent(codeCategoryId)}`; void request<{ code: string }>(`${kind === "supplier" ? "/suppliers" : "/customers"}/next-code?${query}`).then((value) => { if (!cancelled) setGeneratedCode(value.code); }).catch(() => { if (!cancelled) setGeneratedCode(""); }).finally(() => { if (!cancelled) setCodeLoading(false); }); return () => { cancelled = true; }; }, [codeCategoryId, categoryReady, isEditing, kind]);
  const code = isEditing ? form.code : generatedCode;
  const submit = () => onSubmit({ ...form, code, partnerCategoryId: kind === "customer" ? form.partnerCategoryId || undefined : undefined, materialCategoryId: kind === "supplier" ? form.materialCategoryId || undefined : undefined });
  return <Form onSubmit={submit}><Field label={isEditing ? "编码" : "编码（自动生成）"} value={code || (codeLoading ? "生成中..." : "选择分类后自动生成")} onChange={(v) => setForm({ ...form, code: v })} readOnly /><Field label="名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />{kind === "customer" && <SelectField label="客户分类" value={form.partnerCategoryId} options={categories.map((item) => [item.id, `${item.code} · ${item.name}`])} onChange={(v) => setForm({ ...form, partnerCategoryId: v })} />}{kind === "supplier" && <SearchSelectField label="物料分类" value={form.materialCategoryId} options={materialCategories.map((item) => [item.id, `${item.code} · ${item.name}`])} onChange={(v) => setForm({ ...form, materialCategoryId: v })} />}<Field label="联系人" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} /><Field label="电话" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /><SelectField label="默认币种" value={form.currencyCode} options={[["CNY", "人民币 CNY"], ["USD", "美元 USD"]]} onChange={(v) => setForm({ ...form, currencyCode: v })} /><Field label="地址" value={form.address} onChange={(v) => setForm({ ...form, address: v })} /></Form>;
}
