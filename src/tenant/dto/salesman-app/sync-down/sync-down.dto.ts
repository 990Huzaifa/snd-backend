import { IsNotEmpty, IsUUID } from 'class-validator';

export class SalesmanDistributorQueryDto {
  @IsUUID()
  @IsNotEmpty()
  distributorId: string;
}
