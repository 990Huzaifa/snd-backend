import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Invoice, InvoiceItem, Status as InvoiceStatus } from 'src/master-db/entities/invoice.entity';
import { BillingCycle, Plan } from 'src/master-db/entities/plan.entity';
import { CollectionType, Status as SubscriptionStatus, Subscription } from 'src/master-db/entities/subscription.entity';
import { LessThanOrEqual, Repository } from 'typeorm';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private isRenewalCronRunning = false;

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  async getInvoices(page = 1, limit = 10) {
    const safePage = Number(page) > 0 ? Number(page) : 1;
    const safeLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (safePage - 1) * safeLimit;

    const [invoices, total] = await this.invoiceRepo.findAndCount({
      relations: ['tenant', 'subscription'],
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });

    return {
      data: invoices,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
      },
    };
  }

  // Runs hourly to generate renewal invoices for due subscriptions.
  @Cron(CronExpression.EVERY_10_SECONDS)
  async scheduleRenewalInvoices() {
    await this.processRenewalInvoices('hourly-cron');
  }

  // Test cron: runs every minute only when INVOICE_TEST_CRON_ENABLED=true.
  @Cron(CronExpression.EVERY_10_HOURS)
  async testInvoiceCronJob() {
    if (process.env.INVOICE_TEST_CRON_ENABLED !== 'true') {
      return;
    }
    console.log('Invoice test cron triggered');
    this.logger.log('Invoice test cron triggered');
    await this.processRenewalInvoices('test-cron');
  }

  async runInvoiceTestCronNow() {
    this.logger.log('Manual invoice test cron run started');
    await this.processRenewalInvoices('manual-test');
  }

  private async processRenewalInvoices(source: string) {
    if (this.isRenewalCronRunning) {
      this.logger.warn(`Invoice cron skipped (${source}): previous run still in progress`);
      return;
    }

    this.isRenewalCronRunning = true;
    const now = new Date();
    try {
      const dueSubscriptions = await this.subscriptionRepo.find({
        where: {
          status: SubscriptionStatus.ACTIVE,
          // expiresAt: LessThanOrEqual(now),
        },
        relations: ['tenant', 'plan', 'subscriptionAddons', 'subscriptionAddons.addon'],
      });

      let processedCount = 0;
      for (const subscription of dueSubscriptions) {
        try {
          await this.createRenewalInvoice(subscription);
          processedCount += 1;
        } catch (error) {
          this.logger.error(
            `Failed invoice generation for subscription ${subscription.id}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }

      this.logger.log(`Invoice cron finished (${source}): processed ${processedCount} subscriptions`);
    } finally {
      this.isRenewalCronRunning = false;
    }
  }

  private async createRenewalInvoice(subscription: Subscription) {
    const existingInvoice = await this.invoiceRepo.findOne({
      where: { subscription: { id: subscription.id } },
      relations: ['subscription'],
    });

    const subTotalAmount = this.calculateSubtotal(subscription.plan, subscription.subscriptionAddons ?? []);
    const taxAmount = 0;
    const totalAmount = subTotalAmount + taxAmount;

    const issueDate = new Date();
    const dueDate = this.addDays(issueDate, 7);

    const invoice = await this.invoiceRepo.save({
      id: existingInvoice?.id,
      tenant: subscription.tenant,
      subscription,
      status: InvoiceStatus.ISSUE,
      issueDate,
      dueDate,
      subTotalAmount,
      taxAmount,
      totalAmount,
    });

    const addonsCount = (subscription.subscriptionAddons ?? []).length;
    const itemName = addonsCount > 0
      ? `${subscription.plan.title} + ${addonsCount} addon(s)`
      : subscription.plan.title;

    const existingInvoiceItem = await this.invoiceItemRepo.findOne({
      where: { invoice: { id: invoice.id } },
      relations: ['invoice'],
    });

    await this.invoiceItemRepo.save({
      id: existingInvoiceItem?.id,
      invoice,
      name: itemName,
      quantity: 1,
      unitPrice: totalAmount,
      totalAmount,
    });

    subscription.expiresAt = this.nextRenewalDate(subscription.expiresAt, subscription.plan);
    await this.subscriptionRepo.save(subscription);
  }

  private calculateSubtotal(plan: Plan, addons: Subscription['subscriptionAddons']) {
    const planAmount = this.toAmount(plan.price);
    const addonsTotal = addons.reduce((sum, addon) => {
      return sum + this.toAmount(addon.addon.price) * addon.quantity;
    }, 0);
    return planAmount + addonsTotal;
  }

  private toAmount(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  private nextRenewalDate(currentDate: Date, plan: Plan) {
    const nextDate = new Date(currentDate);
    if (plan.billing_cycle === BillingCycle.YEARLY) {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      return nextDate;
    }

    nextDate.setMonth(nextDate.getMonth() + 1);
    return nextDate;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
}
