import { ImagePlus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import { assetUrl } from "../api";

type ImageUploadProps = { value?: string; file?: File | null; onChange: (file: File | null) => void; onRemove?: () => Promise<void> | void; disabled?: boolean };

export function ImageUpload({ value, file, onChange, onRemove, disabled = false }: ImageUploadProps) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const [cleared, setCleared] = useState(false);
  useEffect(() => { setCleared(false); if (!file) { setPreview(value ? assetUrl(value) : ""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file, value]);
  const select = (next?: File) => { if (!next) return; if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(next.type)) { setError("仅支持 JPG、PNG、WebP 或 GIF 图片"); return; } if (next.size > 10 * 1024 * 1024) { setError("图片大小不能超过 10MB"); return; } setError(""); onChange(next); };
  const remove = async () => { if (!onRemove) { setCleared(true); onChange(null); return; } setRemoving(true); setError(""); try { await onRemove(); setCleared(true); onChange(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "图片删除失败"); } finally { setRemoving(false); } };
  return <div className={`image-upload${disabled ? " disabled" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) select(event.dataTransfer.files[0]); }}>
    {preview && !cleared ? <div className="image-upload-preview"><img src={preview} alt="预览" /><div className="image-upload-actions"><label className="ghost-action icon-text"><RefreshCw size={14} />替换<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={disabled} onChange={(event) => select(event.target.files?.[0])} /></label><button className="ghost-action danger icon-text" type="button" disabled={disabled || removing} onClick={() => void remove()}><Trash2 size={14} />{removing ? "删除中..." : "删除"}</button></div></div> : <label className="image-upload-empty"><UploadCloud size={20} /><span>点击或拖拽上传图片</span><small>单张不超过 10MB</small><input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={disabled} onChange={(event) => select(event.target.files?.[0])} /></label>}
    {error && <small className="error-text">{error}</small>}
  </div>;
}

export function ImageUploadCompact(props: ImageUploadProps) { return <div className="image-upload-compact"><ImagePlus size={15} /><ImageUpload {...props} /></div>; }
