import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type PrismaError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientValidationError
  | Prisma.PrismaClientInitializationError
  | Prisma.PrismaClientRustPanicError
  | Prisma.PrismaClientUnknownRequestError;

function isPrismaError(error: unknown): error is PrismaError {
  return error instanceof Prisma.PrismaClientKnownRequestError
    || error instanceof Prisma.PrismaClientValidationError
    || error instanceof Prisma.PrismaClientInitializationError
    || error instanceof Prisma.PrismaClientRustPanicError
    || error instanceof Prisma.PrismaClientUnknownRequestError;
}

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (!isPrismaError(error)) return response.status(500).json({ statusCode: 500, message: error instanceof Error ? error.message : String(error) });

    const details = {
      error: error.name,
      prismaCode: "code" in error ? error.code : "errorCode" in error ? error.errorCode : undefined,
      details: error.message,
      meta: "meta" in error ? error.meta : undefined,
      clientVersion: "clientVersion" in error ? error.clientVersion : undefined,
    };

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      // P2003 既可能来自删除被引用记录，也可能来自写入非法外键（如空/无效的关联 ID）
      const isDelete = ["delete", "deleteMany", "update", "updateMany"].includes(String((error.meta as any)?.operation ?? ""));
      const target = String((error.meta as any)?.field_name ?? (error.meta as any)?.target ?? "").replace(/_fkey.*$/, "");
      const message = isDelete
        ? "该记录仍被其他业务数据引用，无法删除"
        : `数据关联校验失败：${target ? `字段 ${target} 引用的记录不存在` : "引用的关联记录不存在"}`;
      return response.status(isDelete ? 409 : 400).json({ statusCode: isDelete ? 409 : 400, code: isDelete ? "DELETE_CONFLICT" : "FK_VIOLATION", message, ...(isDelete ? { dependencies: [], suggestion: "请先处理相关业务记录，再重试删除" } : { suggestion: "请检查关联字段（如报价、物料、供应商）是否有效后重试" }), ...details });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return response.status(404).json({ statusCode: 404, message: "记录不存在", ...details });
    }

    const statusCode = error instanceof Prisma.PrismaClientInitializationError ? 503
      : error instanceof Prisma.PrismaClientRustPanicError || error instanceof Prisma.PrismaClientUnknownRequestError ? 500
        : error instanceof Prisma.PrismaClientValidationError ? 400 : 400;
    return response.status(statusCode).json({ statusCode, code: "code" in error ? error.code : "errorCode" in error ? error.errorCode : "PRISMA_ERROR", message: error.message, ...details });
  }
}
