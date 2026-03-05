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

    return new Response(data.output_text || JSON.stringify({ error: "No output_text", raw: data }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://cmarkcourse123-cpu.github.io",
        "Vary": "Origin",
      },
    });
  },
};