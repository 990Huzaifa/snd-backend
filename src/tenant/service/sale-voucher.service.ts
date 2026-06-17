import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { S3Service } from 'src/common/s3/s3.service';
import { RefType, Retailer } from 'src/tenant-db/entities/retailer.entity';
import {
  PaymentMethod,
  SaleVoucher,
  SaleVoucherStatus,
} from 'src/tenant-db/entities/sale-voucher.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { ActivityLogService } from './activity-log.service';
import { RetailerLedgerService } from './retailer/retailer-ledger.service';
import { CreateSaleVoucherDto } from '../dto/sale-voucher/create-sale-voucher.dto';
import { UpdateSaleVoucherDto } from '../dto/sale-voucher/update-sale-voucher.dto';
import { UpdateSaleVoucherStatusDto } from '../dto/sale-voucher/update-sale-voucher-status.dto';
import {
  PAYMENT_PROOF_ALLOWED_MIME_TYPES,
  PAYMENT_PROOF_MAX_BYTES,
} from '../config/sale-voucher-payment-proof.multer';

@Injectable()
export class SaleVoucherService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly retailerLedgerService: RetailerLedgerService,
    private readonly s3Service: S3Service,
  ) {}

  private normalizePage(value: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  private normalizeLimit(value: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) {
      return 10;
    }
    return Math.min(Math.floor(n), 100);
  }

  private assertChequeFields(dto: {
    paymentMethod: PaymentMethod;
    chequeNumber?: string;
    chequeDate?: string;
    bankName?: string;
  }) {
    if (dto.paymentMethod !== PaymentMethod.CHEQUE) {
      return;
    }
    const missing: string[] = [];
    if (!dto.chequeNumber?.trim()) {
      missing.push('chequeNumber');
    }
    if (!dto.chequeDate?.trim()) {
      missing.push('chequeDate');
    }
    if (!dto.bankName?.trim()) {
      missing.push('bankName');
    }
    if (missing.length) {
      throw new BadRequestException(
        `Cheque payment requires: ${missing.join(', ')}`,
      );
    }
  }

  private async nextVoucherNumberWithManager(
    manager: EntityManager,
  ): Promise<string> {
    const repo = manager.getRepository(SaleVoucher);
    for (let attempt = 0; attempt < 8; attempt++) {
      const voucherNumber = `SV-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
      const exists = await repo.exist({ where: { voucherNumber } });
      if (!exists) {
        return voucherNumber;
      }
    }
    throw new BadRequestException('Could not allocate a unique voucher number');
  }

  private parseRetailerIds(raw?: string): string[] | undefined {
    if (raw === undefined || raw === null) {
      return undefined;
    }
    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.length ? ids : undefined;
  }

  private parseOptionalDayBoundary(iso?: string): Date | undefined {
    if (!iso?.trim()) {
      return undefined;
    }
    const d = new Date(iso.trim());
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${iso}`);
    }
    return d;
  }

  private parseOptionalSaleVoucherStatus(
    raw?: string,
  ): SaleVoucherStatus | undefined {
    const s = raw?.trim();
    if (!s) {
      return undefined;
    }
    const allowed = Object.values(SaleVoucherStatus) as string[];
    if (!allowed.includes(s)) {
      throw new BadRequestException(
        `Invalid status filter (use one of: ${allowed.join(', ')})`,
      );
    }
    return s as SaleVoucherStatus;
  }

  /** Ledger row exists once `executedBy` is set (paired with `executedDate`). */
  private isPaymentPosted(voucher: SaleVoucher): boolean {
    return voucher.executedBy != null;
  }

  private isEditable(voucher: SaleVoucher): boolean {
    return (
      voucher.status !== SaleVoucherStatus.PAID &&
      voucher.status !== SaleVoucherStatus.CANCELLED &&
      !this.isPaymentPosted(voucher)
    );
  }

  private assertPaymentProofFile(file: Express.Multer.File) {
    if (
      !PAYMENT_PROOF_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof PAYMENT_PROOF_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        'paymentProof must be a PNG or JPEG image (png, jpg, jpeg)',
      );
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('paymentProof file is empty');
    }
    if (file.size > PAYMENT_PROOF_MAX_BYTES) {
      throw new BadRequestException(
        `paymentProof must not exceed ${PAYMENT_PROOF_MAX_BYTES} bytes`,
      );
    }
  }

  private paymentProofExtension(mimetype: string): string {
    if (mimetype === 'image/png') {
      return 'png';
    }
    if (mimetype === 'image/jpeg') {
      return 'jpg';
    }
    throw new BadRequestException(
      'paymentProof must be a PNG or JPEG image (png, jpg, jpeg)',
    );
  }

  private paymentProofUrlToS3Key(url: string | null | undefined): string | null {
    const trimmed = url?.trim();
    if (!trimmed) {
      return null;
    }
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) {
      return null;
    }
    const region = process.env.AWS_REGION || 'ap-south-1';
    const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`;
    if (!trimmed.startsWith(prefix)) {
      return null;
    }
    return trimmed.slice(prefix.length);
  }

  private async uploadPaymentProof(
    tenantCode: string,
    voucherId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    this.assertPaymentProofFile(file);
    const extension = this.paymentProofExtension(file.mimetype);
    const key = `tenants/${tenantCode}/sale-vouchers/payment-proofs/${voucherId}.${extension}`;
    const { url } = await this.s3Service.uploadObject(
      key,
      file.buffer,
      file.mimetype,
    );
    return url;
  }

  private async replacePaymentProof(
    tenantCode: string,
    voucherId: string,
    file: Express.Multer.File,
    existingUrl?: string | null,
  ): Promise<string> {
    const url = await this.uploadPaymentProof(tenantCode, voucherId, file);
    const oldKey = this.paymentProofUrlToS3Key(existingUrl);
    const newKey = this.paymentProofUrlToS3Key(url);
    if (oldKey && oldKey !== newKey) {
      await this.s3Service.deleteObject(oldKey).catch(() => undefined);
    }
    return url;
  }

  /**
   * Posts a PAYMENT credit to the retailer ledger and stamps execution on the voucher.
   * Idempotent when `executedBy` is already set. Caller sets `voucher.status` to PAID before calling when applicable.
   */
  private async recordVoucherPaymentInLedger(
    manager: EntityManager,
    voucher: SaleVoucher,
    actorUserId: string,
  ): Promise<void> {
    if (this.isPaymentPosted(voucher)) {
      return;
    }

    const amount = Number(voucher.paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid payment amount for ledger posting');
    }

    await this.retailerLedgerService.createCreditEntry(manager, {
      retailerId: voucher.retailerId,
      refType: RefType.PAYMENT,
      amount,
    });

    voucher.executedBy = actorUserId;
    voucher.executedDate = new Date();
  }

  async create(
    tenantDb: DataSource,
    tenantCode: string,
    dto: CreateSaleVoucherDto,
    user: { userId: string },
    paymentProof?: Express.Multer.File,
  ) {
    this.assertChequeFields(dto);

    await this.ensureUser(tenantDb, user.userId);

    const initialStatus = dto.status ?? SaleVoucherStatus.PENDING;

    const created = await tenantDb.transaction(async (manager) => {
      const retailer = await manager.getRepository(Retailer).findOne({
        where: { id: dto.retailerId },
        select: ['id'],
      });
      if (!retailer) {
        throw new NotFoundException('Retailer not found');
      }

      const voucherNumber = await this.nextVoucherNumberWithManager(
        manager,
      );
      const repo = manager.getRepository(SaleVoucher);

      const entity = repo.create({
        voucherNumber,
        retailerId: dto.retailerId,
        status: initialStatus,
        paymentMethod: dto.paymentMethod,
        chequeNumber:
          dto.paymentMethod === PaymentMethod.CHEQUE
            ? dto.chequeNumber!.trim()
            : null,
        chequeDate:
          dto.paymentMethod === PaymentMethod.CHEQUE
            ? new Date(dto.chequeDate!)
            : null,
        bankName:
          dto.paymentMethod === PaymentMethod.CHEQUE
            ? dto.bankName!.trim()
            : null,
        paymentDate: new Date(dto.paymentDate),
        paymentAmount: dto.paymentAmount,
        remarks: dto.remarks?.trim() ?? null,
        createdBy: user.userId,
      });

      const saved = await repo.save(entity);

      if (paymentProof) {
        saved.paymentProof = await this.uploadPaymentProof(
          tenantCode,
          saved.id,
          paymentProof,
        );
        await repo.save(saved);
      }

      if (initialStatus === SaleVoucherStatus.PAID) {
        await this.recordVoucherPaymentInLedger(manager, saved, user.userId);
        await repo.save(saved);
      }

      return { id: saved.id, voucherNumber: saved.voucherNumber };
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_VOUCHER_CREATED',
      description: 'Sale voucher created',
      metadata: {
        id: created.id,
        voucherNumber: created.voucherNumber,
        paid: initialStatus === SaleVoucherStatus.PAID,
      },
    });

    return this.view(tenantDb, created.id, user, { recordActivityLog: false });
  }

  async view(
    tenantDb: DataSource,
    id: string,
    user: { userId: string },
    options?: { recordActivityLog?: boolean },
  ) {
    const recordActivityLog = options?.recordActivityLog !== false;

    const voucher = await tenantDb.getRepository(SaleVoucher).findOne({
      where: { id },
      relations: [
        'retailer',
        'createdByUser',
        'executedByUser',
      ],
    });

    if (!voucher) {
      throw new NotFoundException('Sale voucher not found');
    }

    if (recordActivityLog) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'SALE_VOUCHER_VIEWED',
        description: 'Sale voucher viewed',
        metadata: { id },
      });
    }

    return voucher;
  }

  async edit(
    tenantDb: DataSource,
    tenantCode: string,
    id: string,
    dto: UpdateSaleVoucherDto,
    user: { userId: string },
    paymentProof?: Express.Multer.File,
  ) {
    const repo = tenantDb.getRepository(SaleVoucher);
    const voucher = await repo.findOne({ where: { id } });

    if (!voucher) {
      throw new NotFoundException('Sale voucher not found');
    }

    if (!this.isEditable(voucher)) {
      throw new BadRequestException(
        'Sale voucher can only be edited while it is pending or partially paid, and before it is marked paid',
      );
    }

    const nextRetailerId = dto.retailerId ?? voucher.retailerId;
    const nextPaymentMethod = dto.paymentMethod ?? voucher.paymentMethod;
    const nextChequeNumber =
      dto.chequeNumber !== undefined
        ? dto.chequeNumber
        : (voucher.chequeNumber ?? undefined);
    const nextChequeDate =
      dto.chequeDate !== undefined
        ? dto.chequeDate
        : voucher.chequeDate != null
          ? voucher.chequeDate.toISOString()
          : undefined;
    const nextBankName =
      dto.bankName !== undefined
        ? dto.bankName
        : (voucher.bankName ?? undefined);
    const nextPaymentDate =
      dto.paymentDate !== undefined
        ? dto.paymentDate
        : voucher.paymentDate.toISOString();

    this.assertChequeFields({
      paymentMethod: nextPaymentMethod,
      chequeNumber: nextChequeNumber,
      chequeDate: nextChequeDate,
      bankName: nextBankName,
    });

    if (dto.retailerId && dto.retailerId !== voucher.retailerId) {
      const retailer = await tenantDb.getRepository(Retailer).findOne({
        where: { id: dto.retailerId },
        select: ['id'],
      });
      if (!retailer) {
        throw new NotFoundException('Retailer not found');
      }
    }

    voucher.retailerId = nextRetailerId;
    voucher.paymentMethod = nextPaymentMethod;
    if (nextPaymentMethod === PaymentMethod.CHEQUE) {
      voucher.chequeNumber = nextChequeNumber!.trim();
      voucher.chequeDate = new Date(nextChequeDate!);
      voucher.bankName = nextBankName!.trim();
    } else {
      voucher.chequeNumber = null;
      voucher.chequeDate = null;
      voucher.bankName = null;
    }
    voucher.paymentDate = new Date(nextPaymentDate);
    if (dto.paymentAmount !== undefined) {
      voucher.paymentAmount = dto.paymentAmount;
    }
    if (dto.remarks !== undefined) {
      voucher.remarks = dto.remarks?.trim() ?? null;
    }
    if (paymentProof) {
      voucher.paymentProof = await this.replacePaymentProof(
        tenantCode,
        voucher.id,
        paymentProof,
        voucher.paymentProof,
      );
    }

    await repo.save(voucher);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_VOUCHER_UPDATED',
      description: 'Sale voucher updated',
      metadata: { id },
    });

    return this.view(tenantDb, id, user, { recordActivityLog: false });
  }

  async updateStatus(
    tenantDb: DataSource,
    id: string,
    dto: UpdateSaleVoucherStatusDto,
    user: { userId: string },
  ) {
    await this.ensureUser(tenantDb, user.userId);

    const outcome = await tenantDb.transaction(
      async (manager): Promise<'noop' | 'updated'> => {
        const repo = manager.getRepository(SaleVoucher);
        const voucher = await repo.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!voucher) {
          throw new NotFoundException('Sale voucher not found');
        }

        if (
          this.isPaymentPosted(voucher) &&
          dto.status !== SaleVoucherStatus.PAID
        ) {
          throw new BadRequestException(
            'Cannot change status once the voucher payment has been posted to the retailer ledger',
          );
        }

        if (
          voucher.status === SaleVoucherStatus.PAID &&
          dto.status !== SaleVoucherStatus.PAID
        ) {
          throw new BadRequestException(
            'Cannot change status once the voucher is marked paid',
          );
        }

        const needsLedgerPost =
          dto.status === SaleVoucherStatus.PAID &&
          !this.isPaymentPosted(voucher);
        const isNoop =
          dto.status === voucher.status && !needsLedgerPost;

        if (isNoop) {
          return 'noop';
        }

        if (dto.status === SaleVoucherStatus.PAID) {
          voucher.status = SaleVoucherStatus.PAID;
          await this.recordVoucherPaymentInLedger(manager, voucher, user.userId);
        } else {
          voucher.status = dto.status;
        }

        await repo.save(voucher);
        return 'updated';
      },
    );

    if (outcome === 'updated') {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'SALE_VOUCHER_STATUS_UPDATED',
        description: 'Sale voucher status updated',
        metadata: { id, status: dto.status },
      });
    }

    return this.view(tenantDb, id, user, { recordActivityLog: false });
  }

  async list(
    tenantDb: DataSource,
    pageInput: number,
    limitInput: number,
    filters: {
      retailerIds?: string;
      shopName?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
    },
    user: { userId: string },
  ) {
    const page = this.normalizePage(pageInput);
    const limit = this.normalizeLimit(limitInput);
    const retailerIds = this.parseRetailerIds(filters.retailerIds);
    const dateFrom = this.parseOptionalDayBoundary(filters.dateFrom);
    const dateTo = this.parseOptionalDayBoundary(filters.dateTo);
    const statusFilter = this.parseOptionalSaleVoucherStatus(filters.status);

    const qb = tenantDb
      .getRepository(SaleVoucher)
      .createQueryBuilder('sv')
      .innerJoinAndSelect('sv.retailer', 'r');

    if (statusFilter) {
      qb.andWhere('sv.status = :status', { status: statusFilter });
    }

    if (retailerIds?.length) {
      qb.andWhere('sv."retailerId" IN (:...retailerIds)', { retailerIds });
    }

    const shop = (filters.shopName ?? '').trim();
    if (shop) {
      qb.andWhere('r."shopName" ILIKE :shopName', { shopName: `%${shop}%` });
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    if (dateFrom) {
      qb.andWhere('sv."paymentDate" >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('sv."paymentDate" <= :dateTo', { dateTo: end });
    }

    const total = await qb.clone().getCount();

    const rows = await qb
      .clone()
      .orderBy('sv.paymentDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SALE_VOUCHER_LISTED',
      description: 'Sale vouchers listed',
      metadata: { total, page, limit, filters },
    });

    return {
      result: rows,
      meta: { total, page, limit },
    };
  }

  private async ensureUser(tenantDb: DataSource, userId: string) {
    const exists = await tenantDb.getRepository(User).findOne({
      where: { id: userId },
      select: ['id'],
    });
    if (!exists) {
      throw new NotFoundException('User not found');
    }
  }
}
