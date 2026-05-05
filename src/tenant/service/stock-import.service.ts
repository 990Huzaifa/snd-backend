import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { ImportStockDto } from '../dto/stock/import-stock.dto';
import { CreateOpeningStockDto } from '../dto/opening-stock/create-opening-stock.dto';
import { CreatePurchaseStockDto } from '../dto/purchase-stock/create-purchase-stock.dto';
import { OpeningStockService } from './opening-stock.service';
import { PurchaseStockService } from './purchase-stock.service';

type ParsedStockRow = {
  row: number;
  productId: string;
  productFlavourId: string;
  productPricingId: string;
  quantity: number;
};

@Injectable()
export class StockImportService {
  constructor(
    private readonly openingStockService: OpeningStockService,
    private readonly purchaseStockService: PurchaseStockService,
  ) {}

  private ensureCsvFile(file: Express.Multer.File): void {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || extension !== 'csv') {
      throw new BadRequestException('Only CSV files are supported');
    }
  }

  private findColumnIndex(headers: string[], acceptedNames: string[]): number {
    return headers.findIndex((header) => acceptedNames.includes(header));
  }

  private parseCsvRows(file: Express.Multer.File): ParsedStockRow[] {
    this.ensureCsvFile(file);

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('CSV file is empty');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });

    if (!rows.length) {
      throw new BadRequestException('CSV file is empty');
    }

    const headers = (rows[0] ?? []).map((value) => String(value ?? '').trim().toLowerCase());
    const productIdIndex = this.findColumnIndex(headers, ['productid', 'product_id']);
    const productFlavourIdIndex = this.findColumnIndex(headers, [
      'productflavourid',
      'product_flavour_id',
    ]);
    const productPricingIdIndex = this.findColumnIndex(headers, [
      'productpricingid',
      'product_pricing_id',
    ]);
    const quantityIndex = this.findColumnIndex(headers, ['quantity', 'qty']);

    if (
      productIdIndex < 0 ||
      productFlavourIdIndex < 0 ||
      productPricingIdIndex < 0 ||
      quantityIndex < 0
    ) {
      throw new BadRequestException(
        'CSV must contain headers: productId, productFlavourId, productPricingId, quantity',
      );
    }

    const parsedRows: ParsedStockRow[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] ?? [];
      const productId = String(row[productIdIndex] ?? '').trim();
      const productFlavourId = String(row[productFlavourIdIndex] ?? '').trim();
      const productPricingId = String(row[productPricingIdIndex] ?? '').trim();
      const quantityRaw = String(row[quantityIndex] ?? '').trim();

      if (!productId && !productFlavourId && !productPricingId && !quantityRaw) {
        continue;
      }

      const quantity = Number(quantityRaw);
      if (!productId || !productFlavourId || !productPricingId || !Number.isFinite(quantity)) {
        throw new BadRequestException(`Invalid data at CSV row ${i + 1}`);
      }

      if (quantity <= 0) {
        throw new BadRequestException(`Quantity must be greater than 0 at CSV row ${i + 1}`);
      }

      parsedRows.push({
        row: i + 1,
        productId,
        productFlavourId,
        productPricingId,
        quantity,
      });
    }

    if (!parsedRows.length) {
      throw new BadRequestException('No valid stock rows found in file');
    }

    return parsedRows;
  }

  async importStock(
    tenantDb: DataSource,
    dto: ImportStockDto,
    file: Express.Multer.File,
    user: { userId: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const parsedRows = this.parseCsvRows(file);
    if (dto.type === 'OPENING') {
      const payload: CreateOpeningStockDto = {
        distributorId: dto.distributorId,
        date: dto.date,
        remarks: `Imported via CSV: ${file.originalname}`,
        items: parsedRows.map((row) => ({
          productId: row.productId,
          productFlavourId: Number(row.productFlavourId),
          productPricingId: row.productPricingId,
          quantity: row.quantity,
        })),
      };
      return this.openingStockService.create(tenantDb, payload, user);
    }

    const payload: CreatePurchaseStockDto = {
      distributorId: dto.distributorId,
      date: dto.date,
      remarks: `Imported via CSV: ${file.originalname}`,
      items: parsedRows.map((row) => ({
        productId: row.productId,
        productFlavourId: Number(row.productFlavourId),
        productPricingId: row.productPricingId,
        quantity: row.quantity,
      })),
    };
    return this.purchaseStockService.create(tenantDb, payload, user);
  }
}
