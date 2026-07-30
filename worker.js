export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method === "GET") return new Response("phos-ai v2 ok", { headers: cors });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    body.model = "claude-sonnet-4-6";
    body.max_tokens = Math.min(Number(body.max_tokens) || 700, 1000);
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await upstream.text();
    return new Response(data, { status: upstream.status, headers: { ...cors, "Content-Type": "application/json" } });
  },
};
