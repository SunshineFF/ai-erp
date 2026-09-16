import { apiRequest, uploadRequest } from "./apiClient";

export const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3030/api";
export function request<T>(path: string, options?: RequestInit) { return apiRequest<T>(API, path, options); }
export async function uploadMaterialImage(id: string, file: File) { const body = new FormData(); body.append("file", file); return uploadRequest(API, `/materials/${id}/image`, body); }
export async function removeMaterialImage(id: string) { return request(`/materials/${id}/image`, { method: "DELETE" }); }
export function assetUrl(path?: string) { return path ? `${API.replace(/\/api$/, "")}${path}` : ""; }
