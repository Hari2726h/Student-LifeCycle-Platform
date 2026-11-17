import { createHmac } from "node:crypto";

export function hashAadhaar(value: string) {
  const secret = process.env.AADHAAR_HMAC_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Set AADHAAR_HMAC_SECRET to a random secret of at least 32 characters.");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}
