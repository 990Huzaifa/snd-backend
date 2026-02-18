import { MigrationInterface, QueryRunner } from "typeorm";

export class TenantMigration1771405283179 implements MigrationInterface {
    name = 'TenantMigration1771405283179'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7" UNIQUE ("name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "regions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "city_id" uuid NOT NULL, "name" character varying(150) NOT NULL, "code" character varying(50), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4fcd12ed6a046276e2deb08801c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8aeb89d87dbaf6c71161d690e7" ON "regions" ("city_id", "name") `);
        await queryRunner.query(`CREATE TABLE "areas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "code" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "region_id" uuid, CONSTRAINT "PK_5110493f6342f34c978c084d0d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "areas" ADD CONSTRAINT "FK_0d29c12041dc3f1563f47e99a96" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "areas" DROP CONSTRAINT "FK_0d29c12041dc3f1563f47e99a96"`);
        await queryRunner.query(`DROP TABLE "areas"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8aeb89d87dbaf6c71161d690e7"`);
        await queryRunner.query(`DROP TABLE "regions"`);
        await queryRunner.query(`DROP TABLE "roles"`);
    }

}
