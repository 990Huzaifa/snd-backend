import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { OpeningStockService } from '../service/opening-stock.service';
import { CreateOpeningStockDto } from '../dto/opening-stock/create-opening-stock.dto';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Controller('tenant/opening-stocks')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class OpeningStockController {
  constructor(private readonly openingStockService: OpeningStockService) {}

  @Post('create')
  @RequirePermissions('CREATE_OPENING_STOCK')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateOpeningStockDto,
    @Req() req: Request,
  ) {
    return this.openingStockService.create(tenantDb, dto, req.user as { userId: string });
  }

  @Get()
  @RequirePermissions('LIST_OPENING_STOCK')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.openingStockService.list(
      tenantDb,
      page,
      limit,
      search,
      req.user as { userId: string },
    );
  }

  @Get(':id/page')
  @RequirePermissions('VIEW_OPENING_STOCK')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async detailPage(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.openingStockService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
    const rows = data.items
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.product?.name ?? '')}</td>
          <td>${escapeHtml(row.product?.skuCode ?? '')}</td>
          <td>${escapeHtml(row.flavour?.name ?? '')}</td>
          <td>${escapeHtml(row.pricing?.uom?.name ?? '')}</td>
          <td>${escapeHtml(row.pricing?.tradePrice ?? '')}</td>
          <td style="text-align:right">${row.quantity}</td>
        </tr>`,
      )
      .join('\n');

    const title = escapeHtml(data.distributor?.name ?? 'Opening stock');
    const createdBy = data.createdBy?.name ? escapeHtml(data.createdBy.name) : '—';
    const distributor = data.distributor?.name ? escapeHtml(data.distributor.name) : '—';
    const remarks = escapeHtml(data.remarks ?? '');
    const stockDate =
      data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Opening stock</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; max-width: 960px; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Opening stock</h1>
  <div class="meta">
    <div><strong>Distributor:</strong> ${distributor}</div>
    <div><strong>Date:</strong> ${stockDate}</div>
    <div><strong>Remarks:</strong> ${remarks}</div>
    <div><strong>Total products:</strong> ${data.totalProducts} &nbsp;|&nbsp; <strong>Total quantity:</strong> ${data.totalQuantity}</div>
    <div><strong>Created by:</strong> ${createdBy}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>SKU</th>
        <th>Flavour</th>
        <th>UOM</th>
        <th>Trade price</th>
        <th style="text-align:right">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
  }

  @Get(':id')
  @RequirePermissions('VIEW_OPENING_STOCK')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.openingStockService.view(
      tenantDb,
      id,
      req.user as { userId: string },
    );
  }
}
