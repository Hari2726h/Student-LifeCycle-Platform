// Thin REST wrapper around Gemini — deliberately not the SDK, so this
// doesn't add a dependency for one feature. The API key comes from
// process.env.GEMINI_API_KEY only; nothing in this file ever accepts a
// key as an argument or logs one, so there is no path by which a key
// pasted elsewhere (chat, a screenshot) could end up wired in here — the
// user sets it directly in their own .env, the one place a secret like
// this belongs.
const DEFAULT_MODEL = "gemini-2.0-flash";

export type GeminiResult = { ok: true; text: string } | { ok: false; error: string };

export async function askGemini(prompt: string): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "AI features aren't configured — add GEMINI_API_KEY to your .env to enable this.",
    };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // Never surface the raw response — it's plausible for Google's error
      // body to echo back query-string content and we'd rather not risk
      // reflecting anything key-shaped to the browser.
      return { ok: false, error: `AI request failed (${res.status})` };
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, error: "AI returned an empty response" };
    }
    return { ok: true, text: text.trim() };
  } catch {
    return { ok: false, error: "Could not reach the AI service" };
  }
}
