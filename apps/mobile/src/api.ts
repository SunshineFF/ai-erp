const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export function logout() {
  localStorage.removeItem("erp_mobile_token");
  localStorage.removeItem("erp_mobile_user");
  window.location.reload();
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("erp_mobile_token");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers ?? {}) }
  });
  const refreshed = response.headers.get("X-Access-Token");
  if (refreshed) localStorage.setItem("erp_mobile_token", refreshed);
  if (!response.ok) {
    if (response.status === 401 && token && path !== "/auth/login" && path !== "/auth/wecom/config") logout();
    throw new Error((await response.json().catch(() => null))?.message ?? "请求失败");
  }
  return response.json();
}
