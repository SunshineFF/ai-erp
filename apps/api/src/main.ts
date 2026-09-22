import "reflect-metadata";
import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join, resolve } from "node:path";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix("api");
  const configuredOrigins = [process.env.WEB_ORIGIN ?? "http://localhost:5173", process.env.MOBILE_ORIGIN ?? "http://localhost:5177"];
  const allowedOrigins = [...new Set([
    ...configuredOrigins,
    "http://localhost:5173",
    "http://localhost:5177",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5177",
  ])];
  // 局域网访问：允许本机所有 IPv4 地址的 5173/5177 端口作为来源（开发环境）
  const os = await import("node:os");
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal) allowedOrigins.push(`http://${info.address}:5173`, `http://${info.address}:5177`);
    }
  }
  app.enableCors({ origin: allowedOrigins, exposedHeaders: ["X-Access-Token"] });
  app.useStaticAssets(join(process.cwd(), "uploads", "materials"), { prefix: "/uploads/materials/" });
  app.useStaticAssets(resolve(process.cwd(), process.env.MEDIA_LOCAL_DIR ?? "storage/media"), { prefix: "/media/" });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  await app.listen(Number(process.env.PORT ?? 3030));
}
bootstrap();
