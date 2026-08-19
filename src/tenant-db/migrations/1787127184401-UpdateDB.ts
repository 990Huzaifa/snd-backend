import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateDB1787127184401 implements MigrationInterface {
    name = 'UpdateDB1787127184401'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "spg_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderNumber" character varying NOT NULL, "spgId" uuid NOT NULL, "retailerId" uuid NOT NULL, "notes" character varying, "orderDate" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6d564550ba120d3a5f1f0fa3ad6" UNIQUE ("orderNumber"), CONSTRAINT "PK_3d863a592946add2cf003076ee0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "spg_order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "spgOrderId" uuid NOT NULL, "productId" uuid NOT NULL, "productFlavourId" uuid NOT NULL, "productPricingId" uuid NOT NULL, "quantity" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_25412bee418932fdcef4be9799a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "flavours" ADD "sku" character varying`);
        await queryRunner.query(`ALTER TABLE "uoms" ADD "childUomId" character varying`);
        await queryRunner.query(`ALTER TABLE "product_flavours" ADD "productFlavourSku" character varying`);
        await queryRunner.query(`ALTER TABLE "product_pricings" ADD "gst" numeric(10,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "product_pricings" ADD "offer" numeric(10,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "product_pricing_jobs" ADD "gst" numeric(10,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "product_pricing_jobs" ADD "offer" numeric(10,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TYPE "public"."retailer_inventories_type_enum" RENAME TO "retailer_inventories_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."retailer_inventories_retailerinventorytype_enum" AS ENUM('WAREHOUSE', 'SHELF')`);
        await queryRunner.query(`ALTER TABLE "retailer_inventories" ALTER COLUMN "retailerInventoryType" TYPE "public"."retailer_inventories_retailerinventorytype_enum" USING "retailerInventoryType"::"text"::"public"."retailer_inventories_retailerinventorytype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."retailer_inventories_type_enum_old"`);
        await queryRunner.query(`ALTER TABLE "spg_orders" ADD CONSTRAINT "FK_02548a2d1dc9c510f7c435a23c4" FOREIGN KEY ("spgId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "spg_orders" ADD CONSTRAINT "FK_7761e72d0eab127fd555634513a" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "spg_order_items" ADD CONSTRAINT "FK_13429dc5fd169c7be23e23d4ce9" FOREIGN KEY ("spgOrderId") REFERENCES "spg_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "spg_order_items" ADD CONSTRAINT "FK_c520f79bc5cfe84c870935f83ef" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "spg_order_items" ADD CONSTRAINT "FK_21ff55486174c33d8eab245728a" FOREIGN KEY ("productFlavourId") REFERENCES "product_flavours"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "spg_order_items" ADD CONSTRAINT "FK_9751ae88c6b45a83f28f1eeee63" FOREIGN KEY ("productPricingId") REFERENCES "product_pricings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "spg_order_items" DROP CONSTRAINT "FK_9751ae88c6b45a83f28f1eeee63"`);
        await queryRunner.query(`ALTER TABLE "spg_order_items" DROP CONSTRAINT "FK_21ff55486174c33d8eab245728a"`);
        await queryRunner.query(`ALTER TABLE "spg_order_items" DROP CONSTRAINT "FK_c520f79bc5cfe84c870935f83ef"`);
        await queryRunner.query(`ALTER TABLE "spg_order_items" DROP CONSTRAINT "FK_13429dc5fd169c7be23e23d4ce9"`);
        await queryRunner.query(`ALTER TABLE "spg_orders" DROP CONSTRAINT "FK_7761e72d0eab127fd555634513a"`);
        await queryRunner.query(`ALTER TABLE "spg_orders" DROP CONSTRAINT "FK_02548a2d1dc9c510f7c435a23c4"`);
        await queryRunner.query(`CREATE TYPE "public"."retailer_inventories_type_enum_old" AS ENUM('WAREHOUSE', 'SHELF')`);
        await queryRunner.query(`ALTER TABLE "retailer_inventories" ALTER COLUMN "retailerInventoryType" TYPE "public"."retailer_inventories_type_enum_old" USING "retailerInventoryType"::"text"::"public"."retailer_inventories_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."retailer_inventories_retailerinventorytype_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."retailer_inventories_type_enum_old" RENAME TO "retailer_inventories_type_enum"`);
        await queryRunner.query(`ALTER TABLE "product_pricing_jobs" DROP COLUMN "offer"`);
        await queryRunner.query(`ALTER TABLE "product_pricing_jobs" DROP COLUMN "gst"`);
        await queryRunner.query(`ALTER TABLE "product_pricings" DROP COLUMN "offer"`);
        await queryRunner.query(`ALTER TABLE "product_pricings" DROP COLUMN "gst"`);
        await queryRunner.query(`ALTER TABLE "product_flavours" DROP COLUMN "productFlavourSku"`);
        await queryRunner.query(`ALTER TABLE "uoms" DROP COLUMN "childUomId"`);
        await queryRunner.query(`ALTER TABLE "flavours" DROP COLUMN "sku"`);
        await queryRunner.query(`DROP TABLE "spg_order_items"`);
        await queryRunner.query(`DROP TABLE "spg_orders"`);
    }

}
