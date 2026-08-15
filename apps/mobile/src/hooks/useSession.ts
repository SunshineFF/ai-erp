import { useEffect, useState } from "react";
import { api } from "../api";
import type { User } from "../types";

export function useSession() {
  const [user, setUser] = useState<User | null>(() => { try { return JSON.parse(localStorage.getItem("erp_mobile_user") ?? "null"); } catch { return null; } });
  useEffect(() => {
    if (!localStorage.getItem("erp_mobile_token")) return;
    void api<User>("/auth/me").then((current) => { localStorage.setItem("erp_mobile_user", JSON.stringify(current)); setUser(current); }).catch(() => setUser(null));
  }, []);
  const completeLogin = (current: User, token?: string) => { if (token) localStorage.setItem("erp_mobile_token", token); localStorage.setItem("erp_mobile_user", JSON.stringify(current)); setUser(current); };
  return { user, completeLogin };
}
