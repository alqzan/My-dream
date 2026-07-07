// مدار — Gemini proxy (Cloudflare Worker).
//
// Holds the Gemini API key server-side (never in the browser) and streams the
// model's reply back to the app as plain UTF-8 text. Free to run on Cloudflare
// Workers' free tier, using Google's free Gemini tier.
//
// Deploy: see worker/README.md. Required secret: GEMINI_API_KEY.
// Optional var: GEMINI_MODEL (default "gemini-2.0-flash").

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });
    if (!env.GEMINI_API_KEY) return new Response("GEMINI_API_KEY not set", { status: 500, headers: CORS });

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("bad json", { status: 400, headers: CORS });
    }

    const { system = "", context = "", history = [], message = "" } = body;
    const model = env.GEMINI_MODEL || "gemini-2.0-flash";

    const contents = [];
    for (const h of Array.isArray(history) ? history : []) {
      const role = h.role === "model" ? "model" : "user";
      contents.push({ role, parts: [{ text: String(h.text ?? "") }] });
    }
    contents.push({ role: "user", parts: [{ text: String(message) }] });

    const systemText = context ? `${system}\n\nملخّص بيانات المستخدم:\n${context}` : system;

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!upstream.ok || !upstream.body) {
      const err = await upstream.text().catch(() => "");
      return new Response(`Gemini error ${upstream.status}: ${err.slice(0, 300)}`, {
        status: 502,
        headers: CORS,
      });
    }

    // Parse Gemini's SSE and re-emit just the text pieces as a plain stream.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";

    const stream = new ReadableStream({
      async pull(controller) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const json = trimmed.slice(5).trim();
          if (!json || json === "[DONE]") continue;
          try {
            const obj = JSON.parse(json);
            const chunk = obj?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
            if (chunk) controller.enqueue(encoder.encode(chunk));
          } catch {
            // ignore partial/non-JSON keepalive lines
          }
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: { ...CORS, "content-type": "text/plain; charset=utf-8" },
    });
  },
};
