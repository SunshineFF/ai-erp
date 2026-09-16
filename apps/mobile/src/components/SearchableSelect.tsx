import React, { useMemo, useState } from "react";
import Input from "@ant-design/react-native/es/input";
import { createPortal } from "react-dom";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { AppIcon } from "./AppIcon";

export type SelectOption = [value: string, label: string];

export type SearchableSelectProps = {
  title: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
};

export function SearchableSelect({ title, value, options, onChange, placeholder = "请选择", searchable = true, searchPlaceholder = "搜索名称、编码或单号" }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const selected = options.find(([optionValue]) => optionValue === value)?.[1];
  const filteredOptions = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return options;
    return options.filter(([, optionLabel]) => optionLabel.toLocaleLowerCase("zh-CN").includes(normalized));
  }, [keyword, options]);

  const close = () => { setOpen(false); setKeyword(""); };
  const choose = (nextValue: string) => { onChange(nextValue); close(); };

  return (
    <>
      <Pressable accessibilityLabel={`${title}，${selected ?? placeholder}`} accessibilityRole="button" onPress={() => setOpen(true)} style={({ pressed }) => [styles.select, pressed && styles.pressed]}>
        <Text numberOfLines={1} style={selected ? styles.selectText : styles.placeholder}>{selected ?? placeholder}</Text>
        <AppIcon name="chevron-down" color={colors.secondary} size={18} />
      </Pressable>
      {(open ? createPortal(
        <View style={styles.overlay}>
          <Pressable accessibilityLabel="关闭选择" onPress={close} style={styles.backdrop} />
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.titleGroup}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.count}>{filteredOptions.length} 项</Text>
              </View>
              <Pressable accessibilityLabel="关闭选择" onPress={close} style={styles.closeButton}><Text style={styles.closeText}>取消</Text></Pressable>
            </View>
            {searchable && <View style={styles.searchWrap}><Input value={keyword} onChangeText={setKeyword} placeholder={searchPlaceholder} style={styles.searchInput} /></View>}
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.optionScroll}>
              {filteredOptions.length ? filteredOptions.map(([optionValue, optionLabel], index) => {
                const active = optionValue === value;
                return (
                  <Pressable accessibilityRole="button" key={optionValue} onPress={() => choose(optionValue)} style={({ pressed }) => [styles.option, index < filteredOptions.length - 1 && styles.optionBorder, pressed && styles.pressed]}>
                    <Text numberOfLines={2} style={[styles.optionText, active && styles.optionTextActive]}>{optionLabel}</Text>
                    {active && <AppIcon name="check" color={colors.primary} size={18} />}
                  </Pressable>
                );
              }) : <View style={styles.empty}><Text style={styles.emptyTitle}>未找到匹配项</Text><Text style={styles.emptyHint}>请尝试其他关键词</Text></View>}
            </ScrollView>
          </View>
        </View>,
        document.body,
      ) : null) as unknown as React.ReactNode}
    </>
  );
}

const styles = StyleSheet.create({
  select: { minHeight: 48, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 12 },
  selectText: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, paddingRight: 8 },
  placeholder: { flex: 1, minWidth: 0, color: colors.secondary, fontSize: 14, paddingRight: 8 },
  pressed: { backgroundColor: "#eef4f2" },
  overlay: { position: "fixed" as "absolute", inset: 0, zIndex: 1000, alignItems: "center", justifyContent: "flex-end" },
  backdrop: { position: "absolute", inset: 0, backgroundColor: "rgba(8, 24, 21, 0.45)" },
  sheet: { width: "100%", maxWidth: 640, maxHeight: "76%", borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: "hidden", backgroundColor: colors.surface },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border, paddingLeft: 18 },
  titleGroup: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline" },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  count: { color: colors.secondary, fontSize: 11, marginLeft: 8 },
  closeButton: { minWidth: 64, minHeight: 48, alignItems: "center", justifyContent: "center" },
  closeText: { color: colors.primary, fontSize: 14 },
  searchWrap: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, backgroundColor: "#f7f9f8" },
  searchInput: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 12 },
  optionScroll: { maxHeight: 380 },
  option: { minHeight: 54, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 8 },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: "#edf1f0" },
  optionText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 21, paddingRight: 12 },
  optionTextActive: { color: colors.primary, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 42, paddingHorizontal: 20 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  emptyHint: { color: colors.secondary, fontSize: 12, marginTop: 6 },
});
