require("dotenv/config");
const assert = require("node:assert/strict");
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/src/app.module.js");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { unlink } = require("node:fs/promises");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  let createdImport;
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  const base = `http://127.0.0.1:${address.port}/api`;
  const call = async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, options);
    const body = await response.json().catch(() => null);
    assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(body)}`);
    return body;
  };
  try {
    const login = await call("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "Admin123!" }) });
    assert.ok(login.accessToken);
    const headers = { Authorization: `Bearer ${login.accessToken}`, "Content-Type": "application/json" };
    const renewalResponse = await fetch(`${base}/auth/me`, { headers });
    assert.equal(renewalResponse.status, 200);
    const renewedToken = renewalResponse.headers.get("x-access-token");
    assert.ok(renewedToken, "鉴权响应应返回续期令牌");
    const renewedPayload = JSON.parse(Buffer.from(renewedToken.split(".")[1], "base64url").toString("utf8"));
    assert.ok(Math.abs((renewedPayload.exp - renewedPayload.iat) - 7 * 24 * 60 * 60) <= 1, "续期令牌有效期应为 7 天");
    const me = await call("/auth/me", { headers });
    assert.ok(me.permissions.includes("system.manage"));
    const [dashboard, reports, rates, imports] = await Promise.all([call("/dashboard", { headers }), call("/reports/inventory", { headers }), call("/settings/exchange-rates", { headers }), call("/imports", { headers })]);
    assert.ok(dashboard.metrics);
    assert.ok(Array.isArray(reports.items));
    assert.ok(rates.items.some((rate) => rate.currencyCode === "USD"));
    assert.ok(Array.isArray(imports.items));
    const form = new FormData();
    const sample = readFileSync(join(process.cwd(), "..", "..", "outputs", "一期数据导入样例", "一期数据导入样例.xlsx"));
    form.append("targetType", "AUTO");
    form.append("file", new Blob([sample]), "一期数据导入样例.xlsx");
    const imported = await call("/imports/upload", { method: "POST", headers: { Authorization: `Bearer ${login.accessToken}` }, body: form });
    createdImport = imported;
    assert.equal(imported.status, "NEEDS_REVIEW", imported.errorMessage ?? "导入解析失败");
    assert.equal(imported.file.originalName, "一期数据导入样例.xlsx");
    assert.equal(imported.items.length, 11);
    const protectedFile = await fetch(`${base}/imports/${imported.id}/file`, { headers: { Authorization: `Bearer ${login.accessToken}` } });
    assert.equal(protectedFile.status, 200);
    assert.ok((await protectedFile.arrayBuffer()).byteLength > 1000);
    assert.equal((await fetch(`${base}/imports/${imported.id}/file`)).status, 401);
    console.log(JSON.stringify({ login: login.user.username, permissionCount: me.permissions.length, dashboard: dashboard.metrics, inventoryReportRows: reports.items.length, importTasksBefore: imports.items.length, parsedRows: imported.items.length }));
  } finally {
    await app.close();
    if (createdImport) {
      await prisma.importTask.delete({ where: { id: createdImport.id } });
      await prisma.documentFile.delete({ where: { id: createdImport.documentFileId } });
      await unlink(join(process.cwd(), createdImport.file.storagePath)).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}
main();
