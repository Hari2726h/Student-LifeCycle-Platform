ALTER TABLE "VolunteerActivity"
  ADD COLUMN "reportingAt" TIMESTAMP(3),
  ADD COLUMN "schoolName" TEXT,
  ADD COLUMN "schoolAddress" TEXT,
  ADD COLUMN "schoolDistrict" TEXT,
  ADD COLUMN "schoolContactPerson" TEXT,
  ADD COLUMN "schoolContactNumber" TEXT;
