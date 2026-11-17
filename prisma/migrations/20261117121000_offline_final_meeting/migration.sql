CREATE TYPE "OfflineMeetingOutcome" AS ENUM ('SCHEDULED', 'COMPLETED', 'SELECTED', 'REJECTED', 'RESCHEDULED');

CREATE TABLE "OfflineMeeting" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "location" TEXT,
    "coordinatorId" TEXT,
    "attended" BOOLEAN,
    "remarks" TEXT,
    "outcome" "OfflineMeetingOutcome" NOT NULL DEFAULT 'SCHEDULED',
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineMeeting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfflineMeeting_applicantId_key" ON "OfflineMeeting"("applicantId");
CREATE INDEX "OfflineMeeting_outcome_scheduledAt_idx" ON "OfflineMeeting"("outcome", "scheduledAt");

ALTER TABLE "OfflineMeeting" ADD CONSTRAINT "OfflineMeeting_applicantId_fkey"
    FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineMeeting" ADD CONSTRAINT "OfflineMeeting_coordinatorId_fkey"
    FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
