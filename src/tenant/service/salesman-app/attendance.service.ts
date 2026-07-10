import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Attendence } from 'src/tenant-db/entities/attendence.entity';

@Injectable()
export class SalesmanAttendanceService {
  // testing delete api service
  async deleteAttendance(tenantDb: DataSource, userId: string) {
    await tenantDb.getRepository(Attendence).delete({ userId });
    return { success: true };
  }
}
