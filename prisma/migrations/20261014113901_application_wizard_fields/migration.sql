-- AlterTable
ALTER TABLE "Applicant" ALTER COLUMN "boardPercentage" DROP NOT NULL,
ALTER COLUMN "courseInterest" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ALTER COLUMN "passwordHash" DROP NOT NULL;
