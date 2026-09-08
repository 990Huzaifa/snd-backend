import { MigrationInterface, QueryRunner } from "typeorm";

export class RouteTransfer1788865950868 implements MigrationInterface {
    name = 'RouteTransfer1788865950868'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "route_transfer_logs" DROP CONSTRAINT "FK_c2867e069b87f5cbf96a3a78455"`);
        await queryRunner.query(`ALTER TABLE "route_transfer_logs" ADD CONSTRAINT "FK_c2867e069b87f5cbf96a3a78455" FOREIGN KEY ("pjpId") REFERENCES "pjp_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "route_transfer_logs" DROP CONSTRAINT "FK_c2867e069b87f5cbf96a3a78455"`);
        await queryRunner.query(`ALTER TABLE "route_transfer_logs" ADD CONSTRAINT "FK_c2867e069b87f5cbf96a3a78455" FOREIGN KEY ("pjpId") REFERENCES "pjp_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

}
