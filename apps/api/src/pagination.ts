import { BadRequestException } from "@nestjs/common";

export type PaginationQuery = { page?: string; pageSize?: string; q?: string; createdFrom?: string; createdTo?: string; status?: string; partnerId?: string };
export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

export function parsePagination(query: PaginationQuery = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1) throw new BadRequestException("page 必须是大于 0 的整数");
  if (![20, 50, 100].includes(pageSize)) throw new BadRequestException("pageSize 只能是 20、50 或 100");
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function createdAtFilter(query: PaginationQuery) {
  if (!query.createdFrom && !query.createdTo) return undefined;
  const createdAt: Record<string, Date> = {};
  if (query.createdFrom) createdAt.gte = new Date(`${query.createdFrom}T00:00:00.000Z`);
  if (query.createdTo) createdAt.lte = new Date(`${query.createdTo}T23:59:59.999Z`);
  return createdAt;
}
