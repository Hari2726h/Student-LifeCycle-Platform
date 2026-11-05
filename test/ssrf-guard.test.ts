import { describe, it, expect } from "vitest";
import { assertSafeWebhookUrl, UnsafeWebhookUrlError } from "@/lib/ssrf-guard";

describe("assertSafeWebhookUrl — SSRF protection on webhook destinations", () => {
  it("rejects the AWS/GCP metadata address", async () => {
    await expect(assertSafeWebhookUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
  });

  it("rejects loopback addresses and localhost", async () => {
    await expect(assertSafeWebhookUrl("http://127.0.0.1:5432/")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
    await expect(assertSafeWebhookUrl("http://localhost:3000/hook")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
  });

  it("rejects RFC1918 private ranges", async () => {
    await expect(assertSafeWebhookUrl("http://10.0.0.5/")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
    await expect(assertSafeWebhookUrl("http://172.16.0.1/")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
    await expect(assertSafeWebhookUrl("http://192.168.1.1/")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
  });

  it("rejects IPv6 loopback and unique-local addresses", async () => {
    await expect(assertSafeWebhookUrl("http://[::1]/")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
    await expect(assertSafeWebhookUrl("http://[fd00::1]/")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
  });

  it("rejects non-http(s) schemes", async () => {
    await expect(assertSafeWebhookUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
  });

  it("rejects a malformed URL instead of throwing an unrelated error", async () => {
    await expect(assertSafeWebhookUrl("not a url")).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
  });

  it("allows a normal public address", async () => {
    await expect(assertSafeWebhookUrl("https://1.1.1.1/hook")).resolves.toBeUndefined();
  });
});
