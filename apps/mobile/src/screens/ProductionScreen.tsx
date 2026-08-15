import React, { useMemo, useState } from "react";
import Toast from "@ant-design/react-native/es/toast";
import { View } from "react-native";
import { api } from "../api";
import { Feedback, SectionHeader, SubmitButton } from "../components/BusinessComponents";
import { DateField, Field, SelectField } from "../components/FormControls";
import { appStyles } from "../theme";
import { ReferenceData, today } from "../types";

export function ProductionScreen({ reference }: { reference: ReferenceData }) {
  const choices = useMemo(() => reference.materials.filter((item) => item.isActive && (item.manufacturable || item.materialType === "FINISHED_GOOD")), [reference.materials]);
  const [materialId, setMaterialId] = useState(""); const [qty, setQty] = useState("1"); const [locationId, setLocationId] = useState(""); const [date, setDate] = useState(today()); const [remark, setRemark] = useState(""); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState("");
  async function submit() { const selected = choices.find((item) => item.id === materialId); setSaving(true); setNotice(""); try { const order = await api<any>("/production-orders", { method: "POST", body: JSON.stringify({ targetLocationId: locationId, plannedDate: date, productionType: "MAKE_TO_STOCK", remark, lines: [{ materialId, plannedQty: Number(qty), unitId: selected?.baseUnitId }] }) }); const message = `已创建 ${order.documentNo}`; setNotice(message); Toast.success(message); setMaterialId(""); setQty("1"); setRemark(""); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "保存失败"); } finally { setSaving(false); } }
  return <View style={[appStyles.stack]}><SectionHeader index="01" title="排产信息" /><SelectField label="产出物料" value={materialId} onChange={setMaterialId} options={choices.map((item) => [item.id, item.name])} /><Field label="计划数量" value={qty} type="number" onChange={setQty} /><SelectField label="目标库位" value={locationId} onChange={setLocationId} options={reference.locations.map((item) => [item.id, item.name])} /><DateField label="计划日期" value={date} onChange={setDate} /><Field label="备注" value={remark} onChange={setRemark} /><Feedback message={notice} success={notice.startsWith("已创建")} /><SubmitButton loading={saving} disabled={!materialId || !locationId || Number(qty) <= 0} onPress={() => void submit()}>创建生产订单</SubmitButton></View>;
}
