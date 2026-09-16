import React from "react";
import Input from "@ant-design/react-native/es/input";
import { StyleSheet, Text, View } from "react-native";
import { appStyles, colors } from "../theme";
import { SearchableSelect, type SelectOption } from "./SearchableSelect";

export function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "password" | "number"; placeholder?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><Input value={value} onChangeText={onChange} type={type} placeholder={placeholder} allowClear style={styles.input} /></View>;
}

export function DateField(props: Omit<React.ComponentProps<typeof Field>, "type">) {
  return <Field {...props} placeholder="YYYY-MM-DD" />;
}

export function SelectField({ label, value, onChange, options, placeholder, searchable, searchPlaceholder }: { label: string; value: string; onChange: (value: string) => void; options: SelectOption[]; placeholder?: string; searchable?: boolean; searchPlaceholder?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><SearchableSelect title={label} value={value} options={options} onChange={onChange} placeholder={placeholder} searchable={searchable} searchPlaceholder={searchPlaceholder} /></View>;
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <View style={appStyles.row}>{React.Children.map(children, (child) => <View style={appStyles.flex}>{child}</View>)}</View>;
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { color: colors.secondary, fontSize: 12, fontWeight: "600" },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 12 },
});
