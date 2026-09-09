import { MigrationInterface, QueryRunner } from "typeorm";

export class SystemSettingsType1788945779008 implements MigrationInterface {
    name = 'SystemSettingsType1788945779008'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "system_settings" DROP COLUMN "key"`);
        await queryRunner.query(`ALTER TABLE "system_settings" DROP COLUMN "value"`);
        await queryRunner.query(`ALTER TABLE "system_settings" ADD "defaultShopRadius" character varying NOT NULL DEFAULT '0.5'`);
        await queryRunner.query(`ALTER TABLE "system_settings" ADD "workingHoursPerDay" integer NOT NULL DEFAULT '8'`);
        await queryRunner.query(`ALTER TABLE "system_settings" ADD "workingDaysPerWeek" integer NOT NULL DEFAULT '5'`);
        await queryRunner.query(`ALTER TABLE "system_settings" ADD "autoCheckoutTime" character varying(5) NOT NULL DEFAULT '18:00'`);
        await queryRunner.query(`ALTER TABLE "system_settings" ADD "weeklyHolidays" jsonb NOT NULL DEFAULT '["SATURDAY","SUNDAY"]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "system_settings" DROP COLUMN "weeklyHolidays"`);
        await queryRunner.query(`ALTER TABLE "system_settings" DROP COLUMN "autoCheckoutTime"`);
        await queryRunner.query(`ALTER TABLE "system_settings" DROP COLUMN "workingDaysPerWeek"`);
        await queryRunner.query(`ALTER TABLE "system_settings" DROP COLUMN "workingHoursPerDay"`);
        await queryRunner.query(`ALTER TABLE "system_settings" DROP COLUMN "defaultShopRadius"`);
        await queryRunner.query(`ALTER TABLE "system_settings" ADD "value" character varying`);
        await queryRunner.query(`ALTER TABLE "system_settings" ADD "key" character varying`);
    }

}
