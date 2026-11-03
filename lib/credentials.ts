import { createHash, createPrivateKey, createPublicKey, sign, verify } from "crypto";
import { prisma } from "@/lib/prisma";

/** A pragmatic subset of the W3C Verifiable Credentials Data Model — real
 * Ed25519 signing and verification, but NOT full interop: no DID
 * resolution (the issuer id below is a label, not a resolvable did:web),
 * and no RDF dataset canonicalization (we sort-and-stringify the JSON
 * instead of the spec's full JSON-LD normalization). What's genuinely
 * real: the signature is computed over the credential's content with a
 * real private key, and tampering with any field — or forging a
 * verificationMethod that isn't this server's actual public key — is
 * detected by verifyCredential() below, not merely asserted.
 *
 * The signing key is deterministically derived from AUTH_SECRET so this
 * works out of the box with no new required env var — fine for a demo,
 * wrong for production. A real deployment should provision a dedicated,
 * rotatable signing keypair instead of reusing the session secret. */

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function deriveSigningKeyPair() {
  const seed = createHash("sha256")
    .update(`maatram-vc-signing-key:${process.env.AUTH_SECRET ?? "dev-only-insecure-secret"}`)
    .digest();
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer;
  const publicKeyRaw = spki.subarray(spki.length - 32);
  return { privateKey, publicKeyRaw };
}

/** Deterministic, sorted-key JSON — same technique as lib/event-integrity.ts,
 * so the signature is computed over a stable representation regardless of
 * key insertion order (JS object literals, JSON.parse of pasted input, …). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function getIssuerPublicKeyBase64(): string {
  return deriveSigningKeyPair().publicKeyRaw.toString("base64");
}

export async function issueAlumniCredential(alumniProfileId: string) {
  const profile = await prisma.alumniProfile.findUniqueOrThrow({
    where: { id: alumniProfileId },
    include: { student: { include: { user: true, college: true } } },
  });

  const issuanceDate = new Date().toISOString();
  const unsigned = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "MaatramAlumnusCredential"],
    issuer: "Maatram Student Lifecycle Platform (demo issuer — not a resolvable DID)",
    issuanceDate,
    credentialSubject: {
      id: `urn:maatram:alumni:${profile.id}`,
      name: profile.student.user.name,
      college: profile.student.college.name,
      program: profile.student.program,
      admissionYear: profile.student.admissionYear,
      currentRole: profile.currentRole,
      currentCompany: profile.currentCompany,
    },
  };

  const { privateKey, publicKeyRaw } = deriveSigningKeyPair();
  const signature = sign(null, Buffer.from(stableStringify(unsigned)), privateKey);

  return {
    ...unsigned,
    proof: {
      type: "Ed25519Signature-simplified",
      created: issuanceDate,
      proofPurpose: "assertionMethod",
      verificationMethod: publicKeyRaw.toString("base64"),
      signatureValue: signature.toString("base64"),
    },
  };
}

export type CredentialVerification = { valid: boolean; reason?: string };

export function verifyCredential(credential: unknown): CredentialVerification {
  if (!credential || typeof credential !== "object") return { valid: false, reason: "Not a credential object" };
  const c = credential as Record<string, unknown>;
  const proof = c.proof as Record<string, unknown> | undefined;
  if (!proof || typeof proof.signatureValue !== "string" || typeof proof.verificationMethod !== "string") {
    return { valid: false, reason: "Missing or malformed proof block" };
  }

  let providedPublicKey: Buffer;
  let signature: Buffer;
  try {
    providedPublicKey = Buffer.from(proof.verificationMethod, "base64");
    signature = Buffer.from(proof.signatureValue, "base64");
  } catch {
    return { valid: false, reason: "proof.verificationMethod or signatureValue is not valid base64" };
  }
  if (providedPublicKey.length !== 32) return { valid: false, reason: "verificationMethod is not a 32-byte Ed25519 key" };

  const { publicKeyRaw: expectedPublicKey } = deriveSigningKeyPair();
  if (!providedPublicKey.equals(expectedPublicKey)) {
    return { valid: false, reason: "verificationMethod does not match this platform's issuer key — not issued here" };
  }

  const { proof: _proof, ...unsigned } = c;
  const canonical = stableStringify(unsigned);
  const publicKey = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, providedPublicKey]), format: "der", type: "spki" });

  const signatureValid = verify(null, Buffer.from(canonical), publicKey, signature);
  return signatureValid
    ? { valid: true }
    : { valid: false, reason: "Signature does not match this content — the credential has been altered since it was issued" };
}
