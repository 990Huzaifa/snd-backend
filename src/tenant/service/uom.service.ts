import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { Uom } from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateUomDto } from '../dto/uom/create-uom.dto';
import { UpdateUomDto } from '../dto/uom/update-uom.dto';

@Injectable()
export class UomService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async create(tenantDb: DataSource, dto: CreateUomDto, user: any) {
    const name = dto.name.trim();
    const uomRepo = tenantDb.getRepository(Uom);

    const existingUom = await uomRepo.findOne({
      where: { name },
    });

    if (existingUom) {
      throw new ConflictException('UOM with this name already exists');
    }



    const createdUom = await uomRepo.save(
      uomRepo.create({
        name,
        isBase: false,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'UOM_CREATED',
      description: `UOM ${createdUom.name} created`,
      metadata: { uomId: createdUom.id, isBase: createdUom.isBase },
    });

    return createdUom;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [uoms, total] = await tenantDb.getRepository(Uom).findAndCount({
      where: { name: Like(`%${search}%`), isBase: false },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'UOM_LISTED',
      description: 'UOM listed',
      metadata: { total, page, limit },
    });

    return { result: uoms, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const uom = await tenantDb.getRepository(Uom).findOne({
      where: { id },
    });

    if (!uom) {
      throw new NotFoundException('UOM not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'UOM_VIEWED',
      description: `UOM ${uom.name} viewed`,
      metadata: { uomId: uom.id },
    });

    return uom;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateUomDto, user: any) {
    const uomRepo = tenantDb.getRepository(Uom);
    const uom = await uomRepo.findOne({ where: { id } });

    if (!uom) {
      throw new NotFoundException('UOM not found');
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (nextName !== uom.name) {
        const nameTaken = await uomRepo.findOne({ where: { name: nextName } });
        if (nameTaken) {
          throw new ConflictException('UOM with this name already exists');
        }
        uom.name = nextName;
      }
    }

    await uomRepo.save(uom);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'UOM_UPDATED',
      description: `UOM ${uom.name} updated`,
      metadata: { uomId: uom.id, isBase: uom.isBase },
    });

    return uom;
  }
}
