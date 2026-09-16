const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePagination, pageResult } = require("../dist/src/pagination.js");

test("pagination uses the shared defaults", () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20, skip: 0, take: 20 });
  assert.deepEqual(parsePagination({ page: "3", pageSize: "50" }), { page: 3, pageSize: 50, skip: 100, take: 50 });
});

test("pagination rejects unsupported values", () => {
  assert.throws(() => parsePagination({ page: "0" }), /page/);
  assert.throws(() => parsePagination({ pageSize: "10" }), /pageSize/);
});

test("page result includes totals", () => {
  assert.deepEqual(pageResult([1, 2], 42, 2, 20), { items: [1, 2], total: 42, page: 2, pageSize: 20, totalPages: 3 });
});
