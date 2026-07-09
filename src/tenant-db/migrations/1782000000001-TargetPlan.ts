import { MigrationInterface, QueryRunner } from 'typeorm';

export class TargetPlan1782000000001 implements MigrationInterface {
    name = 'TargetPlan1782000000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."target_plans_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'LOCKED', 'CLOSED', 'CANCELLED')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."target_plan_assignees_status_enum" AS ENUM('ACTIVE', 'REMOVED')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."target_metrics_metrictype_enum" AS ENUM('SALES_VALUE', 'PRODUCT_QTY', 'CATEGORY_QTY', 'RETAILER_VISITS', 'NEW_RETAILERS')`,
        );
        await queryRunner.query(
            `CREATE TABLE "target_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "cityId" character varying NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "status" "public"."target_plans_status_enum" NOT NULL DEFAULT 'DRAFT', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_target_plans" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "target_plan_assignees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "targetPlanId" uuid NOT NULL, "userType" "public"."users_type_enum" NOT NULL, "assigneeId" uuid NOT NULL, "status" "public"."target_plan_assignees_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_target_plan_assignees" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "target_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "targetPlanId" uuid NOT NULL, "metricType" "public"."target_metrics_metrictype_enum" NOT NULL, "targetValue" numeric(10,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_target_metrics" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "target_metric_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "targetMetricId" uuid NOT NULL, "metricType" "public"."target_metrics_metrictype_enum" NOT NULL, "productId" uuid, "categoryId" uuid, "targetQuantity" numeric(18,2) NOT NULL DEFAULT '0', "targetAmount" numeric(18,2) NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_target_metric_items" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "target_achievement_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "targetAssigneeId" uuid NOT NULL, "targetMetricId" uuid NOT NULL, "targetValue" numeric(18,2) NOT NULL DEFAULT '0', "achievementValue" numeric(18,2) NOT NULL DEFAULT '0', "achievementPercentage" numeric(18,2) NOT NULL DEFAULT '0', "remainingValue" numeric(18,2) NOT NULL DEFAULT '0', "calculatedFrom" TIMESTAMP, "calculatedTo" TIMESTAMP, "calculatedAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_target_achievement_snapshots" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_plan_assignees" ADD CONSTRAINT "FK_target_plan_assignees_plan" FOREIGN KEY ("targetPlanId") REFERENCES "target_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_plan_assignees" ADD CONSTRAINT "FK_target_plan_assignees_user" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_metrics" ADD CONSTRAINT "FK_target_metrics_plan" FOREIGN KEY ("targetPlanId") REFERENCES "target_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_metric_items" ADD CONSTRAINT "FK_target_metric_items_metric" FOREIGN KEY ("targetMetricId") REFERENCES "target_metrics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_metric_items" ADD CONSTRAINT "FK_target_metric_items_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_metric_items" ADD CONSTRAINT "FK_target_metric_items_category" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_achievement_snapshots" ADD CONSTRAINT "FK_target_achievement_snapshots_assignee" FOREIGN KEY ("targetAssigneeId") REFERENCES "target_plan_assignees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_achievement_snapshots" ADD CONSTRAINT "FK_target_achievement_snapshots_metric" FOREIGN KEY ("targetMetricId") REFERENCES "target_metrics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "target_achievement_snapshots" DROP CONSTRAINT "FK_target_achievement_snapshots_metric"`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_achievement_snapshots" DROP CONSTRAINT "FK_target_achievement_snapshots_assignee"`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_metric_items" DROP CONSTRAINT "FK_target_metric_items_category"`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_metric_items" DROP CONSTRAINT "FK_target_metric_items_product"`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_metric_items" DROP CONSTRAINT "FK_target_metric_items_metric"`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_metrics" DROP CONSTRAINT "FK_target_metrics_plan"`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_plan_assignees" DROP CONSTRAINT "FK_target_plan_assignees_user"`,
        );
        await queryRunner.query(
            `ALTER TABLE "target_plan_assignees" DROP CONSTRAINT "FK_target_plan_assignees_plan"`,
        );
        await queryRunner.query(`DROP TABLE "target_achievement_snapshots"`);
        await queryRunner.query(`DROP TABLE "target_metric_items"`);
        await queryRunner.query(`DROP TABLE "target_metrics"`);
        await queryRunner.query(`DROP TABLE "target_plan_assignees"`);
        await queryRunner.query(`DROP TABLE "target_plans"`);
        await queryRunner.query(`DROP TYPE "public"."target_metrics_metrictype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."target_plan_assignees_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."target_plans_status_enum"`);
    }
}
