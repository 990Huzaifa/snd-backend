import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMarginInDistributor1787319279602 implements MigrationInterface {
    name = 'AddMarginInDistributor1787319279602'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "system_settings" ("id" SERIAL NOT NULL, "key" character varying, "value" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_82521f08790d248b2a80cc85d40" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "distributors" ADD "marginPercentage" numeric(10,2) NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "distributors" DROP COLUMN "marginPercentage"`);
        await queryRunner.query(`DROP TABLE "system_settings"`);
    }

}
