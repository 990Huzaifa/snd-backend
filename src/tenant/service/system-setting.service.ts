import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SystemSetting,
  WeekDay,
} from 'src/tenant-db/entities/system-setting.entity';
import { ActivityLogService } from './activity-log.service';
import { UpdateSystemSettingDto } from '../dto/system-setting/update-system-setting.dto';

const DEFAULT_SETTINGS: Partial<SystemSetting> = {
  defaultShopRadius: '0.5',
  workingHoursPerDay: 8,
  workingDaysPerWeek: 5,
  autoCheckoutTime: '18:00',
  weeklyHolidays: [WeekDay.SATURDAY, WeekDay.SUNDAY],
};

@Injectable()
export class SystemSettingService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  /** Returns existing settings or creates the default row (no activity log). */
  async ensure(tenantDb: DataSource): Promise<SystemSetting> {
    return this.getOrCreate(tenantDb);
  }

  async get(tenantDb: DataSource, user: any) {
    const settings = await this.ensure(tenantDb);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SYSTEM_SETTING_VIEWED',
      description: 'System settings viewed',
      metadata: { systemSettingId: settings.id },
    });

    return settings;
  }

  async update(tenantDb: DataSource, dto: UpdateSystemSettingDto, user: any) {
    const settings = await this.ensure(tenantDb);

    if (dto.defaultShopRadius !== undefined) {
      const radius = dto.defaultShopRadius.trim();
      if (!radius || Number(radius) <= 0) {
        throw new BadRequestException('defaultShopRadius must be greater than 0');
      }
      settings.defaultShopRadius = radius;
    }

    if (dto.workingHoursPerDay !== undefined) {
      settings.workingHoursPerDay = dto.workingHoursPerDay;
    }

    if (dto.workingDaysPerWeek !== undefined) {
      settings.workingDaysPerWeek = dto.workingDaysPerWeek;
    }

    if (dto.autoCheckoutTime !== undefined) {
      settings.autoCheckoutTime = dto.autoCheckoutTime;
    }

    if (dto.weeklyHolidays !== undefined) {
      settings.weeklyHolidays = dto.weeklyHolidays;
      // Keep working-days count aligned when holidays are set and days not explicitly sent.
      if (dto.workingDaysPerWeek === undefined) {
        settings.workingDaysPerWeek = Math.max(
          1,
          7 - dto.weeklyHolidays.length,
        );
      }
    }

    if (settings.workingDaysPerWeek + settings.weeklyHolidays.length > 7) {
      throw new BadRequestException(
        'workingDaysPerWeek and weeklyHolidays cannot exceed 7 days combined',
      );
    }

    const saved = await tenantDb.getRepository(SystemSetting).save(settings);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'SYSTEM_SETTING_UPDATED',
      description: 'System settings updated',
      metadata: { systemSettingId: saved.id, ...dto },
    });

    return {
      message: 'System settings updated successfully',
      settings: saved,
    };
  }

  private async getOrCreate(tenantDb: DataSource): Promise<SystemSetting> {
    const repo = tenantDb.getRepository(SystemSetting);
    const existing = await repo.find({
      order: { id: 'ASC' },
      take: 1,
    });

    if (existing[0]) {
      return existing[0];
    }

    return repo.save(repo.create(DEFAULT_SETTINGS));
  }
}
