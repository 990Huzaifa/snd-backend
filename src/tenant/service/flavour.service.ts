import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { Flavour, Product, ProductFlavour } from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateFlavourDto } from '../dto/flavour/create-flavour.dto';
import { UpdateFlavourDto } from '../dto/flavour/update-flavour.dto';

@Injectable()
export class FlavourService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async create(tenantDb: DataSource, dto: CreateFlavourDto, user: any) {
    const name = dto.name.trim();
    const flavourRepo = tenantDb.getRepository(Flavour);
    const existingFlavour = await flavourRepo.findOne({ where: { name } });

    if (existingFlavour) {
      throw new ConflictException('Flavour with this name already exists');
    }

    const createdFlavour = await flavourRepo.save(flavourRepo.create({ name }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_CREATED',
      description: `Flavour ${createdFlavour.name} created`,
      metadata: { flavourId: createdFlavour.id },
    });

    return createdFlavour;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [flavours, total] = await tenantDb.getRepository(Flavour).findAndCount({
      where: { name: Like(`%${search}%`) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_LISTED',
      description: 'Flavours listed',
      metadata: { total, page, limit },
    });

    return { result: flavours, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const flavour = await tenantDb.getRepository(Flavour).findOne({
      where: { id },
    });

    if (!flavour) {
      throw new NotFoundException('Flavour not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_VIEWED',
      description: `Flavour ${flavour.name} viewed`,
      metadata: { flavourId: flavour.id },
    });

    return flavour;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateFlavourDto, user: any) {
    const flavourRepo = tenantDb.getRepository(Flavour);
    const flavour = await flavourRepo.findOne({ where: { id } });

    if (!flavour) {
      throw new NotFoundException('Flavour not found');
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (nextName !== flavour.name) {
        const nameTaken = await flavourRepo.findOne({ where: { name: nextName } });
        if (nameTaken) {
          throw new ConflictException('Flavour with this name already exists');
        }
        flavour.name = nextName;
      }
    }

    await flavourRepo.save(flavour);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_UPDATED',
      description: `Flavour ${flavour.name} updated`,
      metadata: { flavourId: flavour.id },
    });

    return flavour;
  }

  async delete(tenantDb: DataSource, id: string, user: any) {
    const flavourRepo = tenantDb.getRepository(Flavour);
    const productFlavourRepo = tenantDb.getRepository(ProductFlavour);

    const flavour = await flavourRepo.findOne({ where: { id } });
    if (!flavour) {
      throw new NotFoundException('Flavour not found');
    }

    const flavourInUseCount = await productFlavourRepo
      .createQueryBuilder('productFlavour')
      .leftJoin(Product, 'product', 'product.id = productFlavour.productId')
      .where('productFlavour.flavourId = :flavourId', { flavourId: flavour.id })
      .andWhere('(product.id IS NULL OR product.isDelete = false)')
      .getCount();

    if (flavourInUseCount > 0) {
      throw new ConflictException('Flavour is in use by products and cannot be deleted');
    }

    await flavourRepo.remove(flavour);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'FLAVOUR_DELETED',
      description: `Flavour ${flavour.name} deleted`,
      metadata: { flavourId: flavour.id },
    });

    return { message: 'Flavour deleted successfully' };
  }
}
