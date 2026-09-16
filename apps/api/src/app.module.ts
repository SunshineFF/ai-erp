import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "./prisma.service";
import { AuthController, AuthService } from "./modules/auth";
import { DashboardController, DashboardService } from "./modules/dashboard";
import { MaterialsController, MaterialsService } from "./modules/materials";
import { BomsController, BomsService } from "./modules/boms";
import { InventoryController, InventoryService } from "./modules/inventory";
import { ProductionController, ProductionService } from "./modules/production";
import { AdminController, AdminService } from "./modules/admin";
import { CustomersController, PartnersService, SuppliersController } from "./modules/partners";
import { OrdersService, PurchaseOrdersController, SalesOrdersController } from "./modules/orders";
import { SettingsController, SettingsService } from "./modules/settings";
import { FinanceController, FinanceService } from "./modules/finance";
import { ApiAuthGuard } from "./security";
import { InventoryPostingService } from "./modules/posting";
import { ImportsController, ImportsService } from "./modules/imports";
import { ReportsController, ReportsService } from "./modules/reports";
import { MediaModule } from "./media/media.module";

@Module({ imports: [JwtModule.register({ secret: process.env.JWT_SECRET ?? "dev-secret", signOptions: { expiresIn: "7d" } }), MediaModule], controllers: [AuthController, DashboardController, MaterialsController, BomsController, InventoryController, ProductionController, AdminController, SuppliersController, CustomersController, PurchaseOrdersController, SalesOrdersController, SettingsController, FinanceController, ImportsController, ReportsController], providers: [PrismaService, InventoryPostingService, AuthService, DashboardService, MaterialsService, BomsService, InventoryService, ProductionService, AdminService, PartnersService, OrdersService, SettingsService, FinanceService, ImportsService, ReportsService, { provide: APP_GUARD, useClass: ApiAuthGuard }] })
export class AppModule {}
