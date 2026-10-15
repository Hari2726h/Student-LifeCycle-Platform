import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

const OTP_TTL_MS = 5 * 60 * 1000;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Creates the applicant's account on first contact (phone number is the
 * identity), stamps a fresh OTP, and returns it so the UI can display it.
 * There's no SMS gateway in this build — see the dev banner in the UI —
 * so "sending" the code means showing it back to whoever requested it.
 */
export async function requestOtp(phone: string) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const user = await prisma.user.upsert({
    where: { phone },
    update: { otpCode: code, otpExpiresAt: expiresAt },
    create: {
      phone,
      name: `Applicant ${phone.slice(-4)}`,
      email: `${phone}@applicant.maatram.local`,
      role: Role.APPLICANT,
      otpCode: code,
      otpExpiresAt: expiresAt,
    },
  });

  return { code, userId: user.id };
}

export async function verifyOtp(phone: string, code: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.otpCode || !user.otpExpiresAt) return null;
  if (user.otpCode !== code) return null;
  if (user.otpExpiresAt.getTime() < Date.now()) return null;

  await prisma.user.update({
    where: { id: user.id },
    data: { otpCode: null, otpExpiresAt: null },
  });

  return user;
}
