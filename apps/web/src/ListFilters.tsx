import { RemoteSelectField } from "./shared/CrudUi";

type FilterOption = [string, string];

export function ListFilters({ partnerLabel, partnerValue = "", partnerOptions = [], partnerFetchOptions, createdDate, createdDateEnd = "", resultCount, onPartnerChange, onCreatedDateChange, onCreatedDateEndChange, onClear }: { partnerLabel?: string; partnerValue?: string; partnerOptions?: FilterOption[]; partnerFetchOptions?: (keyword: string) => Promise<FilterOption[]>; createdDate: string; createdDateEnd?: string; resultCount: number; onPartnerChange?: (value: string) => void; onCreatedDateChange: (value: string) => void; onCreatedDateEndChange: (value: string) => void; onClear: () => void }) {
  const active = Boolean(partnerValue || createdDate || createdDateEnd);
  return <div className="list-filters">{partnerLabel && (partnerFetchOptions && partnerOptions.length > 10 ? <div className="list-filter-select"><RemoteSelectField label={partnerLabel} value={partnerValue} onChange={(v) => onPartnerChange?.(v)} fetchOptions={partnerFetchOptions} initialOptions={partnerOptions} placeholder={`输入名称或编码搜索${partnerLabel}`} /></div> : <label><span>{partnerLabel}</span><select value={partnerValue} onChange={(event) => onPartnerChange?.(event.target.value)}><option value="">全部{partnerLabel}</option>{partnerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}<label><span>创建日期起</span><input type="date" value={createdDate} onChange={(event) => onCreatedDateChange(event.target.value)} /></label><label><span>创建日期止（可选）</span><input type="date" min={createdDate || undefined} value={createdDateEnd} onChange={(event) => onCreatedDateEndChange(event.target.value)} /></label><span className="filter-count">{resultCount} 条记录</span>{active && <button type="button" className="ghost-action" onClick={onClear}>清除筛选</button>}</div>;
}

export function createdDateKey(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createdDateInRange(value: string | undefined, startDate: string, endDate: string) {
  const date = createdDateKey(value);
  return Boolean(date) && (!startDate || date >= startDate) && (!endDate || date <= endDate);
}
