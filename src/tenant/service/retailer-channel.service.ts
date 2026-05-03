import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { Retailer, RetailerChannel } from 'src/tenant-db/entities/retailer.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateRetailerChannelDto } from '../dto/retailer-channel/create-retailer-channel.dto';

@Injectable()
export class RetailerChannelService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private normalize(value: string): string {
    return value.trim();
  }

  async create(tenantDb: DataSource, dto: CreateRetailerChannelDto, user: any) {
    const name = this.normalize(dto.name);

    const existing = await tenantDb.getRepository(RetailerChannel).findOne({
      where: { name },
    });
    if (existing) {
      throw new ConflictException('Retailer channel with this name already exists');
    }

    const channel = tenantDb.getRepository(RetailerChannel).create({ name });
    const created = await tenantDb.getRepository(RetailerChannel).save(channel);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHANNEL_CREATED',
      description: `Retailer channel ${created.name} created`,
      metadata: { retailerChannelId: created.id },
    });

    return created;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [channels, total] = await tenantDb.getRepository(RetailerChannel).findAndCount({
      where: { name: Like(`%${search}%`) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHANNEL_LISTED',
      description: 'Retailer channels listed',
      metadata: { total, page, limit },
    });

    return { result: channels, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const channel = await tenantDb.getRepository(RetailerChannel).findOne({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Retailer channel not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHANNEL_VIEWED',
      description: `Retailer channel ${channel.name} viewed`,
      metadata: { retailerChannelId: channel.id },
    });

    return channel;
  }

  async delete(tenantDb: DataSource, id: string, user: any) {
    const channelRepo = tenantDb.getRepository(RetailerChannel);
    const retailerRepo = tenantDb.getRepository(Retailer);

    const channel = await channelRepo.findOne({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Retailer channel not found');
    }

    const inUseCount = await retailerRepo.count({
      where: { retailerChannelId: channel.id },
    });

    if (inUseCount > 0) {
      throw new ConflictException('Retailer channel is in use by retailers and cannot be deleted');
    }

    await channelRepo.remove(channel);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'RETAILER_CHANNEL_DELETED',
      description: `Retailer channel ${channel.name} deleted`,
      metadata: { retailerChannelId: channel.id },
    });

    return { message: 'Retailer channel deleted successfully' };
  }
}
