-- Additive volunteer management schema. Existing lifecycle tables and rows
-- are intentionally left untouched.
CREATE TYPE "VolunteerActivityType" AS ENUM (
  'PHYSICAL_VERIFICATION', 'CALL_VERIFICATION', 'TUTORING',
  'SCHOOL_VISIT', 'SANTA_PROGRAMME', 'OTHER'
);
CREATE TYPE "VolunteerActivityStatus" AS ENUM (
  'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED',
  'FOLLOW_UP', 'CANCELLED'
);
CREATE TYPE "VolunteerActivityPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "ActivityReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'FOLLOW_UP');
CREATE TYPE "CallVerificationStatus" AS ENUM (
  'CONNECTED', 'NOT_REACHABLE', 'SWITCHED_OFF', 'CALL_LATER',
  'WRONG_NUMBER', 'VERIFICATION_COMPLETED'
);
CREATE TYPE "ActivityExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "VolunteerProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profilePhotoUrl" TEXT,
  "address" TEXT,
  "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "availability" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VolunteerProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VolunteerProfile_userId_key" ON "VolunteerProfile"("userId");
ALTER TABLE "VolunteerProfile" ADD CONSTRAINT "VolunteerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VolunteerActivity" (
  "id" TEXT NOT NULL,
  "type" "VolunteerActivityType" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "location" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "priority" "VolunteerActivityPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "VolunteerActivityStatus" NOT NULL DEFAULT 'PLANNED',
  "applicantId" TEXT,
  "studentId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VolunteerActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VolunteerActivity_type_status_idx" ON "VolunteerActivity"("type", "status");
CREATE INDEX "VolunteerActivity_startsAt_dueAt_idx" ON "VolunteerActivity"("startsAt", "dueAt");
CREATE INDEX "VolunteerActivity_applicantId_idx" ON "VolunteerActivity"("applicantId");
CREATE INDEX "VolunteerActivity_studentId_idx" ON "VolunteerActivity"("studentId");
ALTER TABLE "VolunteerActivity" ADD CONSTRAINT "VolunteerActivity_applicantId_fkey"
  FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VolunteerActivity" ADD CONSTRAINT "VolunteerActivity_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VolunteerActivity" ADD CONSTRAINT "VolunteerActivity_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ActivityAssignment" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "volunteerId" TEXT NOT NULL,
  "responsibility" TEXT,
  "status" "VolunteerActivityStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ActivityAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityAssignment_activityId_volunteerId_key" ON "ActivityAssignment"("activityId", "volunteerId");
CREATE INDEX "ActivityAssignment_volunteerId_status_idx" ON "ActivityAssignment"("volunteerId", "status");
ALTER TABLE "ActivityAssignment" ADD CONSTRAINT "ActivityAssignment_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "VolunteerActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityAssignment" ADD CONSTRAINT "ActivityAssignment_volunteerId_fkey"
  FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ActivityReport" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "volunteerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reviewStatus" "ActivityReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityReport_idempotencyKey_key" ON "ActivityReport"("idempotencyKey");
CREATE INDEX "ActivityReport_activityId_createdAt_idx" ON "ActivityReport"("activityId", "createdAt");
CREATE INDEX "ActivityReport_volunteerId_createdAt_idx" ON "ActivityReport"("volunteerId", "createdAt");
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "VolunteerActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ActivityAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_volunteerId_fkey"
  FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ActivityEvidence" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityEvidence_storageKey_key" ON "ActivityEvidence"("storageKey");
CREATE INDEX "ActivityEvidence_reportId_idx" ON "ActivityEvidence"("reportId");
ALTER TABLE "ActivityEvidence" ADD CONSTRAINT "ActivityEvidence_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "ActivityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CallVerification" (
  "id" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "volunteerId" TEXT NOT NULL,
  "activityId" TEXT,
  "calledAt" TIMESTAMP(3) NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "alternateMobile" TEXT,
  "status" "CallVerificationStatus" NOT NULL,
  "identityConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "addressConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "familyConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "incomeConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "educationConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "admissionInterest" BOOLEAN NOT NULL DEFAULT false,
  "studentAvailability" TEXT,
  "personAnswered" TEXT,
  "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
  "nextFollowUpAt" TIMESTAMP(3),
  "comments" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallVerification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CallVerification_idempotencyKey_key" ON "CallVerification"("idempotencyKey");
CREATE UNIQUE INDEX "CallVerification_applicantId_attemptNumber_key" ON "CallVerification"("applicantId", "attemptNumber");
CREATE INDEX "CallVerification_volunteerId_calledAt_idx" ON "CallVerification"("volunteerId", "calledAt");
ALTER TABLE "CallVerification" ADD CONSTRAINT "CallVerification_applicantId_fkey"
  FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallVerification" ADD CONSTRAINT "CallVerification_volunteerId_fkey"
  FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallVerification" ADD CONSTRAINT "CallVerification_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "VolunteerActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PhysicalVerificationReport" (
  "id" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "volunteerId" TEXT NOT NULL,
  "visitAt" TIMESTAMP(3) NOT NULL,
  "personMet" TEXT,
  "relationshipToStudent" TEXT,
  "visitLocation" TEXT,
  "identityVerified" BOOLEAN NOT NULL DEFAULT false,
  "addressVerified" BOOLEAN NOT NULL DEFAULT false,
  "incomeVerified" BOOLEAN NOT NULL DEFAULT false,
  "housingVerified" BOOLEAN NOT NULL DEFAULT false,
  "householdConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "photoEvidenceCollected" BOOLEAN NOT NULL DEFAULT false,
  "duplicateCheckPassed" BOOLEAN NOT NULL DEFAULT false,
  "housingCondition" "HousingCondition",
  "confirmedHouseholdSize" INTEGER,
  "earningMembers" INTEGER,
  "dependents" INTEGER,
  "financialCondition" TEXT,
  "guardianOccupation" TEXT,
  "higherEducationInterest" TEXT,
  "pvReason" TEXT,
  "familyCircumstances" TEXT,
  "educationInterest" TEXT,
  "observations" TEXT,
  "recommendation" TEXT,
  "decision" "VerificationDecision" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhysicalVerificationReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PhysicalVerificationReport_idempotencyKey_key" ON "PhysicalVerificationReport"("idempotencyKey");
CREATE INDEX "PhysicalVerificationReport_applicantId_createdAt_idx" ON "PhysicalVerificationReport"("applicantId", "createdAt");
CREATE INDEX "PhysicalVerificationReport_volunteerId_createdAt_idx" ON "PhysicalVerificationReport"("volunteerId", "createdAt");
ALTER TABLE "PhysicalVerificationReport" ADD CONSTRAINT "PhysicalVerificationReport_applicantId_fkey"
  FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhysicalVerificationReport" ADD CONSTRAINT "PhysicalVerificationReport_volunteerId_fkey"
  FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TutoringSession" (
  "id" TEXT NOT NULL,
  "activityId" TEXT,
  "assignmentId" TEXT,
  "studentId" TEXT,
  "volunteerId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "sessionAt" TIMESTAMP(3) NOT NULL,
  "startTime" TEXT,
  "endTime" TEXT,
  "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "mode" TEXT NOT NULL,
  "attendance" TEXT NOT NULL,
  "understanding" TEXT,
  "homework" TEXT,
  "comments" TEXT,
  "nextSessionAt" TIMESTAMP(3),
  "assessmentMark" DOUBLE PRECISION,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TutoringSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TutoringSession_idempotencyKey_key" ON "TutoringSession"("idempotencyKey");
CREATE INDEX "TutoringSession_volunteerId_sessionAt_idx" ON "TutoringSession"("volunteerId", "sessionAt");
CREATE INDEX "TutoringSession_studentId_sessionAt_idx" ON "TutoringSession"("studentId", "sessionAt");
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "VolunteerActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ActivityAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ActivityExpense" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "volunteerId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "expenseAt" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "receiptKey" TEXT,
  "receiptName" TEXT,
  "status" "ActivityExpenseStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityExpense_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivityExpense_idempotencyKey_key" ON "ActivityExpense"("idempotencyKey");
CREATE INDEX "ActivityExpense_activityId_status_idx" ON "ActivityExpense"("activityId", "status");
CREATE INDEX "ActivityExpense_volunteerId_expenseAt_idx" ON "ActivityExpense"("volunteerId", "expenseAt");
ALTER TABLE "ActivityExpense" ADD CONSTRAINT "ActivityExpense_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "VolunteerActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityExpense" ADD CONSTRAINT "ActivityExpense_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ActivityAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SantaBeneficiary" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "childName" TEXT NOT NULL,
  "age" INTEGER NOT NULL,
  "giftCategory" TEXT NOT NULL,
  "giftAssigned" TEXT,
  "distributionStatus" TEXT NOT NULL DEFAULT 'PLANNED',
  "receivedConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SantaBeneficiary_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SantaBeneficiary_activityId_idx" ON "SantaBeneficiary"("activityId");
ALTER TABLE "SantaBeneficiary" ADD CONSTRAINT "SantaBeneficiary_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "VolunteerActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Event_idempotencyKey_key" ON "Event"("idempotencyKey");
