import { describe, it, expect, vi } from "vitest";
import { validateUpload, describeUploadError, UploadValidationError } from "@/lib/storage";

const MB = 1024 * 1024;

describe("validateUpload", () => {
  it("accepts a normal PDF under the size cap", () => {
    expect(validateUpload("application/pdf", 2 * MB)).toBeNull();
  });

  it("accepts images", () => {
    expect(validateUpload("image/jpeg", 1 * MB)).toBeNull();
    expect(validateUpload("image/png", 500_000)).toBeNull();
  });

  it("rejects a file right at the 8MB boundary", () => {
    expect(validateUpload("application/pdf", 8 * MB)).toBeNull();
    expect(validateUpload("application/pdf", 8 * MB + 1)).not.toBeNull();
  });

  it("rejects an oversized upload — the spec's named edge case", () => {
    const error = validateUpload("application/pdf", 50 * MB);
    expect(error).toBe("File must be under 8MB");
  });

  it("rejects zero-byte and negative sizes", () => {
    expect(validateUpload("application/pdf", 0)).not.toBeNull();
    expect(validateUpload("application/pdf", -1)).not.toBeNull();
  });

  it("rejects disallowed mime types even when the size is fine", () => {
    expect(validateUpload("application/x-msdownload", 1024)).toBe("Only images and PDFs are allowed");
    expect(validateUpload("text/html", 1024)).not.toBeNull();
  });

  it("does not accept a spoofed mime type that merely starts with 'image'", () => {
    // Guards against a prefix-match bug like `.startsWith("image/")` being
    // satisfied by something that isn't actually one of the two allowed kinds.
    expect(validateUpload("application/pdfx", 1024)).not.toBeNull();
  });
});

describe("describeUploadError — the outage/bad-input boundary", () => {
  it("passes a validation error through verbatim — it's our own safe message", () => {
    expect(describeUploadError(new UploadValidationError("File must be under 8MB"))).toBe("File must be under 8MB");
  });

  it("never exposes a raw infrastructure error (connection, host, port) to the user", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new Error("connect ECONNREFUSED 127.0.0.1:9090");
    const shown = describeUploadError(raw);
    expect(shown).not.toContain("ECONNREFUSED");
    expect(shown).not.toContain("127.0.0.1");
    expect(shown).toBe("Something went wrong with the upload. Please try again in a moment.");
    expect(spy).toHaveBeenCalledWith("Upload failed:", raw); // still logged for us to debug
    spy.mockRestore();
  });

  it("falls back to the same generic message for a non-Error throw", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(describeUploadError("some string someone threw")).toBe(
      "Something went wrong with the upload. Please try again in a moment.",
    );
    spy.mockRestore();
  });
});
