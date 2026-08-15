import React, { useEffect, useState } from "react";
import Button from "@ant-design/react-native/es/button";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { Field } from "../components/FormControls";
import { Feedback } from "../components/BusinessComponents";
import { AppIcon } from "../components/AppIcon";
import { colors } from "../theme";
import type { User } from "../types";

export function LoginScreen({ onLogin }: { onLogin: (user: User, token?: string) => void }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1)); const token = params.get("wecom_token"); const message = params.get("wecom_error");
    if (token || message) history.replaceState({}, document.title, location.pathname);
    if (message) { setError(message); return; }
    if (token) { localStorage.setItem("erp_mobile_token", token); void api<User>("/auth/me").then((user) => onLogin(user, token)).catch((reason) => { localStorage.removeItem("erp_mobile_token"); setError(reason.message); }); return; }
    if (/wxwork|wecom|wxworklocal/i.test(navigator.userAgent) && !sessionStorage.getItem("mobile_wecom_started")) { sessionStorage.setItem("mobile_wecom_started", "1"); void startWecom(true); }
  }, []);
  async function passwordLogin() { setLoading(true); setError(""); try { const result = await api<{ accessToken: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }); onLogin(result.user, result.accessToken); } catch (reason) { setError(reason instanceof Error ? reason.message : "登录失败"); } finally { setLoading(false); } }
  async function startWecom(automatic = false) { setLoading(true); setError(""); try { const result = await api<{ authorizeUrl: string }>("/auth/wecom/config"); location.assign(result.authorizeUrl); } catch (reason) { if (automatic) sessionStorage.removeItem("mobile_wecom_started"); setError(reason instanceof Error ? reason.message : "企业微信登录不可用"); setLoading(false); } }
  return <View style={styles.screen}><View style={styles.container}><View style={styles.brand}><View style={styles.logo}><AppIcon name="app" color="#fff" size={28} /></View><View style={styles.brandCopy}><Text style={styles.brandName}>橡胶 ERP</Text><Text style={styles.brandCaption}>现场作业端</Text></View></View><View style={styles.form}><Text style={styles.title}>登录</Text><Text style={styles.subtitle}>进入订单与出库作业</Text><Field label="用户名" value={username} onChange={setUsername} /><Field label="密码" value={password} type="password" onChange={setPassword} /><Feedback message={error} success={false} /><Button type="primary" loading={loading} disabled={!username || !password} onPress={() => void passwordLogin()}>账号密码登录</Button><View style={styles.divider}><View style={styles.rule} /><Text style={styles.or}>或</Text><View style={styles.rule} /></View><Button type="ghost" loading={loading} onPress={() => void startWecom()}>企业微信登录</Button></View></View></View>;
}

const styles = StyleSheet.create({
  screen: { minHeight: "100%", paddingHorizontal: 22, paddingTop: 48, paddingBottom: 32, backgroundColor: colors.background },
  container: { width: "100%", maxWidth: 440, alignSelf: "center" },
  brand: { flexDirection: "row", alignItems: "center", marginBottom: 38 },
  logo: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.accent },
  brandCopy: { marginLeft: 13 },
  brandName: { color: colors.text, fontSize: 18, fontWeight: "700" },
  brandCaption: { color: colors.secondary, fontSize: 12, marginTop: 3 },
  form: { gap: 14, paddingTop: 22, borderTopWidth: 3, borderTopColor: colors.primaryDark },
  title: { color: colors.text, fontSize: 26, fontWeight: "700" },
  subtitle: { color: colors.secondary, fontSize: 13, marginBottom: 8 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  rule: { height: 1, flex: 1, backgroundColor: colors.border },
  or: { color: colors.secondary, fontSize: 11 },
});
