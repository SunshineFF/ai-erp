import React from "react";
import Button from "@ant-design/react-native/es/button";
import Card from "@ant-design/react-native/es/card";
import Tag from "@ant-design/react-native/es/tag";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Field, FormRow, SelectField } from "./FormControls";
import { appStyles, colors } from "../theme";
import type { Material, OrderLineDraft } from "../types";
import { AppIcon } from "./AppIcon";

export function SectionHeader({ index, title, action }: { index: string; title: string; action?: React.ReactNode }) {
  return <View style={styles.sectionHeader}><Tag style={styles.indexTag}>{index}</Tag><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionAction}>{action}</View></View>;
}

export function Feedback({ message, success }: { message: string; success: boolean }) {
  if (!message) return null;
  return <Card style={{ borderColor: success ? "#a8d8c9" : "#f0c4bc", borderWidth: 1, backgroundColor: success ? "#eaf8f3" : "#fff0ed" }}><View style={{ padding: 11 }}><Text style={{ color: success ? colors.success : colors.error, fontSize: 13 }}>{message}</Text></View></Card>;
}

export function SubmitButton({ loading, disabled, children, onPress }: { loading: boolean; disabled?: boolean; children: React.ReactNode; onPress?: () => void }) {
  return <Button type="primary" loading={loading} disabled={disabled} onPress={onPress} style={styles.submit}>{children}</Button>;
}

export function OrderLineCard({ index, line, materials, units, removable, onChange, onRemove }: { index: number; line: OrderLineDraft; materials: Material[]; units: Array<{ id: string; name: string }>; removable: boolean; onChange: (patch: Partial<OrderLineDraft>) => void; onRemove: () => void }) {
  return <Card style={appStyles.card}><Card.Header title={`物料 ${index + 1}`} extra={<Pressable accessibilityLabel={`删除物料 ${index + 1}`} disabled={!removable} onPress={onRemove} style={[styles.removeButton, { opacity: removable ? 1 : .25 }]}><AppIcon name="trash" color={colors.error} size={18} /></Pressable>} /><View style={styles.lineBody}><SelectField label="物料" value={line.materialId} options={materials.map((item) => [item.id, item.name])} onChange={(materialId) => { const material = materials.find((item) => item.id === materialId); onChange({ materialId, unitId: material?.baseUnitId ?? "" }); }} /><FormRow><Field label="数量" value={line.quantity} type="number" onChange={(quantity) => onChange({ quantity })} /><Field label="含税单价" value={line.unitPrice} type="number" onChange={(unitPrice) => onChange({ unitPrice })} /></FormRow><SelectField label="单位" value={line.unitId} options={units.map((item) => [item.id, item.name])} onChange={(unitId) => onChange({ unitId })} /></View></Card>;
}

export function AddLineButton({ onPress }: { onPress: () => void }) {
  return <Button type="ghost" size="small" onPress={onPress}><View style={styles.buttonContent}><AppIcon name="plus" color={colors.primary} size={14} /><Text style={styles.ghostText}>添加</Text></View></Button>;
}

const styles = StyleSheet.create({
  sectionHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  indexTag: { backgroundColor: colors.primary, borderColor: colors.primary, marginRight: 8 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  sectionAction: { marginLeft: "auto" },
  submit: { minHeight: 50, marginTop: 6, borderRadius: 7 },
  removeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  lineBody: { padding: 12, gap: 12 },
  buttonContent: { flexDirection: "row", alignItems: "center" },
  ghostText: { color: colors.primary, fontSize: 14, marginLeft: 6 },
});
