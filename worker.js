export default {
  async fetch(request, env) {

    const classKey = request.headers.get("x-class-key");

    if (classKey !== env.CLASS_KEY) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const url = new URL(request.url);

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Only accept POST /headline-lab
    if (url.pathname !== "/headline-lab") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    // Parse input
    let body = {};
    try {
      body = await request.json();
    } catch {
      return json({ model: "error", usage: null, items: [], error: "Invalid JSON body" }, 200);
    }

    const {
      product = "",
      audience = "",
      tone = "Bold",
      style = "Curiosity",
      framework = "None",
      temperature = 0.8,
      n = 10,
    } = body;

    if (!product || !audience) {
      return json({ model: "error", usage: null, items: [], error: "Missing product or audience" }, 200);
    }

    const prompt = `
You are a senior marketing copywriter and strict evaluator.

Generate ${clampInt(n, 5, 20)} marketing headlines for:

Product/Offer: ${product}
Audience: ${audience}
Tone: ${tone}
Style: ${style}
Framework: ${framework}

Rules:
- 8–12 words each (ok if 7–14 occasionally)
- avoid deceptive clickbait
- suitable for ads or blog titles

Return ONLY valid JSON in this shape:
{
  "items": [
    {
      "headline": "…",
      "scores": { "four_u": 0, "clarity": 0, "ctr_potential": 0 },
      "notes": "…"
    }
  ]
}
`;

    // Call OpenAI Responses API
    let openai;
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
          // strongly encourages valid JSON output
          text: { format: { type: "json_object" } },
        }),
      });

      const rawText = await r.text();
      if (!r.ok) {
        return json(
          { model: "error", usage: null, items: [], error: `OpenAI error ${r.status}`, raw: rawText },
          200
        );
      }

      openai = JSON.parse(rawText);
    } catch (e) {
      return json({ model: "error", usage: null, items: [], error: `Fetch/parse error: ${String(e)}` }, 200);
    }

    // Extract model text from Responses payload
    const extractedText =
      openai.output_text ||
      (Array.isArray(openai.output)
        ? openai.output
            .map(o =>
              Array.isArray(o.content)
                ? o.content.map(c => (typeof c.text === "string" ? c.text : "")).join("")
                : ""
            )
            .join("\n")
        : "");

    // Parse the JSON the model returned
    let inner;
    try {
      inner = JSON.parse((extractedText || "").trim());
    } catch (e) {
      return json(
        {
          model: openai.model || "unknown",
          usage: openai.usage || null,
          items: [],
          error: "Model output was not valid JSON",
          extractedText,
        },
        200
      );
    }

    // Return the exact shape the frontend expects
    return json(
      {
        model: openai.model || "unknown",
        usage: openai.usage || null,
        items: Array.isArray(inner.items) ? inner.items : [],
      },
      200
    );
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://cmarkcourse123-cpu.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
