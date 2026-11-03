import { describe, it, expect, afterEach } from "vitest";
import { issueAlumniCredential, verifyCredential, getIssuerPublicKeyBase64 } from "@/lib/credentials";
import { createAlumniFixture } from "./helpers/alumni-fixture";

let cleanupFns: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanupFns.reverse()) await cleanup();
  cleanupFns = [];
});

describe("verifiable alumni credentials", () => {
  it("issues a credential whose signature verifies against the issuer's own key", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);

    const credential = await issueAlumniCredential(alumniProfile.id);
    expect(credential.type).toContain("VerifiableCredential");
    expect(credential.proof.verificationMethod).toBe(getIssuerPublicKeyBase64());

    const result = verifyCredential(credential);
    expect(result.valid).toBe(true);
  });

  it("rejects a credential whose content was altered after issuance", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);

    const credential = await issueAlumniCredential(alumniProfile.id);
    const tampered = { ...credential, credentialSubject: { ...credential.credentialSubject, currentCompany: "A Company That Never Hired Them" } };

    const result = verifyCredential(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/altered/i);
  });

  it("rejects a credential signed with a key that isn't this platform's issuer key", async () => {
    const { alumniProfile, cleanup } = await createAlumniFixture();
    cleanupFns.push(cleanup);

    const credential = await issueAlumniCredential(alumniProfile.id);
    const forged = { ...credential, proof: { ...credential.proof, verificationMethod: Buffer.alloc(32, 7).toString("base64") } };

    const result = verifyCredential(forged);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/not issued here/i);
  });

  it("rejects a malformed credential instead of throwing", () => {
    expect(verifyCredential({})).toEqual({ valid: false, reason: "Missing or malformed proof block" });
    expect(verifyCredential(null)).toEqual({ valid: false, reason: "Not a credential object" });
    expect(verifyCredential("just a string")).toEqual({ valid: false, reason: "Not a credential object" });
  });

  it("produces a stable issuer public key across calls (deterministic from AUTH_SECRET)", () => {
    expect(getIssuerPublicKeyBase64()).toBe(getIssuerPublicKeyBase64());
  });
});
