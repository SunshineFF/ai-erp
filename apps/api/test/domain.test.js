const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateLineAmounts, calculateMovingAverage } = require("../dist/src/domain.js");

test("含税金额按行舍入并折算人民币", () => {
  assert.deepEqual(calculateLineAmounts(10, 11.3, 0.13, true, 7.2), { netAmount: 100, taxAmount: 13, grossAmount: 113, grossAmountCny: 813.6 });
});

test("未税价格计算税额", () => {
  assert.deepEqual(calculateLineAmounts(5, 20, 0.13, false, 1), { netAmount: 100, taxAmount: 13, grossAmount: 113, grossAmountCny: 113 });
});

test("采购入库更新移动平均成本", () => {
  const result = calculateMovingAverage(100, 1000, 50, 14);
  assert.equal(result.newQty, 150);
  assert.equal(result.newValue, 1700);
  assert.equal(result.newAverage, 1700 / 150);
});

test("出库按当前平均成本结转", () => {
  assert.deepEqual(calculateMovingAverage(150, 1800, -30, 12), { amountDelta: -360, newQty: 120, newValue: 1440, newAverage: 12 });
});

test("库存不足时拒绝成本过账", () => {
  assert.throws(() => calculateMovingAverage(2, 20, -3, 10), /库存成本余额不足/);
});
