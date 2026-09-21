// POST { token, action, secondFactorToken? } -> { success, score, action, lowScore }
//
// v3 flow: verify the invisible token, return the score.
// Soft-fallback flow: if a low-score submission then passes a visible v2
// challenge, the browser sends that token as `secondFactorToken` and this
// function verifies THAT instead — v2 verification has no `score` field,
// a `success: true` response is sufficient on its own.
//
// Requires RECAPTCHA_SECRET_KEY set in Netlify's environment variables
// (Site settings -> Environment variables). Never hardcode it here.

const SCORE_THRESHOLD = 0.5;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: "RECAPTCHA_SECRET_KEY not configured" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: "Invalid JSON body" }) };
  }

  const { token, action, secondFactorToken } = payload;

  if (secondFactorToken) {
    const result = await verifyWithGoogle(secondFactorToken, secret);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: !!result.success }),
    };
  }

  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: "Missing token" }) };
  }

  const result = await verifyWithGoogle(token, secret);

  if (!result.success) {
    return { statusCode: 200, body: JSON.stringify({ success: false, score: 0, lowScore: true }) };
  }

  if (action && result.action && result.action !== action) {
    // action mismatch can indicate the token was captured elsewhere
    return { statusCode: 200, body: JSON.stringify({ success: false, score: 0, lowScore: true }) };
  }

  const score = typeof result.score === "number" ? result.score : 0;
  const lowScore = score < SCORE_THRESHOLD;

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, score, action: result.action, lowScore }),
  };
};

async function verifyWithGoogle(token, secret) {
  const params = new URLSearchParams({ secret, response: token });
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return res.json();
}
