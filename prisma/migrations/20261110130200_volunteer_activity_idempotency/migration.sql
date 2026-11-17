ALTER TABLE "VolunteerActivity" ADD COLUMN "idempotencyKey" TEXT;
UPDATE "VolunteerActivity" SET "idempotencyKey" = 'legacy:' || "id" WHERE "idempotencyKey" IS NULL;
ALTER TABLE "VolunteerActivity" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "VolunteerActivity_idempotencyKey_key" ON "VolunteerActivity"("idempotencyKey");

CREATE TYPE "SchoolInterestStatus" AS ENUM (
  'NEW', 'CONTACTED', 'APPLICATION_STARTED', 'APPLIED', 'NOT_INTERESTED'
);
CREATE TABLE "SchoolVisitInterest" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "classOrYear" TEXT NOT NULL,
  "contactNumber" TEXT,
  "contactConsent" BOOLEAN NOT NULL DEFAULT false,
  "courseInterest" TEXT,
  "higherEducationInterest" TEXT,
  "financialSupportNeeded" BOOLEAN NOT NULL DEFAULT false,
  "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
  "status" "SchoolInterestStatus" NOT NULL DEFAULT 'NEW',
  "applicantId" TEXT,
  "notes" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolVisitInterest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolVisitInterest_applicantId_key" ON "SchoolVisitInterest"("applicantId");
CREATE UNIQUE INDEX "SchoolVisitInterest_idempotencyKey_key" ON "SchoolVisitInterest"("idempotencyKey");
CREATE INDEX "SchoolVisitInterest_activityId_status_idx" ON "SchoolVisitInterest"("activityId", "status");
CREATE INDEX "SchoolVisitInterest_recordedById_createdAt_idx" ON "SchoolVisitInterest"("recordedById", "createdAt");
ALTER TABLE "SchoolVisitInterest" ADD CONSTRAINT "SchoolVisitInterest_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "VolunteerActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolVisitInterest" ADD CONSTRAINT "SchoolVisitInterest_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolVisitInterest" ADD CONSTRAINT "SchoolVisitInterest_applicantId_fkey"
  FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ActivityExpense" ADD CONSTRAINT "ActivityExpense_volunteerId_fkey"
  FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityExpense" ADD CONSTRAINT "ActivityExpense_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
