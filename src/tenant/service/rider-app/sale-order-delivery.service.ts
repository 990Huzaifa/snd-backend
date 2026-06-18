import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OrderStatus, SaleOrder } from 'src/tenant-db/entities/saleorder.entity';
import { SaleInvoiceService } from '../sale-invoice.service';

@Injectable()
export class RiderSaleOrderDeliveryService {
  constructor(private readonly saleInvoiceService: SaleInvoiceService) {}

  async markDeliveredAndCreateInvoice(
    manager: EntityManager,
    input: {
      saleOrderId: string;
      deliveredDate: Date;
      actorUserId: string;
    },
  ): Promise<{ order: SaleOrder; invoiceId?: string }> {
    const orderRepo = manager.getRepository(SaleOrder);
    const order = await orderRepo.findOne({
      where: { id: input.saleOrderId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    if (order.orderStatus === OrderStatus.DELIVERED) {
      const invoice = await this.saleInvoiceService.createFromSaleOrder(
        manager,
        order.id,
        input.actorUserId,
      );
      return { order, invoiceId: invoice.id };
    }

    if (
      order.orderStatus === OrderStatus.CANCELLED ||
      order.orderStatus === OrderStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot deliver sale order in ${order.orderStatus} status`,
      );
    }

    if (
      order.orderStatus !== OrderStatus.APPROVED &&
      order.orderStatus !== OrderStatus.PROCESSING
    ) {
      throw new BadRequestException(
        'Sale order must be APPROVED or PROCESSING before delivery',
      );
    }

    order.orderStatus = OrderStatus.DELIVERED;
    order.deliveredDate = input.deliveredDate;
    await orderRepo.save(order);

    const invoice = await this.saleInvoiceService.createFromSaleOrder(
      manager,
      order.id,
      input.actorUserId,
    );

    return { order, invoiceId: invoice.id };
  }
}
