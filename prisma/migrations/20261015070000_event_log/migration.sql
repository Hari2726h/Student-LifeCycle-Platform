-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "sourceEventId" TEXT;

-- DropTable
DROP TABLE "AuditLog";

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplayBookmark" (
    "id" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplayBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_sequence_key" ON "Event"("sequence");

-- CreateIndex
CREATE INDEX "Event_type_sequence_idx" ON "Event"("type", "sequence");

-- CreateIndex
CREATE INDEX "Event_aggregateType_aggregateId_idx" ON "Event"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplayBookmark_workerName_key" ON "ReplayBookmark"("workerName");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_sourceEventId_recipientId_key" ON "Notification"("sourceEventId", "recipientId");

