export type CurrentUser = { id: string; username: string; displayName: string; permissions: string[] };
export type Material = { id: string; code: string; name: string; materialType: string; material_type_text?: string; categoryId: string; baseUnitId: string; imageUrl?: string; parentMaterialId?: string | null; variantEnabled?: boolean; variantValues?: Array<{ attributeValueId: string; attributeValue?: { code: string; name: string; attribute?: { name: string } } }>; purchasable: boolean; saleable: boolean; manufacturable: boolean; defaultTaxRateId?: string; shelfLifeDays?: number; expiryWarningDays: number; isActive: boolean };
export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

export function pageItems<T>(value: PageResult<T> | T[]): T[] { return Array.isArray(value) ? value : value.items; }
