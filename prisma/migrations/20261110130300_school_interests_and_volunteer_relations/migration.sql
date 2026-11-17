ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_volunteerId_fkey"
  FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
