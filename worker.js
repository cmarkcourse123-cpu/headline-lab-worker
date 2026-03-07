// worker.js — COMPLETE FILE (copy/paste entire contents)
//
// Requires Cloudflare Worker secrets:
// - OPENAI_API_KEY  (your OpenAI API key)
// - CLASS_KEY       (your class access key)
//
// Frontend must send header:
//   x-class-key: <CLASS_KEY value>
//
// This Worker only allows requests from your GitHub Pages origin:
//   https://cmarkcourse123-cpu.github.io

const ALLOWED_ORIGIN = "https://cmarkcourse123-cpu.github.io";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------- CORS Preflight ----------
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Only one route
    if (url.pathname !== "/headline-lab") {
      return withCors(new Response("Not found", { status: 404 }), request);
    }

    if (request.method !== "POST") {
      return withCors(new Response("Method not allowed", { status: 405 }), request);
    }

    // ---------- Origin allowlist ----------
    // (Note: Some clients may omit Origin; for browsers it will be present.)
    const origin = request.headers.get("Origin") || "";
    if (origin && origin !== ALLOWED_ORIGIN) {
      return withCors(
        json({ error: "Forbidden origin", origin }, 403),
        request
      );
    }

    // ---------- Class Key Guard ----------
    const classKey = request.headers.get("x-class-key");
    if (!classKey || classKey !== env.CLASS_KEY) {
      return withCors(json({ error: "Unauthorized" }, 401), request);
    }

    // ---------- Validate secrets ----------
    if (!env.OPENAI_API_KEY) {
      return withCors(json({ error: "Server missing OPENAI_API_KEY" }, 500), request);
    }
    if (!env.CLASS_KEY) {
      return withCors(json({ error: "Server missing CLASS_KEY" }, 500), request);
    }

    // ---------- Parse request JSON ----------
    let body;
    try {
      body = await request.json();
    } catch {
      return withCors(json({ error: "Invalid JSON body" }, 400), request);
    }

    const {
      product = "",
      audience = "",
      tone = "Bold",
      style = "Curiosity",
      framework = "None",
      temperature = 0.8,
      n = 10,
    } = body || {};

    if (!product || !audience) {
      return withCors(json({ error: "Missing product or audience" }, 400), request);
    }

    // ---------- Prompt ----------
const prompt = `
You are a senior content marketing copywriter and strict evaluator.

Generate marketing headlines for:
Product/Offer: ${product}
Audience: ${audience}
Tone: ${tone}
Style preference: ${style}
Framework selection from UI: ${framework}

IMPORTANT:
Instead of using only one framework, generate a comparison set using these five frameworks:
1. 4U
2. PAS
3. AIDA
4. Curiosity Gap
5. Benefit-first

Generate exactly 2 headlines for each framework, for a total of 10 headlines.

Framework definitions:
- 4U = Useful, Urgent, Unique, Ultra-specific
- PAS = Problem, Agitate, Solution
- AIDA = Attention, Interest, Desire, Action
- Curiosity Gap = create intrigue without being deceptive
- Benefit-first = lead with the clearest user benefit

Rules:
- 8–12 words each (7–14 acceptable occasionally)
- Avoid deceptive clickbait
- Suitable for ads, blog titles, or social posts
- Make framework differences noticeable
- Keep the audience in mind

Return ONLY valid JSON in this exact shape:
{
  "items": [
    {
      "framework": "4U",
      "headline": "…",
      "scores": {
        "four_u": 0,
        "clarity": 0,
        "ctr_potential": 0
      },
      "notes": "…"
    }
  ]
}

Scoring guidance:
- four_u = strength on usefulness, urgency, uniqueness, and specificity
- clarity = how instantly understandable the headline is
- ctr_potential = likely click appeal in a digital environment
- notes = one short sentence explaining why it works
`;

    // ---------- Call OpenAI Responses API ----------
    let openai;
    let rawText = "";
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          input: prompt,
          temperature: clampNum(temperature, 0, 1.2),
          max_output_tokens: 900,
          // Enforce JSON object output (reduces parse failures)
          text: { format: { type: "json_object" } },
        }),
      });

      rawText = await r.text();

      if (!r.ok) {
        return withCors(
          json(
            { error: `OpenAI error ${r.status}`, details: rawText.slice(0, 2000) },
            502
          ),
          request
        );
      }

      openai = JSON.parse(rawText);
    } catch (e) {
      return withCors(
        json({ error: "OpenAI fetch/parse failed", details: String(e), raw: rawText.slice(0, 2000) }, 502),
        request
      );
    }

    // ---------- Extract model text from Responses payload ----------
    const extractedText =
      openai.output_text ||
      (Array.isArray(openai.output)
        ? openai.output
            .map((o) =>
              Array.isArray(o.content)
                ? o.content
                    .map((c) => (typeof c.text === "string" ? c.text : ""))
                    .join("")
                : ""
            )
            .join("\n")
        : "");

    // ---------- Parse the JSON returned by the model ----------
    let inner;
    try {
      inner = JSON.parse((extractedText || "").trim());
    } catch (e) {
      // Return debug payload (still CORS-safe) so you can see what came back
      return withCors(
        json(
          {
            model: openai.model || "unknown",
            usage: openai.usage || null,
            items: [],
            error: "Model output not valid JSON",
            parse_error: String(e),
            extractedText: extractedText.slice(0, 2000),
          },
          200
        ),
        request
      );
    }

    // ---------- Return EXACT shape the frontend expects ----------
    const responsePayload = {
      model: openai.model || "unknown",
      usage: openai.usage || null,
      items: Array.isArray(inner.items) ? inner.items : [],
    };

    return withCors(json(responsePayload, 200), request);
  },
};

// ---------------- Helpers ----------------

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withCors(response, request) {
  const h = corsHeaders(request);
  Object.entries(h).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-class-key",
    "Vary": "Origin",
  };
}

function clampNum(x, min, max) {
  const n = Number(x);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampInt(x, min, max) {
  const n = Math.floor(Number(x));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
