ALTER TABLE "Applicant" ADD COLUMN "academicDetails" JSONB;
ALTER TABLE "ApplicantSensitiveInfo" ADD COLUMN "familyDetails" JSONB;

CREATE TABLE "ApplicantIdentity" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "aadhaarHmac" TEXT NOT NULL,
    "aadhaarLast4" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicantIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicantIdentity_applicantId_key" ON "ApplicantIdentity"("applicantId");
CREATE UNIQUE INDEX "ApplicantIdentity_aadhaarHmac_key" ON "ApplicantIdentity"("aadhaarHmac");

ALTER TABLE "ApplicantIdentity" ADD CONSTRAINT "ApplicantIdentity_applicantId_fkey"
    FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
