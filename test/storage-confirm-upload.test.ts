import { describe, it, expect } from "vitest";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedUploadUrl, confirmUpload } from "@/lib/storage";

// These hit the real local S3-compatible storage from docker-compose
// (`npm run db:up`) — confirmUpload's whole job is to not trust anything
// a caller claims, so the only honest way to test it is a real PUT.
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

async function objectExists(key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    return true;
  } catch {
    return false;
  }
}

describe("confirmUpload", () => {
  it("accepts a legitimate small upload and returns its real metadata", async () => {
    const { storageKey, uploadUrl } = await createPresignedUploadUrl({
      applicantId: "test-confirm-ok",
      fileName: "id.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    const body = Buffer.from("real small pdf-ish content");
    await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body });

    const result = await confirmUpload(storageKey);
    expect(result.sizeBytes).toBe(body.byteLength);
    expect(result.mimeType).toBe("application/pdf");
    expect(await objectExists(storageKey)).toBe(true);
  });

  it("rejects a file that's actually over 8MB regardless of what size was declared when requesting the URL", async () => {
    // A caller not going through our own UI could request a URL by
    // declaring a tiny size (which trivially passes the cap check) and
    // then upload something much larger — this must still be caught.
    const { storageKey, uploadUrl } = await createPresignedUploadUrl({
      applicantId: "test-confirm-oversized",
      fileName: "big.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
    });
    const nineMb = Buffer.alloc(9 * 1024 * 1024, "a");
    await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: nineMb });

    await expect(confirmUpload(storageKey)).rejects.toThrow("File must be under 8MB");
    expect(await objectExists(storageKey)).toBe(false); // cleaned up, not left orphaned
  });

  it("rejects content whose real stored type isn't an image or PDF, regardless of the declared type", async () => {
    const { storageKey, uploadUrl } = await createPresignedUploadUrl({
      applicantId: "test-confirm-wrong-type",
      fileName: "looks-like.pdf",
      mimeType: "application/pdf",
      sizeBytes: 50,
    });
    const html = Buffer.from("<script>alert(1)</script>");
    await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "text/html" }, body: html });

    await expect(confirmUpload(storageKey)).rejects.toThrow("Only images and PDFs are allowed");
    expect(await objectExists(storageKey)).toBe(false);
  });
});
