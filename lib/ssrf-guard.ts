import { lookup } from "dns/promises";
import { isIPv4, isIPv6 } from "net";

/** Blocks a webhook subscription URL from ever reaching an internal or
 * cloud-metadata address — without this, a staff user (or anyone who
 * compromises a staff session) could register a URL like
 * http://169.254.169.254/latest/meta-data/... and have the server fetch
 * it on their behalf, with the response reflected back into the staff UI
 * (lib/webhooks.ts stores responseSnippet). Checked both at subscription
 * creation (immediate feedback) and again at delivery time (defense
 * against DNS rebinding — a hostname that resolved to a public IP when
 * the subscription was created could resolve to an internal IP later). */

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed — fail closed
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 0) return true; // "this network"
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // link-local fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local fc00::/7
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — check the embedded v4 address too
    return isBlockedIPv4(normalized.replace("::ffff:", ""));
  }
  return false;
}

export class UnsafeWebhookUrlError extends Error {}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeWebhookUrlError("Not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeWebhookUrlError("Only http:// and https:// URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeWebhookUrlError("Webhook URLs can't target localhost");
  }

  // If the hostname is already a literal IP, check it directly; otherwise
  // resolve it — this is the step that catches DNS rebinding and
  // "a hostname that just happens to resolve internally" attacks.
  let addresses: { address: string; family: number }[];
  if (isIPv4(hostname) || isIPv6(hostname)) {
    addresses = [{ address: hostname, family: isIPv4(hostname) ? 4 : 6 }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new UnsafeWebhookUrlError("Could not resolve that hostname");
    }
  }

  for (const { address, family } of addresses) {
    const blocked = family === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
    if (blocked) {
      throw new UnsafeWebhookUrlError("That URL resolves to a private, internal, or metadata address — not allowed");
    }
  }
}
