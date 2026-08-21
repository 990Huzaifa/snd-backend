import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetailerLocationTitle1787321000000 implements MigrationInterface {
  name = 'AddRetailerLocationTitle1787321000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "retailers" ADD "locationTitle" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "retailers" DROP COLUMN "locationTitle"`,
    );
  }
}
