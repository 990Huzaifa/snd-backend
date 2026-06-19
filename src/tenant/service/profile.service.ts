import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/tenant-db/entities/user.entity';
import { ChangeProfilePasswordDto } from '../dto/profile/change-profile-password.dto';
import { ActivityLogService } from './activity-log.service';
import { MasterGeoHelperService } from './master-geo-helper.service';

const PROFILE_RELATIONS = [
  'role',
  'designation',
  'notifications',
  'assignedDistributors',
  'assignedDistributors.distributor',
  'attendences',
  'saleOrders',
  'executedSaleVouchers',
  'createdSaleVouchers',
  'executedSaleOrders',
] as const;

@Injectable()
export class ProfileService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
  ) {}

  async getProfile(tenantDb: DataSource, userId: string) {
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: userId },
      relations: [...PROFILE_RELATIONS],
    });

    if (!user || user.isDeleted) {
      throw new NotFoundException('User not found');
    }

    const [countryName, stateName, cityName] = await Promise.all([
      this.masterGeoHelperService.getCountryNameById(user.countryId),
      this.masterGeoHelperService.getStateNameById(user.stateId),
      this.masterGeoHelperService.getCityNameById(user.cityId),
    ]);

    delete user.password;

    return {
      ...user,
      countryName,
      stateName,
      cityName,
    };
  }

  async changePassword(
    tenantDb: DataSource,
    userId: string,
    dto: ChangeProfilePasswordDto,
  ) {
    const userRepo = tenantDb.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'password', 'isActive', 'isDeleted'],
    });

    if (!user || user.isDeleted) {
      throw new NotFoundException('User not found');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    user.password = await bcrypt.hash(dto.password, 10);
    await userRepo.save(user);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.id,
      action: 'USER_PASSWORD_CHANGED',
      description: `Password changed for ${user.email}`,
      metadata: { userId: user.id },
    });

    return { message: 'Password changed successfully' };
  }
}
