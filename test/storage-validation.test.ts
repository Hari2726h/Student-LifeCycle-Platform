import { describe, it, expect } from "vitest";
import { validateUpload } from "@/lib/storage";

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
