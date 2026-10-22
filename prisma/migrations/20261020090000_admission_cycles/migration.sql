-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "cycleId" TEXT;

-- CreateTable
CREATE TABLE "AdmissionCycle" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionCycle_year_key" ON "AdmissionCycle"("year");

-- CreateIndex
CREATE INDEX "Applicant_cycleId_idx" ON "Applicant"("cycleId");

-- AddForeignKey
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AdmissionCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

