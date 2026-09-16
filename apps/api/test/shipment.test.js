const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateShipmentAmount } = require("../dist/src/domain.js");

test("销售单多次出库后金额精确等于销售单金额", () => {
  const first = calculateShipmentAmount(10, 100.01, 0, 0, 3);
  const second = calculateShipmentAmount(10, 100.01, 3, first, 3);
  const final = calculateShipmentAmount(10, 100.01, 6, first + second, 4);
  assert.equal(Math.round((first + second + final) * 100), 10001);
});

test("累计出库数量不能超过销售单数量", () => {
  assert.throws(() => calculateShipmentAmount(10, 100, 8, 80, 3), /出库数量超过销售单剩余数量/);
});
