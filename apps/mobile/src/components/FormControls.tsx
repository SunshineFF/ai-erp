import React, { useState } from "react";
import Input from "@ant-design/react-native/es/input";
import { createPortal } from "react-dom";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { appStyles, colors } from "../theme";
import { AppIcon } from "./AppIcon";

type Option = [string, string];

export function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "password" | "number"; placeholder?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><Input value={value} onChangeText={onChange} type={type} placeholder={placeholder} allowClear style={styles.input} /></View>;
}

export function DateField(props: Omit<React.ComponentProps<typeof Field>, "type">) {
  return <Field {...props} placeholder="YYYY-MM-DD" />;
}

export function SelectField({ label, value, onChange, options, placeholder = "请选择" }: { label: string; value: string; onChange: (value: string) => void; options: Option[]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(([optionValue]) => optionValue === value)?.[1];
  const choose = (nextValue: string) => { onChange(nextValue); setOpen(false); };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityLabel={`${label}，${selected ?? placeholder}`} accessibilityRole="button" onPress={() => setOpen(true)} style={({ pressed }) => [styles.select, pressed && styles.pressed]}>
        <Text numberOfLines={1} style={selected ? styles.selectText : styles.placeholder}>{selected ?? placeholder}</Text>
        <AppIcon name="chevron-down" color={colors.secondary} size={18} />
      </Pressable>
      {(open ? createPortal(<View style={styles.overlay}><Pressable accessibilityLabel="关闭选择" onPress={() => setOpen(false)} style={styles.backdrop} /><View style={styles.modal}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{label}</Text><Pressable accessibilityLabel="关闭选择" onPress={() => setOpen(false)} style={styles.closeButton}><Text style={styles.closeText}>取消</Text></Pressable></View><ScrollView style={styles.optionScroll}>{options.length ? options.map(([optionValue, optionLabel], index) => { const active = optionValue === value; return <Pressable key={optionValue} onPress={() => choose(optionValue)} style={({ pressed }) => [styles.option, index < options.length - 1 && styles.optionBorder, pressed && styles.pressed]}><Text style={[styles.optionText, active && styles.optionTextActive]}>{optionLabel}</Text>{active && <AppIcon name="check" color={colors.primary} size={18} />}</Pressable>; }) : <Text style={styles.empty}>暂无可选项</Text>}</ScrollView></View></View>, document.body) : null) as unknown as React.ReactNode}
    </View>
  );
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <View style={appStyles.row}>{React.Children.map(children, (child) => <View style={appStyles.flex}>{child}</View>)}</View>;
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { color: colors.secondary, fontSize: 12, fontWeight: "600" },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 12 },
  select: { minHeight: 48, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 12 },
  selectText: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, paddingRight: 8 },
  placeholder: { flex: 1, minWidth: 0, color: colors.secondary, fontSize: 14, paddingRight: 8 },
  pressed: { backgroundColor: "#eef4f2" },
  overlay: { position: "fixed" as "absolute", inset: 0, zIndex: 1000, alignItems: "center", justifyContent: "flex-end" },
  backdrop: { position: "absolute", inset: 0, backgroundColor: "rgba(8, 24, 21, 0.45)" },
  modal: { width: "100%", maxWidth: 640, maxHeight: "70%", borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: "hidden", backgroundColor: colors.surface },
  modalHeader: { minHeight: 56, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingLeft: 18 },
  modalTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: "700" },
  closeButton: { minWidth: 64, minHeight: 48, alignItems: "center", justifyContent: "center" },
  closeText: { color: colors.primary, fontSize: 14 },
  optionScroll: { maxHeight: 360 },
  option: { minHeight: 54, flexDirection: "row", alignItems: "center", paddingHorizontal: 18 },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: "#edf1f0" },
  optionText: { flex: 1, color: colors.text, fontSize: 15, paddingRight: 12 },
  optionTextActive: { color: colors.primary, fontWeight: "700" },
  empty: { color: colors.secondary, fontSize: 14, textAlign: "center", padding: 32 },
});
