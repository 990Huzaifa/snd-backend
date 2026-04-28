import { DataSource } from 'typeorm';
import { Permission } from '../entities/permission.entity';

export const TENANT_PERMISSIONS = [
  { code: 'CREATE_USER', name: 'Create Users' },
  { code: 'CREATE_ROLE', name: 'Create Role' },
  { code: 'CREATE_DESIGNATION', name: 'Create Designation' },
  { code: 'CREATE_DISTRIBUTOR', name: 'Create Distributor' },
  { code: 'CREATE_PRODUCT_CATEGORY', name: 'Create Category' },
  { code: 'CREATE_PRODUCT_BRAND', name: 'Create Brand' },
  { code: 'CREATE_UOM', name: 'Create UOM' },
  { code: 'CREATE_RETAILER_CATEGORY', name: 'Create Retailer Category' },
  { code: 'CREATE_RETAILER_CHANNEL', name: 'Create Retailer Channel' },
  { code: 'CREATE_RETAILER', name: 'Create Retailer' },
  { code: 'CREATE_REGION', name: 'Create Region' },
  { code: 'CREATE_AREA', name: 'Create Area' },
  { code: 'CREATE_SALE_ORDER', name: 'Create Sale Order' },
  { code: 'CREATE_SALE_INVOICE', name: 'Create Sale Invoice' },
  { code: 'CREATE_SALE_RETURN', name: 'Create Sale Return' },
  { code: 'CREATE_SCHEME', name: 'Create Scheme' },
  { code: 'CREATE_ROUTE', name: 'Create Scheme' },
  { code: 'CREATE_ROUTE_SHARE', name: 'Create Scheme' },
  { code: 'CREATE_PJP', name: 'Create Scheme' },
  { code: 'CREATE_LOADSHEET', name: 'Create Scheme' },
  { code: 'CREATE_OPENING_STOCK', name: 'Create Scheme' },
  { code: 'CREATE_PURCHASE_STOCK', name: 'Create Scheme' },
  { code: 'CREATE_TRANSFER_STOCK', name: 'Create Scheme' },

  { code: 'LIST_USER', name: 'List Users' },
  { code: 'LIST_ROLE', name: 'List Role' },
  { code: 'LIST_DESIGNATION', name: 'List Designation' },
  { code: 'LIST_DISTRIBUTOR', name: 'List Distributor' },
  { code: 'LIST_PRODUCT_CATEGORY', name: 'List Category' },
  { code: 'LIST_PRODUCT_BRAND', name: 'List Brand' },
  { code: 'LIST_UOM', name: 'List UOM' },
  { code: 'LIST_RETAILER_CATEGORY', name: 'List Retailer Category' },
  { code: 'LIST_RETAILER_CHANNEL', name: 'List Retailer Channel' },
  { code: 'LIST_RETAILER', name: 'List Retailer' },
  { code: 'LIST_RETAILER_LEDGER', name: 'List Retailer' },
  { code: 'LIST_REGION', name: 'List Region' },
  { code: 'LIST_AREA', name: 'List Area' },
  { code: 'LIST_SALE_ORDER', name: 'List Sale Order' },
  { code: 'LIST_SALE_INVOICE', name: 'List Sale Invoice' },
  { code: 'LIST_SALE_RETURN', name: 'List Sale Return' },
  { code: 'LIST_SCHEME', name: 'List Scheme' },
  { code: 'LIST_ROUTE', name: 'List Scheme' },
  { code: 'LIST_ROUTE_SHARE', name: 'List Scheme' },
  { code: 'LIST_PJP', name: 'List Scheme' },
  { code: 'LIST_LOADSHEET', name: 'List Scheme' },
  { code: 'LIST_OPENING_STOCK', name: 'List Scheme' },
  { code: 'LIST_PURCHASE_STOCK', name: 'List Scheme' },
  { code: 'LIST_TRANSFER_STOCK', name: 'List Scheme' },

  { code: 'UPDATE_USER', name: 'Update Users' },
  { code: 'UPDATE_ROLE', name: 'Update Role' },
  { code: 'UPDATE_DESIGNATION', name: 'Update Designation' },
  { code: 'UPDATE_DISTRIBUTOR', name: 'Update Distributor' },
  { code: 'UPDATE_PRODUCT_CATEGORY', name: 'Update Category' },
  { code: 'UPDATE_PRODUCT_PRICING', name: 'Update Pricing' },
  { code: 'UPDATE_PRODUCT_BRAND', name: 'Update Brand' },
  { code: 'UPDATE_UOM', name: 'Update UOM' },
  { code: 'UPDATE_RETAILER_CATEGORY', name: 'Update Retailer Category' },
  { code: 'UPDATE_RETAILER_CHANNEL', name: 'Update Retailer Channel' },
  { code: 'UPDATE_RETAILER', name: 'Update Retailer' },
  { code: 'UPDATE_REGION', name: 'Update Region' },
  { code: 'UPDATE_AREA', name: 'Update Area' },
  { code: 'UPDATE_SALE_ORDER', name: 'Update Sale Order' },
  { code: 'UPDATE_SALE_INVOICE', name: 'Update Sale Invoice' },
  { code: 'UPDATE_SALE_RETURN', name: 'Update Sale Return' },
  { code: 'Update_SCHEME', name: 'Update Scheme' },
  { code: 'UPDATE_ROUTE', name: 'Update Scheme' },
  { code: 'UPDATE_ROUTE_SHARE', name: 'Update Scheme' },
  { code: 'UPDATE_PJP', name: 'Update Scheme' },
  { code: 'UPDATE_LOADSHEET', name: 'Update Scheme' },
  { code: 'UPDATE_OPENING_STOCK', name: 'Update Scheme' },
  { code: 'UPDATE_PURCHASE_STOCK', name: 'Update Scheme' },
  { code: 'UPDATE_TRANSFER_STOCK', name: 'Update Scheme' },

  { code: 'VIEW_USER', name: 'View Users' },
  { code: 'VIEW_ROLE', name: 'View Role' },
  { code: 'VIEW_DESIGNATION', name: 'View Designation' },
  { code: 'VIEW_DISTRIBUTOR', name: 'View Distributor' },
  { code: 'VIEW_PRODUCT_CATEGORY', name: 'View Category' },
  { code: 'VIEW_PRODUCT_BRAND', name: 'View Brand' },
  { code: 'VIEW_UOM', name: 'View UOM' },
  { code: 'VIEW_RETAILER_CATEGORY', name: 'View Retailer Category' },
  { code: 'VIEW_RETAILER_CHANNEL', name: 'View Retailer Channel' },
  { code: 'VIEW_RETAILER', name: 'View Retailer' },
  { code: 'VIEW_REGION', name: 'View Region' },
  { code: 'VIEW_AREA', name: 'View Area' },
  { code: 'VIEW_SALE_ORDER', name: 'View Sale Order' },
  { code: 'VIEW_SALE_INVOICE', name: 'View Sale Invoice' },
  { code: 'VIEW_SALE_RETURN', name: 'View Sale Return' },
  { code: 'View_SCHEME', name: 'View Scheme' },
  { code: 'VIEW_ROUTE', name: 'View Scheme' },
  { code: 'VIEW_ROUTE_SHARE', name: 'View Scheme' },
  { code: 'VIEW_PJP', name: 'View Scheme' },
  { code: 'VIEW_LOADSHEET', name: 'View Scheme' },
  { code: 'VIEW_OPENING_STOCK', name: 'View Scheme' },
  { code: 'VIEW_PURCHASE_STOCK', name: 'View Scheme' },
  { code: 'VIEW_TRANSFER_STOCK', name: 'View Scheme' },

  { code: 'DELETE_USER', name: 'Delete Users' },
  { code: 'DELETE_ROLE', name: 'Delete Role' },
  { code: 'DELETE_DESIGNATION', name: 'Delete Designation' },
  { code: 'DELETE_PRODUCT_CATEGORY', name: 'Delete Category' },
  { code: 'DELETE_PRODUCT_BRAND', name: 'Delete Brand' },
  { code: 'DELETE_UOM', name: 'Delete UOM' },
  { code: 'DELETE_RETAILER_CATEGORY', name: 'Delete Retailer Category' },
  { code: 'DELETE_RETAILER_CHANNEL', name: 'Delete Retailer Channel' },
  { code: 'DELETE_RETAILER', name: 'Delete Retailer' },
  { code: 'DELETE_REGION', name: 'DELETE Region' },
  { code: 'DELETE_AREA', name: 'DELETE Area' },
  { code: 'DELETE_SALE_ORDER', name: 'DELETE Sale Order' },
  { code: 'DELETE_SALE_RETURN', name: 'DELETE Sale Return' },
  { code: 'DELETE_SCHEME', name: 'Delete Scheme' },
  { code: 'DELETE_ROUTE', name: 'DELETE Scheme' },
  { code: 'DELETE_ROUTE_SHARE', name: 'DELETE Scheme' },
  { code: 'DELETE_PJP', name: 'DELETE Scheme' },
  { code: 'DELETE_LOADSHEET', name: 'DELETE Scheme' },
  { code: 'DELETE_OPENING_STOCK', name: 'DELETE Scheme' },
  { code: 'DELETE_PURCHASE_STOCK', name: 'DELETE Scheme' },
  { code: 'DELETE_TRANSFER_STOCK', name: 'DELETE Scheme' },


  { code: 'TRANSFER_ROUTE', name: 'Transfer Route' },

  
];

export async function seedTenantPermissions(dataSource: DataSource) {
  const permissionRepo = dataSource.getRepository(Permission);

  console.log('🌱 Seeding tenant permissions...');

  for (const permissionData of TENANT_PERMISSIONS) {
    const code = permissionData.code.trim();
    const name = permissionData.name.trim();
    if (!code || !name) {
      continue;
    }

    const existing = await permissionRepo.findOne({
      where: { code },
    });

    if (!existing) {
      const permission = permissionRepo.create({
        code,
        name,
        isActive: true,
      });
      await permissionRepo.save(permission);
    } else {
      let shouldUpdate = false;
      if (existing.name !== name) {
        existing.name = name;
        shouldUpdate = true;
      }
      if (!existing.isActive) {
        existing.isActive = true;
        shouldUpdate = true;
      }
      if (shouldUpdate) {
        await permissionRepo.save(existing);
      }
      console.log(`⏭ Permission already exists: ${code}`);
    }
  }

  console.log('🌱 Tenant permission seeding completed.\n');
}
