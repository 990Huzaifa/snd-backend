import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { Country } from 'src/master-db/entities/country.entity';
import { State } from 'src/master-db/entities/state.entity';
import { City } from 'src/master-db/entities/city.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { TenantModule as TenantModuleEntity } from 'src/master-db/entities/tenant-modules.entity';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { Subscription } from 'src/master-db/entities/subscription.entity';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TenantRuntimeModule } from 'src/tenant-db/tenant-runtime.module';
import { TenantAuthController } from './controller/tenant-auth.controller';
import { TenantActivityLogController } from './controller/tenant-activity-log.controller';
import { TenantDesignationController } from './controller/tenant-designation.controller';
import { TenantNotificationController } from './controller/tenant-notification.controller';
import { DistributorController } from './controller/distributor.controller';
import { AreaController } from './controller/area.controller';
import { FlavourController } from './controller/flavour.controller';
import { ProductBrandController } from './controller/product-brand.controller';
import { ProductCategoryController } from './controller/product-category.controller';
import { ProductController } from './controller/product.controller';
import { PjpController } from './controller/pjp.controller';
import { RegionController } from './controller/region.controller';
import { RouteController } from './controller/route.controller';
import { TenantRoleController } from './controller/tenant-role.controller';
import { TenantUserController } from './controller/tenant-user.controller';
import { UomController } from './controller/uom.controller';
import { TenantJobController } from './controller/tenant-job.controller';
import { OpeningStockController } from './controller/opening-stock.controller';
import { ProductPricingJobController } from './controller/product-pricing-job.controller';
import { PurchaseStockController } from './controller/purchase-stock.controller';
import { MasterTenantDataController } from './controller/master-tenant-data.controller';
import { StockTransferController } from './controller/stock-transfer.controller';
import { RetailerCategoryController } from './controller/retailer-category.controller';
import { RetailerChannelController } from './controller/retailer-channel.controller';
import { RetailerController } from './controller/retailer.controller';
import { SchemeController } from './controller/scheme.controller';
import { TargetPlanController } from './controller/target-plan.controller';
import { StockController } from './controller/stock.controller';
import { SaleOrderController } from './controller/saleorder.controller';
import { SaleVoucherController } from './controller/sale-voucher.controller';
import { SaleReturnController } from './controller/sale-return.controller';
import { SaleInvoiceController } from './controller/sale-invoice.controller';
import { LoadsheetController } from './controller/loadsheet.controller';
import { RiderLoadsheetController } from './controller/rider-app/loadsheet.controller';
import { SalesmanAttendanceController } from './controller/salesman-app/attendance.controller';
import { SalesmanRetailerVisitController } from './controller/salesman-app/retailer-visit.controller';
import { SalesmanSyncDownController } from './controller/salesman-app/sync-down.controller';
import { SalesmanSyncUpController } from './controller/salesman-app/sync-up.controller';
import { MerchandiserSyncDownController } from './controller/merchandiser/sync-down.controller';
import { MerchandiserSyncUpController } from './controller/merchandiser/sync-up.controller';
import { AttendanceController } from './controller/attendance.controller';
import { ProfileController } from './controller/profile.controller';
import { InventoryReportController } from './controller/report/inventory-report.controller';
import { RetailerVisitReportController } from './controller/report/retailer-visit-report.controller';
import { RetailerCheckInReportController } from './controller/report/retailer-checkin-report.controller';
import { TenantAuthService } from './service/tenant-auth.service';
import { ActivityLogService } from './service/activity-log.service';
import { TenantDesignationService } from './service/tenant-designation.service';
import { NotificationService } from './service/notification.service';
import { DistributorService } from './service/distributor.service';
import { AreaService } from './service/area.service';
import { ProductBrandService } from './service/product/product-brand.service';
import { ProductCategoryService } from './service/product/product-category.service';
import { ProductService } from './service/product/product.service';
import { PjpService } from './service/pjp.service';
import { RegionService } from './service/region.service';
import { RouteService } from './service/route.service';
import { TenantRoleService } from './service/tenant-role.service';
import { UserService } from './service/user.service';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantUtilityController } from './controller/utility.controller';
import { MailModule } from 'src/common/mail/mail.module';
import { CommonModule } from 'src/common/common.module';
import { TenantUtilityService } from './service/tenant-utility.service';
import { MasterGeoHelperService } from './service/master-geo-helper.service';
import { PusherService } from 'src/common/pusher/pusher.service';
import { TenantJobService } from './service/tenant-job.service';
import { OpeningStockService } from './service/opening-stock.service';
import { StockService } from './service/stock.service';
import { ProductPricingJobService } from './service/product/product-pricing-job.service';
import { PurchaseStockService } from './service/purchase-stock.service';
import { MasterTenantDataService } from './service/master-tenant-data.service';
import { StockTransferService } from './service/stock-transfer.service';
import { RetailerCategoryService } from './service/retailer/retailer-category.service';
import { RetailerChannelService } from './service/retailer/retailer-channel.service';
import { RetailerService } from './service/retailer/retailer.service';
import { AssetController } from './controller/asset.controller';
import { AssetService } from './service/asset.service';
import { SchemeService } from './service/scheme.service';
import { TargetPlanService } from './service/target-plan.service';
import { StockImportService } from './service/stock-import.service';
import { RetailerSchemeEngineService } from './service/retailer/retailer-scheme-engine.service';
import { ProductSchemeEngineService } from './service/product/product-scheme-engine.service';
import { SaleOrderService } from './service/saleorder.service';
import { SaleVoucherService } from './service/sale-voucher.service';
import { SaleReturnService } from './service/sale-return.service';
import { SaleInvoiceService } from './service/sale-invoice.service';
import { LoadsheetService } from './service/loadsheet.service';
import { RiderLoadsheetService } from './service/rider-app/loadsheet.service';
import { RiderSaleOrderDeliveryService } from './service/rider-app/sale-order-delivery.service';
import { RetailerVisitService } from './service/salesman-app/retailer-visit.service';
import { MerchandiserSyncDownService } from './service/merchandiser-app/sync-down.service';
import { MerchandiserSyncUpService } from './service/merchandiser-app/sync-up.service';
import { SalesmanAttendanceService } from './service/salesman-app/attendance.service';
import { SalesmanSyncDownService } from './service/salesman-app/sync-down.service';
import { SalesmanSyncUpService } from './service/salesman-app/sync-up.service';
import { AttendanceService } from './service/attendance.service';
import { RetailerLedgerService } from './service/retailer/retailer-ledger.service';
import { UomService } from './service/product/uom.service';
import { FlavourService } from './service/product/flavour.service';
import { DatabaseBackupController } from './controller/database-backup.controller';
import { TenantDatabaseBackupService } from './service/tenant-database-backup.service';
import { PgDumpService } from './service/pg-dump.service';
import { ProfileService } from './service/profile.service';
import { InventoryReportService } from './service/report/inventory-report.service';
import { RetailerVisitReportService } from './service/report/retailer-visit-report.service';
import { RetailerCheckInReportService } from './service/report/retailer-checkin-report.service';


@Module({
  imports: [
    HttpModule,
    AuthModule,
    MailModule,
    CommonModule,
    TenantRuntimeModule,
    TypeOrmModule.forFeature([
      Tenant,
      Country,
      State,
      City,
      TenantSettings,
      TenantGeoPolicy,
      TenantTheme,
      TenantModuleEntity,
      Subscription,
      TenantDbConfig,
    ]),
  ],
  controllers: [
    TenantAuthController,
    TenantActivityLogController,
    TenantRoleController,
    TenantDesignationController,
    TenantNotificationController,
    DistributorController,
    AreaController,
    FlavourController,
    ProductBrandController,
    ProductCategoryController,
    ProductController,
    PjpController,
    RegionController,
    RouteController,
    UomController,
    TenantJobController,
    TenantUtilityController,
    TenantUserController,
    OpeningStockController,
    ProductPricingJobController,
    PurchaseStockController,
    MasterTenantDataController,
    StockTransferController,
    RetailerCategoryController,
    RetailerChannelController,
    RetailerController,
    AssetController,
    SchemeController,
    TargetPlanController,
    StockController,
    SaleOrderController,
    SaleVoucherController,
    SaleReturnController,
    SaleInvoiceController,
    LoadsheetController,
    RiderLoadsheetController,
    SalesmanAttendanceController,
    SalesmanRetailerVisitController,
    SalesmanSyncDownController,
    SalesmanSyncUpController,
    MerchandiserSyncDownController,
    MerchandiserSyncUpController,
    AttendanceController,
    ProfileController,
    DatabaseBackupController,
    InventoryReportController,
    RetailerVisitReportController,
    RetailerCheckInReportController,
  ],
  providers: [
    TenantAuthService,
    ActivityLogService,
    TenantRoleService,
    TenantDesignationService,
    NotificationService,
    DistributorService,
    AreaService,
    FlavourService,
    ProductBrandService,
    ProductCategoryService,
    ProductService,
    PjpService,
    RegionService,
    RouteService,
    UomService,
    TenantUtilityService,
    MasterGeoHelperService,
    UserService,
    TenantPermissionGuard,
    PusherService,
    TenantJobService,
    OpeningStockService,
    PurchaseStockService,
    StockService,
    ProductPricingJobService,
    MasterTenantDataService,
    StockTransferService,
    RetailerCategoryService,
    RetailerChannelService,
    RetailerService,
    AssetService,
    SchemeService,
    TargetPlanService,
    StockImportService,
    RetailerSchemeEngineService,
    ProductSchemeEngineService,
    SaleOrderService,
    SaleVoucherService,
    SaleReturnService,
    SaleInvoiceService,
    LoadsheetService,
    RiderLoadsheetService,
    RiderSaleOrderDeliveryService,
    RetailerVisitService,
    MerchandiserSyncDownService,
    MerchandiserSyncUpService,
    SalesmanAttendanceService,
    SalesmanSyncDownService,
    SalesmanSyncUpService,
    AttendanceService,
    RetailerLedgerService,
    TenantDatabaseBackupService,
    PgDumpService,
    ProfileService,
    InventoryReportService,
    RetailerVisitReportService,
    RetailerCheckInReportService,
  ],
})
export class TenantModule { }