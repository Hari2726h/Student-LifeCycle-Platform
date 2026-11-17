ALTER TABLE "SantaBeneficiary" ADD COLUMN "idempotencyKey" TEXT;
UPDATE "SantaBeneficiary" SET "idempotencyKey" = 'legacy:' || "id" WHERE "idempotencyKey" IS NULL;
ALTER TABLE "SantaBeneficiary" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "SantaBeneficiary_idempotencyKey_key" ON "SantaBeneficiary"("idempotencyKey");
