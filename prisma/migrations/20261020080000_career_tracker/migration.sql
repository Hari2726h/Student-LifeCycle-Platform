-- CreateEnum
CREATE TYPE "CareerEventSource" AS ENUM ('SELF_REPORTED', 'REFERRAL', 'PLACEMENT');

-- CreateTable
CREATE TABLE "CareerEvent" (
    "id" TEXT NOT NULL,
    "alumniProfileId" TEXT NOT NULL,
    "source" "CareerEventSource" NOT NULL,
    "company" TEXT NOT NULL,
    "companyNormalized" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareerEvent_alumniProfileId_idx" ON "CareerEvent"("alumniProfileId");

-- CreateIndex
CREATE INDEX "CareerEvent_companyNormalized_isCurrent_idx" ON "CareerEvent"("companyNormalized", "isCurrent");

-- AddForeignKey
ALTER TABLE "CareerEvent" ADD CONSTRAINT "CareerEvent_alumniProfileId_fkey" FOREIGN KEY ("alumniProfileId") REFERENCES "AlumniProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

