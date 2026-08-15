export function clearSessionAndRedirect() {
  localStorage.removeItem("erp_token");
  localStorage.removeItem("erp_user");
  if (window.location.pathname !== "/") window.location.assign("/");
  else window.location.reload();
}

function isPublicLoginRequest(path: string) {
  return path === "/auth/login" || path === "/auth/wecom/config";
}

export async function apiRequest<T>(base: string, path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("erp_token");
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers ?? {}) }
  });
  const refreshedToken = response.headers.get("X-Access-Token");
  if (refreshedToken) localStorage.setItem("erp_token", refreshedToken);
  if (!response.ok) {
    if (response.status === 401 && token && !isPublicLoginRequest(path)) clearSessionAndRedirect();
    throw new Error((await response.json().catch(() => null))?.message ?? "请求失败");
  }
  return response.json();
}

export async function uploadRequest<T>(base: string, path: string, body: BodyInit): Promise<T> {
  const token = localStorage.getItem("erp_token");
  const response = await fetch(`${base}${path}`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  const refreshedToken = response.headers.get("X-Access-Token");
  if (refreshedToken) localStorage.setItem("erp_token", refreshedToken);
  if (!response.ok) {
    if (response.status === 401 && token && !isPublicLoginRequest(path)) clearSessionAndRedirect();
    throw new Error((await response.json().catch(() => null))?.message ?? "上传失败");
  }
  return response.json();
}
