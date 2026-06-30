import { IsNotEmpty, IsUUID } from 'class-validator';

export class SalesmanSyncDownDto {
  @IsUUID()
  @IsNotEmpty()
  distributorId: string;
}
