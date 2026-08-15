import { StyleSheet } from "react-native";

export const colors = {
  primary: "#17675f",
  primaryDark: "#173f3b",
  accent: "#d05a37",
  background: "#f5f7f6",
  surface: "#ffffff",
  border: "#d8e1de",
  text: "#18302d",
  secondary: "#6f817d",
  success: "#12604c",
  error: "#a13325",
};

export const appStyles = StyleSheet.create({
  app: { minHeight: "100%", backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 112 },
  stack: { gap: 12 },
  row: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  muted: { color: colors.secondary, fontSize: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  subtitle: { color: colors.secondary, fontSize: 12, marginTop: 4 },
  card: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, backgroundColor: colors.surface },
  stickySpace: { height: 12 },
});

export const antTheme = {
  brand_primary: colors.primary,
  brand_primary_tap: colors.primaryDark,
  color_text_base: colors.text,
  border_color_base: colors.border,
  fill_body: colors.background,
};
