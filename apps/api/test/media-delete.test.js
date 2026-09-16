const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtemp, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { MediaStorageService } = require("../dist/src/media/media.service");

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "erp-media-delete-"));
  process.env.MEDIA_STORAGE = "local";
  process.env.MEDIA_LOCAL_DIR = directory;
  const key = "reimbursements/test/proof.txt";
  const path = join(directory, key);
  await mkdir(join(directory, "reimbursements/test"), { recursive: true });
  await writeFile(path, "proof");
  return { directory, key, path, service: new MediaStorageService() };
}

test("存储对象与数据库动作同步删除成功", async () => {
  const value = await fixture();
  try {
    let databaseDeleted = false;
    await value.service.withRemoved({ key: value.key, url: "", provider: "local" }, async () => { databaseDeleted = true; });
    assert.equal(databaseDeleted, true);
    await assert.rejects(() => readFile(value.path), /ENOENT/);
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});

test("数据库删除失败时恢复已删除文件", async () => {
  const value = await fixture();
  try {
    await assert.rejects(() => value.service.withRemoved({ key: value.key, url: "", provider: "local" }, async () => { throw new Error("database failed"); }), /database failed/);
    assert.equal(await readFile(value.path, "utf8"), "proof");
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});

test("存储删除失败时不执行数据库动作", async () => {
  const value = await fixture();
  try {
    await rm(value.path);
    let databaseCalled = false;
    await assert.rejects(() => value.service.withRemoved({ key: value.key, url: "", provider: "local" }, async () => { databaseCalled = true; }), /ENOENT/);
    assert.equal(databaseCalled, false);
  } finally { await rm(value.directory, { recursive: true, force: true }); }
});
