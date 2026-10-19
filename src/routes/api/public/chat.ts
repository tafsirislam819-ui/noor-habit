import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

interface Body {
  messages: { role: "user" | "assistant"; content: string }[];
  context?: string;
  lang?: string;
}

export const Route = createFileRoute("/api/public/chat")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const key = process.env["VYCEAI_API_KEY"] || "sk-027318b719d9c5b6001189fd48234dbfc5cc364441d3eef9";
        const base = process.env["VYCEAI_BASE_URL"] || "https://vyceai.com/v1";
        const model = process.env["AI_MODEL"] || "claude-sonnet-4-6";
        if (!key) return Response.json({ error: "AI is not configured" }, { status: 500, headers: CORS });

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Bad request" }, { status: 400, headers: CORS });
        }
        const messages = (body.messages ?? []).slice(-20).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
        if (!messages.length) return Response.json({ error: "No message" }, { status: 400, headers: CORS });

        const system = `You are Noor, a warm Islamic habit and routine coach inside a habit app. Reply in ${body.lang === "en" ? "English" : "Bangla"} unless the user writes otherwise. Help plan routines around the 5 daily prayers, talk freely about habits, and answer questions about the user's records using ONLY the data below. If data for a date is missing, say so honestly.\n\nUSER DATA:\n${(body.context ?? "").slice(0, 12000)}`;

        const r = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages] }),
        });
        if (!r.ok) {
          const text = await r.text();
          console.error(`AI provider error [${r.status}]: ${text}`);
          return Response.json({ error: `AI provider error (${r.status})` }, { status: r.status, headers: CORS });
        }
        const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        return Response.json({ reply: data.choices?.[0]?.message?.content ?? "" }, { headers: CORS });
      },
    },
  },
});
