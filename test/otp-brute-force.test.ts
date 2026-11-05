import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { requestOtp, verifyOtp } from "@/lib/otp";

let phones: string[] = [];

afterEach(async () => {
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  phones = [];
});

function freshPhone() {
  const phone = `9${crypto.randomUUID().replace(/\D/g, "").slice(0, 9).padEnd(9, "0")}`;
  phones.push(phone);
  return phone;
}

describe("OTP brute-force throttling — verifyOtp", () => {
  it("accepts the correct code on the first try", async () => {
    const phone = freshPhone();
    const req = await requestOtp(phone);
    expect(req.ok).toBe(true);
    if (!req.ok) return;

    const user = await verifyOtp(phone, req.code);
    expect(user).not.toBeNull();
  });

  it("locks out the code after 5 wrong guesses, even if the 6th guess is correct", async () => {
    const phone = freshPhone();
    const req = await requestOtp(phone);
    if (!req.ok) throw new Error("setup failed");

    for (let i = 0; i < 5; i++) {
      const result = await verifyOtp(phone, "000000");
      expect(result).toBeNull();
    }

    // The 6th attempt, even with the genuinely correct code, must fail —
    // the code is spent after 5 wrong guesses, not still live for a 6th try.
    const finalAttempt = await verifyOtp(phone, req.code);
    expect(finalAttempt).toBeNull();
  });

  it("resets the attempt counter when a fresh code is requested", async () => {
    const phone = freshPhone();
    const first = await requestOtp(phone);
    if (!first.ok) throw new Error("setup failed");

    await verifyOtp(phone, "000000");
    await verifyOtp(phone, "000000");

    // Simulate the cooldown elapsing so a second code can be requested.
    await prisma.user.update({ where: { phone }, data: { otpExpiresAt: new Date(Date.now() - 6 * 60 * 1000) } });
    const second = await requestOtp(phone);
    if (!second.ok) throw new Error("second request failed");

    const user = await verifyOtp(phone, second.code);
    expect(user).not.toBeNull();
  });

  it("does not count a correct-but-expired code against the attempt limit in a way that blocks a fresh code", async () => {
    const phone = freshPhone();
    const req = await requestOtp(phone);
    if (!req.ok) throw new Error("setup failed");

    await prisma.user.update({ where: { phone }, data: { otpExpiresAt: new Date(Date.now() - 1000) } });
    const expiredResult = await verifyOtp(phone, req.code);
    expect(expiredResult).toBeNull();

    await prisma.user.update({ where: { phone }, data: { otpExpiresAt: new Date(Date.now() - 6 * 60 * 1000) } });
    const fresh = await requestOtp(phone);
    if (!fresh.ok) throw new Error("fresh request failed");
    const result = await verifyOtp(phone, fresh.code);
    expect(result).not.toBeNull();
  });
});
