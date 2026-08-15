import React, { useCallback, useEffect, useState } from "react";
import Button from "@ant-design/react-native/es/button";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { Feedback, SubmitButton } from "../components/BusinessComponents";
import { AppIcon } from "../components/AppIcon";
import { DateField, Field, SelectField } from "../components/FormControls";
import { appStyles, colors } from "../theme";
import { today } from "../types";

type FinanceTab = "cash" | "reimbursements";
type CashFlow = { id: string; occurredAt: string; flowType: "INFLOW" | "OUTFLOW"; amount: string | number; currencyCode: string; description: string; documentNo: string };
type Reimbursement = { id: string; occurredAt: string; expenseType: string; amount: string | number; currencyCode: string; description: string; documentNo: string };

export function FinanceScreen() {
  const [tab, setTab] = useState<FinanceTab>("cash");
  const [cashFlows, setCashFlows] = useState<CashFlow[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cash, expense] = await Promise.all([api<CashFlow[]>("/finance/cash-flows"), api<Reimbursement[]>("/finance/reimbursements")]);
      setCashFlows(cash);
      setReimbursements(expense);
      setNotice("");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "财务记录加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const rows = tab === "cash" ? cashFlows : reimbursements;

  return (
    <View style={appStyles.stack}>
      <View style={styles.toolbar}>
        <View style={styles.segmented}>
          <Segment active={tab === "cash"} label="资金流水" onPress={() => { setTab("cash"); setEditing(false); setNotice(""); }} />
          <Segment active={tab === "reimbursements"} label="费用报销" onPress={() => { setTab("reimbursements"); setEditing(false); setNotice(""); }} />
        </View>
        <Pressable accessibilityLabel="刷新财务记录" onPress={() => void load()} style={styles.refreshButton}><AppIcon name="refresh" color={colors.primary} size={18} /></Pressable>
      </View>

      <Button type={editing ? "ghost" : "primary"} onPress={() => setEditing((current) => !current)}>
        <View style={styles.buttonContent}><AppIcon name={editing ? "back" : "plus"} color={editing ? colors.primary : "#fff"} size={16} /><Text style={[styles.buttonText, editing && styles.buttonTextGhost]}>{editing ? "返回记录" : tab === "cash" ? "新增流水" : "新增报销"}</Text></View>
      </Button>

      <Feedback message={notice} success={notice.startsWith("已保存")} />
      {editing ? (tab === "cash" ? <CashFlowForm onSaved={async (documentNo) => { setNotice(`已保存 ${documentNo}`); setEditing(false); await load(); }} /> : <ReimbursementForm onSaved={async (documentNo) => { setNotice(`已保存 ${documentNo}`); setEditing(false); await load(); }} />) : <FinanceList tab={tab} rows={rows} loading={loading} />}
    </View>
  );
}

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.segment, active && styles.segmentActive]}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text></Pressable>;
}

function FinanceList({ tab, rows, loading }: { tab: FinanceTab; rows: Array<CashFlow | Reimbursement>; loading: boolean }) {
  if (loading && !rows.length) return <Text style={styles.empty}>加载中...</Text>;
  if (!rows.length) return <Text style={styles.empty}>{tab === "cash" ? "暂无资金流水" : "暂无报销记录"}</Text>;
  return <View style={styles.list}>{rows.map((row, index) => {
    const cash = row as CashFlow;
    const reimbursement = row as Reimbursement;
    const title = tab === "cash" ? (cash.flowType === "INFLOW" ? "收入" : "支出") : reimbursement.expenseType;
    const positive = tab === "cash" && cash.flowType === "INFLOW";
    return <View key={row.id} style={[styles.record, index < rows.length - 1 && styles.recordBorder]}><View style={styles.recordTop}><View style={styles.recordCopy}><Text style={styles.recordTitle}>{title}</Text><Text numberOfLines={2} style={styles.description}>{row.description || "无描述"}</Text></View><Text style={[styles.amount, positive && styles.amountPositive]}>{positive ? "+" : "-"}{Number(row.amount).toFixed(2)} {row.currencyCode}</Text></View><View style={styles.meta}><Text style={styles.metaText}>{new Date(row.occurredAt).toLocaleDateString("zh-CN")}</Text><Text style={styles.metaText}>{row.documentNo}</Text></View></View>;
  })}</View>;
}

function CashFlowForm({ onSaved }: { onSaved: (documentNo: string) => Promise<void> }) {
  const [form, setForm] = useState({ occurredAt: today(), flowType: "OUTFLOW", amount: "", currencyCode: "CNY", description: "" });
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async () => { setSaving(true); setError(""); try { const row = await api<CashFlow>("/finance/cash-flows", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) }); await onSaved(row.documentNo); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } finally { setSaving(false); } };
  return <View style={styles.form}><Text style={styles.formTitle}>流水信息</Text><DateField label="日期" value={form.occurredAt} onChange={(occurredAt) => setForm({ ...form, occurredAt })} /><SelectField label="收支类型" value={form.flowType} options={[["INFLOW", "收入"], ["OUTFLOW", "支出"]]} onChange={(flowType) => setForm({ ...form, flowType })} /><Field label="金额" type="number" value={form.amount} placeholder="请输入金额" onChange={(amount) => setForm({ ...form, amount })} /><SelectField label="币种" value={form.currencyCode} options={[["CNY", "人民币 CNY"], ["USD", "美元 USD"]]} onChange={(currencyCode) => setForm({ ...form, currencyCode })} /><Field label="描述" value={form.description} placeholder="填写用途或来源" onChange={(description) => setForm({ ...form, description })} /><Feedback message={error} success={false} /><SubmitButton loading={saving} disabled={!form.occurredAt || Number(form.amount) <= 0 || !form.description.trim()} onPress={() => void submit()}>保存流水</SubmitButton></View>;
}

function ReimbursementForm({ onSaved }: { onSaved: (documentNo: string) => Promise<void> }) {
  const [form, setForm] = useState({ occurredAt: today(), expenseType: "办公费用", amount: "", currencyCode: "CNY", description: "" });
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async () => { setSaving(true); setError(""); try { const row = await api<Reimbursement>("/finance/reimbursements", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) }); await onSaved(row.documentNo); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败"); } finally { setSaving(false); } };
  return <View style={styles.form}><Text style={styles.formTitle}>报销信息</Text><DateField label="日期" value={form.occurredAt} onChange={(occurredAt) => setForm({ ...form, occurredAt })} /><SelectField label="费用类型" value={form.expenseType} options={[["办公费用", "办公费用"], ["差旅费用", "差旅费用"], ["运输费用", "运输费用"], ["招待费用", "招待费用"], ["其他费用", "其他费用"]]} onChange={(expenseType) => setForm({ ...form, expenseType })} /><Field label="金额" type="number" value={form.amount} placeholder="请输入金额" onChange={(amount) => setForm({ ...form, amount })} /><SelectField label="币种" value={form.currencyCode} options={[["CNY", "人民币 CNY"], ["USD", "美元 USD"]]} onChange={(currencyCode) => setForm({ ...form, currencyCode })} /><Field label="描述" value={form.description} placeholder="填写报销事项" onChange={(description) => setForm({ ...form, description })} /><Feedback message={error} success={false} /><SubmitButton loading={saving} disabled={!form.occurredAt || Number(form.amount) <= 0 || !form.description.trim()} onPress={() => void submit()}>保存报销</SubmitButton></View>;
}

const styles = StyleSheet.create({
  toolbar: { minHeight: 46, flexDirection: "row", alignItems: "center" },
  segmented: { flex: 1, flexDirection: "row", padding: 3, borderRadius: 7, backgroundColor: "#e7edeb" },
  segment: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.secondary, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: colors.primary, fontWeight: "700" },
  refreshButton: { width: 44, height: 44, marginLeft: 8, alignItems: "center", justifyContent: "center" },
  buttonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 15, marginLeft: 7 },
  buttonTextGhost: { color: colors.primary },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface },
  record: { padding: 14 },
  recordBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  recordTop: { flexDirection: "row", alignItems: "flex-start" },
  recordCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  recordTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  description: { color: colors.secondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  amount: { color: colors.error, fontSize: 15, fontWeight: "700" },
  amountPositive: { color: colors.success },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  metaText: { color: "#8a9996", fontSize: 11 },
  form: { gap: 12, paddingTop: 4 },
  formTitle: { color: colors.text, fontSize: 16, fontWeight: "700", paddingBottom: 4 },
  empty: { color: colors.secondary, fontSize: 14, textAlign: "center", paddingVertical: 48 },
});
