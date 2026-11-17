ALTER TABLE "OfflineMeeting" ADD CONSTRAINT "OfflineMeeting_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
