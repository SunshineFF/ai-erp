import { BadRequestException } from "@nestjs/common";

export function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function calculateLineAmounts(quantity: number, unitPrice: number, taxRate: number, priceIncludesTax: boolean, exchangeRate: number) {
  if (quantity <= 0 || unitPrice < 0 || taxRate < 0 || exchangeRate <= 0) throw new BadRequestException("金额计算参数无效");
  const entered = quantity * unitPrice;
  const netAmount = roundMoney(priceIncludesTax ? entered / (1 + taxRate) : entered);
  const taxAmount = roundMoney(priceIncludesTax ? entered - netAmount : entered * taxRate);
  const grossAmount = roundMoney(netAmount + taxAmount);
  return { netAmount, taxAmount, grossAmount, grossAmountCny: roundMoney(grossAmount * exchangeRate) };
}

export function calculateMovingAverage(oldQty: number, oldValue: number, quantityDelta: number, unitCost: number) {
  if (![oldQty, oldValue, quantityDelta, unitCost].every(Number.isFinite) || unitCost < 0 || quantityDelta === 0) throw new BadRequestException("库存成本参数无效");
  const newQty = oldQty + quantityDelta;
  const amountDelta = quantityDelta * unitCost;
  const newValue = oldValue + amountDelta;
  if (newQty < -0.000001 || newValue < -0.01) throw new BadRequestException("库存成本余额不足，无法过账");
  return { amountDelta, newQty, newValue, newAverage: newQty > 0 ? newValue / newQty : 0 };
}
