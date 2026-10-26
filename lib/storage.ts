import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import path from "path";

// S3-compatible object storage — LocalStack locally (docker compose up -d),
// real S3/MinIO/whatever in production via the same env vars. Nothing
// calling into this module needs to know which backend is behind it.
const BUCKET = process.env.S3_BUCKET!;

/** Thrown only for conditions a user can actually do something about (file
 * too big, wrong type). Anything else — the storage backend being
 * unreachable, a malformed key, whatever — is a real outage/bug, not
 * "bad input", and its raw message (connection strings, ports, internal
 * paths) must never reach the browser. Callers should show
 * UploadValidationError's message as-is, and anything else as a generic
 * "try again" — see app/apply/actions.ts. */
export class UploadValidationError extends Error {}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

let bucketReady: Promise<void> | null = null;

// Idempotent — there's no bucket-management sidecar in dev, so the app
// ensures its own bucket exists on first use instead.
function ensureBucket() {
  if (!bucketReady) {
    bucketReady = s3
      .send(new HeadBucketCommand({ Bucket: BUCKET }))
      .catch(() => s3.send(new CreateBucketCommand({ Bucket: BUCKET })))
      .then(() => undefined);
  }
  return bucketReady;
}

const SAFE_EXT = /^[a-zA-Z0-9]{1,8}$/;
const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = /^image\/|^application\/pdf$/;

function extensionOf(fileName: string) {
  const ext = path.extname(fileName).replace(".", "");
  return SAFE_EXT.test(ext) ? ext : "bin";
}

export function validateUpload(mimeType: string, sizeBytes: number) {
  if (sizeBytes <= 0 || sizeBytes > MAX_SIZE_BYTES) return "File must be under 8MB";
  if (!ALLOWED_MIME.test(mimeType)) return "Only images and PDFs are allowed";
  return null;
}

function buildKey(applicantId: string, fileName: string) {
  return `${applicantId}/${crypto.randomUUID()}.${extensionOf(fileName)}`;
}

/** Client uploads the bytes directly to storage with this URL — the app
 * server never sees the file. Valid for 5 minutes. */
export async function createPresignedUploadUrl(input: {
  applicantId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const error = validateUpload(input.mimeType, input.sizeBytes);
  if (error) throw new UploadValidationError(error);

  await ensureBucket();
  const storageKey = buildKey(input.applicantId, input.fileName);
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: storageKey, ContentType: input.mimeType }),
    { expiresIn: 300 },
  );
  return { storageKey, uploadUrl };
}

/** Called after the client's direct PUT succeeds. The presigned URL only
 * constrains the *request* for a URL — nothing stops a client that isn't
 * going through our own UI from requesting a URL for a small, allowed file
 * and then PUTting something completely different (bigger, wrong type).
 * So this re-validates against what's actually sitting in storage, the one
 * thing a client can't lie about — not against whatever the client claims
 * here — and deletes the object if it fails. Returns the real metadata so
 * callers store what's true, not what was asserted. */
export async function confirmUpload(storageKey: string) {
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey }));
  const sizeBytes = head.ContentLength ?? 0;
  const mimeType = head.ContentType ?? "application/octet-stream";

  const error = validateUpload(mimeType, sizeBytes);
  if (error) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }));
    throw new UploadValidationError(error);
  }

  return { sizeBytes, mimeType };
}

/** Server already holds the bytes (e.g. the volunteer-assisted form posts
 * the whole application in one go) — skip the presigned round-trip. */
export async function putObjectDirect(applicantId: string, file: File) {
  const error = validateUpload(file.type || "application/octet-stream", file.size);
  if (error) throw new UploadValidationError(error);

  await ensureBucket();
  const storageKey = buildKey(applicantId, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    }),
  );

  return {
    storageKey,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buffer.byteLength,
  };
}

/** Short-lived — the download route redirects here after its own
 * role/ownership checks, so the link can't be reused or shared usefully. */
export async function createPresignedDownloadUrl(storageKey: string, fileName: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ResponseContentDisposition: `inline; filename="${fileName.replace(/"/g, "")}"`,
    }),
    { expiresIn: 60 },
  );
}

/** The one place that decides what an upload failure gets to say to the
 * user. A validation failure is safe to show verbatim — it's one of our
 * own messages. Anything else (storage unreachable, a bad key, whatever)
 * is logged for us to look at and shown as a generic, calm message — never
 * the raw error, which can contain hosts/ports/paths. */
export function describeUploadError(err: unknown): string {
  if (err instanceof UploadValidationError) return err.message;
  console.error("Upload failed:", err);
  return "Something went wrong with the upload. Please try again in a moment.";
}
