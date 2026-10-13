// reCAPTCHA v3 with a v2 checkbox fallback.
// - No RECAPTCHA_SECRET set: verification is skipped (module off).
// - v3 score below RECAPTCHA_MIN_SCORE: returns { challenge: true } so the page shows the v2 checkbox
//   instead of turning a borderline real visitor away.

export async function verifyRecaptcha(token, version = "v3", ip) {
  if (!process.env.RECAPTCHA_SECRET) return { ok: true, skipped: true, score: null };

  const secret = version === "v2" ? process.env.RECAPTCHA_V2_SECRET : process.env.RECAPTCHA_SECRET;
  if (!token || !secret) return { ok: false, challenge: version === "v3", score: null };

  const params = new URLSearchParams({ secret, response: token });
  if (ip) params.set("remoteip", ip);

  let data;
  try {
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", { method: "POST", body: params });
    data = await r.json();
  } catch (err) {
    console.error("reCAPTCHA verify failed", err);
    return { ok: false, challenge: version === "v3", score: null };
  }

  if (!data.success) return { ok: false, challenge: version === "v3", score: null };
  if (version === "v2") return { ok: true, score: null };

  const min = Number.parseFloat(process.env.RECAPTCHA_MIN_SCORE || "0.5");
  return data.score >= min
    ? { ok: true, score: data.score }
    : { ok: false, challenge: true, score: data.score };
}
