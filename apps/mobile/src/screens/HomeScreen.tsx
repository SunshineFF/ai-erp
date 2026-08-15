import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import { colors } from "../theme";
import type { User, ViewKey } from "../types";

const tasks: Array<{ view: Exclude<ViewKey, "home">; title: string; detail: string; icon: AppIconName }> = [
  { view: "production", title: "生产订单录入", detail: "按物料和计划日期快速排产", icon: "production" },
  { view: "purchase", title: "采购单录入", detail: "登记供应商与采购物料", icon: "purchase" },
  { view: "shipment", title: "销售订单出库", detail: "按订单选择库存批次发货", icon: "shipment" },
  { view: "finance", title: "报销与资金流水", detail: "查看并新增现场财务记录", icon: "finance" },
];

export function HomeScreen({ user, onOpen }: { user: User; onOpen: (view: ViewKey) => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.operator}>
        <View style={styles.operatorBody}>
          <View style={styles.avatar}><AppIcon name="user" color={colors.accent} size={24} /></View>
          <View style={styles.operatorText}>
            <Text style={styles.caption}>当前操作员</Text>
            <Text numberOfLines={1} style={styles.name}>{user.displayName || user.username}</Text>
          </View>
        </View>
      </View>

      <View>
        <Text style={styles.heading}>选择现场任务</Text>
        <View style={styles.taskList}>
          {tasks.map((task, index) => (
            <Pressable
              accessibilityLabel={task.title}
              key={task.view}
              onPress={() => onOpen(task.view)}
              style={({ pressed }) => [styles.taskRow, index < tasks.length - 1 && styles.taskBorder, pressed && styles.pressed]}
            >
              <View style={styles.taskIcon}><AppIcon name={task.icon} color={colors.primary} size={22} /></View>
              <View style={styles.taskCopy}>
                <Text numberOfLines={1} style={styles.taskTitle}>{task.title}</Text>
                <Text numberOfLines={2} style={styles.taskDetail}>{task.detail}</Text>
              </View>
              <AppIcon name="chevron-right" color="#91a09d" size={18} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 20 },
  operator: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, backgroundColor: colors.surface },
  operatorBody: { flexDirection: "row", alignItems: "center", padding: 16 },
  avatar: { width: 48, height: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#fff0eb", marginRight: 13 },
  operatorText: { flex: 1, minWidth: 0 },
  caption: { color: colors.secondary, fontSize: 12, marginBottom: 3 },
  name: { color: colors.text, fontSize: 20, fontWeight: "700" },
  heading: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 10 },
  taskList: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface },
  taskRow: { minHeight: 82, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  taskBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  taskIcon: { width: 42, height: 42, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#e2f1ee", marginRight: 12 },
  taskCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  taskTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  taskDetail: { color: colors.secondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  pressed: { backgroundColor: "#f0f5f3" },
});
