import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import type { ViewKey } from "../types";
import { AppIcon, type AppIconName } from "./AppIcon";

const navigation: Array<{ key: ViewKey; title: string; icon: AppIconName }> = [
  { key: "home", title: "首页", icon: "home" },
  { key: "production", title: "生产", icon: "production" },
  { key: "purchase", title: "采购", icon: "purchase" },
  { key: "shipment", title: "出库", icon: "shipment" },
  { key: "finance", title: "财务", icon: "finance" },
];

export function AppHeader({ title, canGoBack, onBack, onLogout }: { title: string; canGoBack: boolean; onBack: () => void; onLogout: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable accessibilityLabel={canGoBack ? "返回" : "应用标识"} disabled={!canGoBack} onPress={onBack} style={styles.iconButton}>
        <AppIcon name={canGoBack ? "back" : "app"} color="#fff" size={22} />
      </Pressable>
      <View style={styles.heading}>
        <Text style={styles.brand}>橡胶 ERP</Text>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
      </View>
      <Pressable accessibilityLabel="退出登录" onPress={onLogout} style={styles.iconButton}>
        <AppIcon name="logout" color="#fff" size={21} />
      </Pressable>
    </View>
  );
}

export function BottomNavigation({ selected, onChange }: { selected: ViewKey; onChange: (view: ViewKey) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.tabBar}>
      {navigation.map((item) => {
        const active = selected === item.key;
        return (
          <Pressable
            accessibilityLabel={item.title}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.key}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}
          >
            <View style={[styles.tabIcon, active && styles.tabIconActive]}>
              <AppIcon name={item.icon} color={active ? colors.primary : colors.secondary} size={20} />
            </View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 72, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, flexDirection: "row", alignItems: "center", backgroundColor: colors.primaryDark },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  heading: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  brand: { color: "#afd0c9", fontSize: 11 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 2 },
  tabBar: { position: "fixed" as "absolute", left: "50%", right: "auto", bottom: 0, width: "100%", maxWidth: 640, height: 76, transform: [{ translateX: "-50%" }], flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: 4, zIndex: 100 },
  tabItem: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", paddingTop: 7, paddingBottom: 6 },
  tabIcon: { width: 34, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  tabIconActive: { backgroundColor: "#e2f1ee" },
  tabLabel: { color: colors.secondary, fontSize: 11, marginTop: 2 },
  tabLabelActive: { color: colors.primary, fontWeight: "700" },
  pressed: { opacity: 0.7 },
});
