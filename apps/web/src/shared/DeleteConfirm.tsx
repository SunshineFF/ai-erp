import { Trash2, X } from "lucide-react";

export type DeleteTarget = { title: string; description?: string; run: () => Promise<void> };

export function DeleteConfirm({ target, busy, error, onClose, onConfirm }: { target?: DeleteTarget; busy: boolean; error?: string; onClose: () => void; onConfirm: () => void }) {
  if (!target) return null;
  return <div className="modal-backdrop"><div className="modal compact-modal"><div className="modal-header"><h2>确认删除</h2><button className="icon-button" onClick={onClose} disabled={busy}><X size={18} /></button></div><div className="delete-confirm"><Trash2 size={24} /><p>确定永久删除 <strong>{target.title}</strong>？</p><small>{target.description ?? "删除后无法恢复；如果存在业务引用，系统会拒绝删除并说明原因。"}</small>{error && <div className="error banner">{error}</div>}<div className="modal-actions"><button className="ghost-action" onClick={onClose} disabled={busy}>取消</button><button className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? "删除中..." : "永久删除"}</button></div></div></div></div>;
}
