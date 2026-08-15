import { Controller, Get, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async summary() {
    const [materialCount, batchCount, productionOpen, lowStock] = await Promise.all([
      this.prisma.material.count({ where: { isActive: true } }),
      this.prisma.inventoryBatch.count({ where: { batchStatus: "AVAILABLE" } }),
      this.prisma.productionOrder.count({ where: { status: { in: ["DRAFT", "RELEASED", "IN_PROGRESS"] } } }),
      this.prisma.inventoryBalance.count({ where: { availableQty: { lte: 0 } } }),
    ]);
    const expiring = await this.prisma.inventoryBatch.findMany({ where: { expiryDate: { lte: new Date(Date.now() + 30 * 86400000) }, batchStatus: "AVAILABLE" }, take: 8, orderBy: { expiryDate: "asc" } });
    return { metrics: { materialCount, availableBatchCount: batchCount, openProductionOrders: productionOpen, emptyBalances: lowStock }, expiringBatches: expiring };
  }
}

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly service: DashboardService) {}
  @Get() summary() { return this.service.summary(); }
}
