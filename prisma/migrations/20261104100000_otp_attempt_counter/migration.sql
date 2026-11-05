-- Brute-force throttling for OTP verification (lib/otp.ts verifyOtp).
ALTER TABLE "User" ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0;
