import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import { Invoice, InvoiceItem, Status as InvoiceStatus } from 'src/master-db/entities/invoice.entity';
import { BillingCycle, Plan } from 'src/master-db/entities/plan.entity';
import { CollectionType, Status as SubscriptionStatus, Subscription } from 'src/master-db/entities/subscription.entity';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ActivityLogService } from './activity-log.service';

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
    private readonly activityLogService: ActivityLogService,
  ) {}


  private async recordAction(action: string, description: string, actorId:string , metadata?: Record<string, any> ) {
    await this.activityLogService.recordActivityLog({
        actorType: ActivityLogActorType.PLATFORM_USER,
        actorId: actorId,
        action,
        description,
        metadata: metadata ?? null,
    });
}


  async getInvoices(page = 1, limit = 10, user: any) {
    const safePage = Number(page) > 0 ? Number(page) : 1;
    const safeLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (safePage - 1) * safeLimit;

    const [invoices, total] = await this.invoiceRepo.findAndCount({
      relations: ['tenant', 'subscription'],
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });

    await this.recordAction('INVOICE_LIST', 'Invoice list fetched', user.id, { page, limit, total });

    return {
      data: invoices,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
      },
    };
  }

  async getInvoiceById(id: number, user: any) {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['tenant', 'invoiceItems'],
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    await this.recordAction('INVOICE_SHOW', 'Invoice details fetched', user.id, { invoiceId: id });
    return {
      message: 'Invoice details fetched',
      invoice: invoice,
    };
  }

  // Runs hourly to generate renewal invoices for due subscriptions.
  @Cron(CronExpression.EVERY_12_HOURS)
  async scheduleRenewalInvoices() {
    await this.processRenewalInvoices('hourly-cron');
  }

  // Test cron: runs every minute only when INVOICE_TEST_CRON_ENABLED=true.
  @Cron(CronExpression.EVERY_MINUTE)
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
          collectionType: CollectionType.AUTO,
          expiresAt: LessThanOrEqual(now),
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
    const lineItems = this.buildInvoiceLineItems(subscription);
    const subTotalAmount = lineItems.reduce((sum, item) => sum + item.totalAmount, 0);
    const taxAmount = 0;
    const totalAmount = subTotalAmount + taxAmount;

    const issueDate = new Date();
    const dueDate = this.addDays(issueDate, 7);

    const invoice = await this.invoiceRepo.save({
      tenant: subscription.tenant,
      subscription,
      status: InvoiceStatus.ISSUE,
      issueDate,
      dueDate,
      subTotalAmount,
      taxAmount,
      totalAmount,
    });

    await this.invoiceItemRepo.save(
      lineItems.map((item) =>
        this.invoiceItemRepo.create({
          invoice,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
        }),
      ),
    );

    subscription.expiresAt = this.nextRenewalDate(subscription.expiresAt, subscription.plan);
    await this.subscriptionRepo.save(subscription);
  }

  private buildInvoiceLineItems(subscription: Subscription) {
    const items = [
      {
        name: subscription.plan.title,
        quantity: 1,
        unitPrice: this.toAmount(subscription.plan.price),
        totalAmount: this.toAmount(subscription.plan.price),
      },
    ];

    for (const addon of subscription.subscriptionAddons ?? []) {
      const quantity = addon.quantity > 0 ? addon.quantity : 1;
      const unitPrice = this.toAmount(addon.addon.price);
      items.push({
        name: addon.addon.name,
        quantity,
        unitPrice,
        totalAmount: unitPrice * quantity,
      });
    }

    return items;
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
