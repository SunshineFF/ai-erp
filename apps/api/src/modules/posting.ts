import { BadRequestException, Injectable } from "@nestjs/common";
import { BatchStatus, InventoryTransactionType, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { calculateMovingAverage } from "../domain";

export type PostInventoryInput = {
  idempotencyKey: string;
  companyId: string;
  warehouseId: string;
  locationId: string;
  materialId: string;
  batchId: string;
  unitId: string;
  quantityDelta: number;
  transactionType: InventoryTransactionType;
  sourceDocumentType: string;
  sourceDocumentId?: string;
  unitCostCny?: number;
  reasonCode?: string;
  remark?: string;
  actorUserId?: string;
  reversedTransactionId?: string;
};

@Injectable()
export class InventoryPostingService {
  constructor(private readonly prisma: PrismaService) {}

  async post(tx: Prisma.TransactionClient, input: PostInventoryInput) {
    const previous = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (previous) return previous;
    if (!input.idempotencyKey?.trim()) throw new BadRequestException("库存过账必须提供幂等键");
    if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) throw new BadRequestException("库存变动数量不能为零");

    const batch = await tx.inventoryBatch.findUniqueOrThrow({ where: { id: input.batchId } });
    if (batch.companyId !== input.companyId || batch.materialId !== input.materialId) throw new BadRequestException("批次与物料不匹配");
    if (input.quantityDelta < 0) {
      if (batch.batchStatus !== BatchStatus.AVAILABLE) throw new BadRequestException("只有可用批次可以出库");
      if (batch.expiryDate.getTime() < new Date().setHours(0, 0, 0, 0)) throw new BadRequestException("过期批次禁止领料或发货");
    }

    const balanceKey = {
      companyId: input.companyId,
      warehouseId: input.warehouseId,
      locationId: input.locationId,
      materialId: input.materialId,
      batchId: input.batchId,
      unitId: input.unitId,
    };
    const balance = await tx.inventoryBalance.findUnique({ where: { companyId_warehouseId_locationId_materialId_batchId_unitId: balanceKey } });
    const currentAvailable = Number(balance?.availableQty ?? 0);
    if (input.quantityDelta < 0 && currentAvailable + input.quantityDelta < -0.000001) throw new BadRequestException("可用库存不足，禁止超发或超领");

    const currentCost = await tx.materialCost.findUnique({ where: { companyId_materialId: { companyId: input.companyId, materialId: input.materialId } } });
    const oldQty = Number(currentCost?.onHandQty ?? 0);
    const oldValue = Number(currentCost?.inventoryValueCny ?? 0);
    const oldAverage = Number(currentCost?.movingAverageCostCny ?? 0);
    const unitCost = input.unitCostCny ?? (input.quantityDelta > 0 ? Number(batch.unitCostCny) : oldAverage);
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new BadRequestException("库存单位成本无效");
    const { amountDelta, newQty, newValue, newAverage } = calculateMovingAverage(oldQty, oldValue, input.quantityDelta, unitCost);

    const updatedBalance = await tx.inventoryBalance.upsert({
      where: { companyId_warehouseId_locationId_materialId_batchId_unitId: balanceKey },
      update: {
        onHandQty: { increment: input.quantityDelta },
        availableQty: { increment: input.quantityDelta },
        version: { increment: 1 },
      },
      create: { ...balanceKey, onHandQty: input.quantityDelta, availableQty: input.quantityDelta },
    });
    if (Number(updatedBalance.onHandQty) < -0.000001 || Number(updatedBalance.availableQty) < -0.000001) throw new BadRequestException("库存余额不能为负数");

    await tx.materialCost.upsert({
      where: { companyId_materialId: { companyId: input.companyId, materialId: input.materialId } },
      update: { onHandQty: newQty, inventoryValueCny: newValue, movingAverageCostCny: newAverage, version: { increment: 1 } },
      create: { companyId: input.companyId, materialId: input.materialId, onHandQty: newQty, inventoryValueCny: newValue, movingAverageCostCny: newAverage },
    });
    const transaction = await tx.inventoryTransaction.create({
      data: {
        transactionNo: `IT-${Date.now()}-${randomUUID().slice(0, 8)}`,
        idempotencyKey: input.idempotencyKey,
        companyId: input.companyId,
        transactionType: input.transactionType,
        materialId: input.materialId,
        batchId: input.batchId,
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        quantityDelta: input.quantityDelta,
        unitId: input.unitId,
        unitCostCny: unitCost,
        amountDeltaCny: amountDelta,
        sourceDocumentType: input.sourceDocumentType,
        sourceDocumentId: input.sourceDocumentId,
        reasonCode: input.reasonCode,
        remark: input.remark,
        actorUserId: input.actorUserId,
        reversedTransactionId: input.reversedTransactionId,
      },
    });
    await tx.costRecord.create({ data: { companyId: input.companyId, materialId: input.materialId, inventoryTransactionId: transaction.id, quantityDelta: input.quantityDelta, unitCostCny: unitCost, amountDeltaCny: amountDelta, balanceQty: newQty, balanceValueCny: newValue, movingAverageCostCny: newAverage } });
    await this.audit(tx, input.companyId, input.actorUserId, "inventory.post", "InventoryTransaction", transaction.id, { transactionNo: transaction.transactionNo, type: transaction.transactionType, quantityDelta: input.quantityDelta });
    return transaction;
  }

  async reverse(transactionId: string, reasonCode: string, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.inventoryTransaction.findUniqueOrThrow({ where: { id: transactionId } });
      const priorReversal = await tx.inventoryTransaction.findFirst({ where: { reversedTransactionId: original.id } });
      if (priorReversal) return priorReversal;
      if (original.transactionType === InventoryTransactionType.REVERSAL) throw new BadRequestException("冲销事务不能再次冲销");
      const setting = await tx.systemSetting.findUnique({ where: { companyId_settingKey: { companyId: original.companyId, settingKey: "inventory.reversal_window_days" } } });
      const periodClosed = await tx.systemSetting.findUnique({ where: { companyId_settingKey: { companyId: original.companyId, settingKey: "finance.period_closed" } } });
      if (periodClosed?.settingValue === true) throw new BadRequestException("财务期间已结账，禁止直接冲销");
      const windowDays = Number(setting?.settingValue ?? 7);
      if ((Date.now() - original.postedAt.getTime()) / 86400000 > windowDays) throw new BadRequestException(`已超过 ${windowDays} 天冲销时限`);
      return this.post(tx, {
        idempotencyKey: `REV:${original.id}`,
        companyId: original.companyId,
        warehouseId: original.warehouseId,
        locationId: original.locationId,
        materialId: original.materialId,
        batchId: original.batchId,
        unitId: original.unitId,
        quantityDelta: -Number(original.quantityDelta),
        transactionType: InventoryTransactionType.REVERSAL,
        sourceDocumentType: "INVENTORY_REVERSAL",
        sourceDocumentId: original.id,
        unitCostCny: Number(original.unitCostCny),
        reasonCode,
        actorUserId,
        reversedTransactionId: original.id,
        remark: `冲销 ${original.transactionNo}`,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  audit(tx: Prisma.TransactionClient, companyId: string | undefined, actorUserId: string | undefined, action: string, resourceType: string, resourceId: string | undefined, afterData?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { companyId, actorUserId, action, resourceType, resourceId, afterData } });
  }
}
