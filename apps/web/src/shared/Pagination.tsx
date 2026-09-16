import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="pagination"><span>共 {total} 条</span><label>每页<select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{[20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><button className="icon-button" title="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} /></button><span>{page} / {totalPages}</span><button className="icon-button" title="下一页" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={16} /></button></div>;
}
