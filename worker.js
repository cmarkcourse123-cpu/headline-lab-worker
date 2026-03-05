export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "https://cmarkcourse123-cpu.github.io",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Vary": "Origin",
        },
      });
    }

    if (url.pathname !== "/headline-lab") {
      return new Response("Not found", { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { product, audience, tone = "Bold", style = "Curiosity" } = body;

    if (!product || !audience) {
      return new Response(JSON.stringify({ error: "Missing product or audience" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://cmarkcourse123-cpu.github.io",
          "Vary": "Origin",
        },
      });
    }

    const prompt = `
Generate 10 marketing headlines.

Product: ${product}
Audience: ${audience}
Tone: ${tone}
Style: ${style}

Return ONLY valid JSON:
{"items":[{"headline":"...","scores":{"four_u":8,"clarity":9,"ctr_potential":8},"notes":"..."}]}
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        max_output_tokens: 900,
      }),
    });

const data = await r.json();

// 1) Extract the model text from Responses API structure
// Cloudflare / REST payload usually contains output[].content[].text
const text =
  data.output_text ||
  (Array.isArray(data.output)
    ? data.output
        .map(o => (Array.isArray(o.content) ? o.content.map(c => c.text || "").join("") : ""))
        .join("\n")
    : "");

// 2) Parse that text as JSON (your prompt tells the model to output JSON)
let inner;
try {
  inner = JSON.parse((text || "").trim());
} catch (e) {
  // If the model didn't return valid JSON, return a helpful debug payload
  return new Response(
    JSON.stringify({
      error: "Model did not return valid JSON",
      parse_error: String(e),
      extracted_text: text,
      raw: data,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://cmarkcourse123-cpu.github.io",
        "Vary": "Origin",
      },
    }
  );
}

// 3) Return the shape your frontend expects
return new Response(
  JSON.stringify({
    model: data.model || "unknown",
    items: Array.isArray(inner.items) ? inner.items : [],
    usage: data.usage || null,
  }),
  {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "https://cmarkcourse123-cpu.github.io",
      "Vary": "Origin",
    },
  }
);
