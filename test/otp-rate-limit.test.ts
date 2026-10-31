import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { requestOtp } from "@/lib/otp";

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

describe("OTP rate limiting — the spec's named edge case (preventing abuse)", () => {
  it("rejects a second request for the same phone within the cooldown window", async () => {
    const phone = freshPhone();
    const first = await requestOtp(phone);
    expect(first.ok).toBe(true);

    const second = await requestOtp(phone);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/wait/i);
  });

  it("allows a request again once the cooldown has elapsed", async () => {
    const phone = freshPhone();
    await requestOtp(phone);

    // Simulate time passing by backdating the stored expiry instead of a
    // real sleep — the cooldown is derived from otpExpiresAt - TTL.
    await prisma.user.update({
      where: { phone },
      data: { otpExpiresAt: new Date(Date.now() - 6 * 60 * 1000) },
    });

    const result = await requestOtp(phone);
    expect(result.ok).toBe(true);
  });

  it("does not rate-limit two different phone numbers against each other", async () => {
    const phoneA = freshPhone();
    const phoneB = freshPhone();
    await requestOtp(phoneA);
    const result = await requestOtp(phoneB);
    expect(result.ok).toBe(true);
  });
});
