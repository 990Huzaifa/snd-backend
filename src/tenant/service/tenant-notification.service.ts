import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification } from 'src/tenant-db/entities/notification.entity';
import { DataSource } from 'typeorm';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class TenantNotificationService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getUserNotifications(tenantDb: DataSource, userId: string) {
    const notifications = await tenantDb.getRepository(Notification).find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return { result: notifications };
  }

  async markAsRead(tenantDb: DataSource, notificationId: string, userId: string) {
    const notificationRepo = tenantDb.getRepository(Notification);
    const notification = await notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    const updatedNotification = await notificationRepo.save(notification);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      action: 'NOTIFICATION_READ',
      description: `Notification ${updatedNotification.id} marked as read`,
      metadata: { notificationId: updatedNotification.id },
    });

    return {
      message: 'Notification marked as read',
      result: updatedNotification,
    };
  }
}
