// 状态中文释义：所有含 status 的 API 返回值统一附加 status_text（批次为 batch_status_text）
export const PURCHASE_ORDER_STATUS_TEXT: Record<string, string> = { DRAFT: "草稿", CONFIRMED: "已确认", PARTIALLY_RECEIVED: "部分收货", RECEIVED: "已收货", CANCELLED: "已取消" };
export const SALES_ORDER_STATUS_TEXT: Record<string, string> = { DRAFT: "草稿", CONFIRMED: "已确认", IN_PRODUCTION: "生产中", READY: "已备妥", PARTIALLY_SHIPPED: "部分出库", SHIPPED: "已出库", CANCELLED: "已取消" };
export const BOM_STATUS_TEXT: Record<string, string> = { DRAFT: "草稿", PENDING_RELEASE: "待发布", EFFECTIVE: "已生效", DISABLED: "已停用" };
export const PRODUCTION_STATUS_TEXT: Record<string, string> = { DRAFT: "草稿", RELEASED: "已下达", IN_PROGRESS: "生产中", COMPLETED: "已完工", CLOSED: "已关闭", VOIDED: "已作废" };
export const BATCH_STATUS_TEXT: Record<string, string> = { AVAILABLE: "可用", LOCKED: "锁定", FROZEN: "冻结", QUARANTINE: "隔离", EXPIRED: "已过期" };
export const POSTING_STATUS_TEXT: Record<string, string> = { DRAFT: "草稿", POSTED: "已过账", REVERSED: "已冲销", CANCELLED: "已取消" };
export const SHIPMENT_STATUS_TEXT: Record<string, string> = { DRAFT: "待出库", POSTED: "已出库", REVERSED: "已冲销", CANCELLED: "已取消" };
export const IMPORT_TASK_STATUS_TEXT: Record<string, string> = { PARSING: "解析中", NEEDS_REVIEW: "待复核", CONFIRMED: "已确认", FAILED: "失败" };
export const BILL_STATUS_TEXT: Record<string, string> = { OPEN: "待结算", SETTLED: "已结算", VOIDED: "已作废" };

// 类型中文释义：所有含 materialType / productionType 的 API 返回值统一附加 material_type_text / production_type_text
export const MATERIAL_TYPE_TEXT: Record<string, string> = { RAW_MATERIAL: "原材料", AUXILIARY: "辅料", SEMI_FINISHED: "半成品", FINISHED_GOOD: "成品", GOODS: "商品", SERVICE: "服务" };
export const PRODUCTION_TYPE_TEXT: Record<string, string> = { MAKE_TO_ORDER: "按订单生产", MAKE_TO_STOCK: "按库存生产" };

export function withStatusText<T extends { status?: string | null }>(row: T, map: Record<string, string>): T & { status_text: string } {
  return { ...row, status_text: (row.status != null && map[row.status]) || row.status || "" };
}

export function withBatchStatusText<T extends { batchStatus?: string | null }>(row: T): T & { batch_status_text: string } {
  return { ...row, batch_status_text: (row.batchStatus != null && BATCH_STATUS_TEXT[row.batchStatus]) || row.batchStatus || "" };
}

// 通用枚举字段释义：追加 `<snake_field>_text` 中文文案（如 materialType → material_type_text）
export function withEnumText<T extends object>(row: T, field: string, map: Record<string, string>): T & Record<string, string> {
  const value = (row as any)[field];
  const textKey = `${field.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)}_text`;
  return { ...row, [textKey]: (value != null && map[value]) || value || "" };
}

export const materialText = (row: any) => withEnumText(row, "materialType", MATERIAL_TYPE_TEXT);
export const productionTypeText = (row: any) => withEnumText(row, "productionType", PRODUCTION_TYPE_TEXT);

export const purchaseOrderText = (row: any) => withStatusText(row, PURCHASE_ORDER_STATUS_TEXT);
export const salesOrderText = (row: any) => withStatusText(row, SALES_ORDER_STATUS_TEXT);
export const bomText = (row: any) => withStatusText(row, BOM_STATUS_TEXT);
export const productionText = (row: any) => withStatusText(row, PRODUCTION_STATUS_TEXT);
export const postingText = (row: any) => withStatusText(row, POSTING_STATUS_TEXT);
export const importTaskText = (row: any) => withStatusText(row, IMPORT_TASK_STATUS_TEXT);
export const billText = (row: any) => withStatusText(row, BILL_STATUS_TEXT);
// 出库单：status_text 用出库语境，嵌套 order 一并补销售单 status_text
export const shipmentText = (row: any) => { const shipment = withStatusText(row, SHIPMENT_STATUS_TEXT); return row?.order ? { ...shipment, order: salesOrderText(row.order) } : shipment; };
// 生产单：status_text + production_type_text 一次补齐
export const productionOrderText = (row: any) => productionTypeText(productionText(row));
