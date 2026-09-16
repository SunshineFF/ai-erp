import { ConflictException, NotFoundException } from "@nestjs/common";

export type DeleteDependency = { resource: string; count: number };

export function deleteConflict(message: string, dependencies: DeleteDependency[], suggestion = "请先处理相关业务记录，再重试删除") {
  throw new ConflictException({ code: "DELETE_CONFLICT", message, dependencies, suggestion });
}

export function deleted(id: string) { return { deleted: true, id }; }

export function ensureFound<T>(value: T | null | undefined, message = "记录不存在"): T {
  if (!value) throw new NotFoundException(message);
  return value;
}
