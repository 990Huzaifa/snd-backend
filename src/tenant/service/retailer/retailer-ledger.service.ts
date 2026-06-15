import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RefType, Retailer, RetailerLedger } from 'src/tenant-db/entities/retailer.entity';

type LedgerEntryInput = {
  retailerId: string;
  refType: RefType;
  amount: number;
  entryType: 'DEBIT' | 'CREDIT';
};

@Injectable()
export class RetailerLedgerService {
  private normalizeAmount(amount: number): string {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('Ledger amount must be greater than 0');
    }
    return n.toFixed(2);
  }

  private async ensureRetailer(manager: EntityManager, retailerId: string) {
    const retailer = await manager.getRepository(Retailer).findOne({
      where: { id: retailerId },
      select: ['id'],
    });
    if (!retailer) {
      throw new BadRequestException('Retailer not found for ledger entry');
    }
  }

  private parseAmount(value: string | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private async getPreviousBalance(
    manager: EntityManager,
    retailerId: string,
  ): Promise<number> {
    const lastEntry = await manager.getRepository(RetailerLedger).findOne({
      where: { retailerId },
      order: { createdAt: 'DESC' },
      select: ['id', 'currentBalance'],
    });
    return this.parseAmount(lastEntry?.currentBalance);
  }

  async postEntry(manager: EntityManager, input: LedgerEntryInput) {
    await this.ensureRetailer(manager, input.retailerId);
    const amount = this.normalizeAmount(input.amount);
    const previousBalance = await this.getPreviousBalance(manager, input.retailerId);
    const numericAmount = Number(amount);
    const currentBalance =
      input.entryType === 'DEBIT'
        ? previousBalance + numericAmount
        : previousBalance - numericAmount;

    const repo = manager.getRepository(RetailerLedger);

    return repo.save(
      repo.create({
        retailerId: input.retailerId,
        refType: input.refType,
        credit: input.entryType === 'CREDIT' ? amount : null,
        debit: input.entryType === 'DEBIT' ? amount : null,
        currentBalance: currentBalance.toFixed(2),
      }),
    );
  }

  async createDebitEntry(
    manager: EntityManager,
    input: Omit<LedgerEntryInput, 'entryType'>,
  ) {
    return this.postEntry(manager, { ...input, entryType: 'DEBIT' });
  }

  async createCreditEntry(
    manager: EntityManager,
    input: Omit<LedgerEntryInput, 'entryType'>,
  ) {
    return this.postEntry(manager, { ...input, entryType: 'CREDIT' });
  }

  async getOpeningBalance(
    manager: EntityManager,
    retailerId: string,
  ): Promise<number> {
    const lastEntry = await manager.getRepository(RetailerLedger).findOne({
      where: { retailerId, refType: RefType.OPENING_BALANCE },
      order: { createdAt: 'DESC' },
      select: ['id', 'credit','createdAt'],
    });
    return this.parseAmount(lastEntry?.credit);
  }

  async getClosingBalance(
    manager: EntityManager,
    retailerId: string,
  ): Promise<number> {
    const lastEntry = await manager.getRepository(RetailerLedger).findOne({
      where: { retailerId },
      order: { createdAt: 'ASC' },
      select: ['id', 'currentBalance','createdAt'],
    });
    return this.parseAmount(lastEntry?.currentBalance);
  }
}
