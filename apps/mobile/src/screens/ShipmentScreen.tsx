import React, { useEffect, useState } from "react";
import Button from "@ant-design/react-native/es/button";
import Card from "@ant-design/react-native/es/card";
import Result from "@ant-design/react-native/es/result";
import Toast from "@ant-design/react-native/es/toast";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { Feedback, SectionHeader, SubmitButton } from "../components/BusinessComponents";
import { AppIcon } from "../components/AppIcon";
import { Field, SelectField } from "../components/FormControls";
import { appStyles, colors } from "../theme";
import type { ReferenceData } from "../types";

type Pick = { stockKey: string; quantity: string };

export function ShipmentScreen({ reference }: { reference: ReferenceData }) {
  const [orders, setOrders] = useState<any[]>([]); const [balances, setBalances] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [selectedId, setSelectedId] = useState(""); const [picks, setPicks] = useState<Record<string, Pick>>({}); const [notice, setNotice] = useState(""); const [saving, setSaving] = useState(false); const [loading, setLoading] = useState(false);
  async function load() { setLoading(true); setNotice(""); try { const [orderRows, balanceRows, batchRows] = await Promise.all([api<any[]>("/sales-orders"), api<any[]>("/inventory/balances"), api<any[]>("/inventory/batches")]); setOrders(orderRows.filter((item) => ["CONFIRMED", "READY", "IN_PRODUCTION", "PARTIALLY_SHIPPED"].includes(item.status))); setBalances(balanceRows); setBatches(batchRows); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "加载失败"); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const order = orders.find((item) => item.id === selectedId);
  const stockFor = (materialId: string) => balances.filter((balance) => balance.materialId === materialId && Number(balance.availableQty) > 0).map((balance) => ({ ...balance, batch: batches.find((batch) => batch.id === balance.batchId) }));
  const pickFor = (line: any): Pick => picks[line.id] ?? { stockKey: "", quantity: String(Number(line.quantity) - Number(line.shippedQty)) };
  async function ship() { if (!order) return; setSaving(true); setNotice(""); try { const lines = order.lines.map((line: any) => { const pick = pickFor(line); const stock = stockFor(line.materialId).find((item) => `${item.batchId}:${item.locationId}` === pick.stockKey); return { salesOrderLineId: line.id, batchId: stock?.batchId, locationId: stock?.locationId, quantity: Number(pick.quantity) }; }); if (lines.some((line: any) => !line.batchId || line.quantity <= 0)) throw new Error("请为每行选择批次并填写出库数量"); await api(`/sales-orders/${order.id}/shipments`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ lines }) }); const message = `订单 ${order.documentNo} 已完成本次出库`; setNotice(message); Toast.success(message); setSelectedId(""); setPicks({}); await load(); } catch (reason) { setNotice(reason instanceof Error ? reason.message : "出库失败"); } finally { setSaving(false); } }
  return <View style={appStyles.stack}><View style={styles.summary}><Text style={appStyles.muted}>{orders.length} 个待出库订单</Text><Button type="ghost" size="small" loading={loading} onPress={() => void load()}><View style={styles.refreshContent}><AppIcon name="refresh" color={colors.primary} size={14} /><Text style={styles.refreshText}>刷新</Text></View></Button></View><SelectField label="销售订单" value={selectedId} onChange={(value) => { setSelectedId(value); setPicks({}); }} options={orders.map((item) => [item.id, `${item.customer?.name ?? "客户"} · ${item.documentNo}`])} />{order && <><SectionHeader index="01" title="拣货明细" />{order.lines.map((line: any) => { const material = reference.materials.find((item) => item.id === line.materialId); const remaining = Number(line.quantity) - Number(line.shippedQty); const stocks = stockFor(line.materialId); const pick = pickFor(line); return <Card key={line.id} style={appStyles.card}><Card.Header title={material?.name ?? "物料"} extra={<Text style={styles.remaining}>待发 {remaining}</Text>} /><View style={[appStyles.stack, { padding: 12 }]}><SelectField label="库存批次" value={pick.stockKey} onChange={(stockKey) => setPicks((current) => ({ ...current, [line.id]: { ...pick, stockKey } }))} options={stocks.map((stock) => [`${stock.batchId}:${stock.locationId}`, `${stock.batch?.batchNo ?? "批次"} · 可用 ${stock.availableQty}`])} /><Field label="本次出库数量" value={pick.quantity} type="number" onChange={(quantity) => setPicks((current) => ({ ...current, [line.id]: { ...pick, quantity } }))} /></View></Card>; })}<SubmitButton loading={saving} onPress={() => void ship()}>确认销售出库</SubmitButton></>}<Feedback message={notice} success={notice.includes("已完成")} />{!orders.length && !loading && <Result img={<AppIcon name="shipment" color="#9bb0ab" size={42} />} title="暂无待出库订单" message="已确认的销售订单会显示在这里" />}</View>;
}

const styles = StyleSheet.create({
  summary: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  remaining: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  refreshContent: { flexDirection: "row", alignItems: "center" },
  refreshText: { color: colors.primary, fontSize: 14, marginLeft: 6 },
});
