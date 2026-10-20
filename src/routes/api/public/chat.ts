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
        const key = process.env["VYCEAI_API_KEY"] || "sk-8c5c0bc6d8871536b2f2bec1d549f8382e901c65d369e5d3";
        const base = process.env["VYCEAI_BASE_URL"] || "https://vyceai.com/v1";
        const model = process.env["AI_MODEL"] || "glm-5.3-flash";
        if (!key) return Response.json({ error: "AI is not configured" }, { status: 500, headers: CORS });

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Bad request" }, { status: 400, headers: CORS });
        }
        const messages = (body.messages ?? [])
          .slice(-20)
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
        if (!messages.length) return Response.json({ error: "No message" }, { status: 400, headers: CORS });

        const system = `You are Noor, a warm, supportive Islamic habit and routine coach inside Noor Habit app. Reply in ${body.lang === "en" ? "English" : "Bangla"} naturally. Help plan routines around the 5 daily prayers, talk freely about habits and goals, and answer questions using the user's records.

IN-APP ACTIONS:
If the user asks you to add a task, habit, goal, or mark prayer, include a JSON action block at the end:
\`\`\`action
{"action":"ADD_ITEM","kind":"task","title":"...","time":"HH:MM"}
\`\`\`
Or
\`\`\`action
{"action":"MARK_PRAYER","prayer":"fajr","done":true}
\`\`\`

USER DATA:
${(body.context ?? "").slice(0, 12000)}`;

        const r = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages] }),
        });

        if (!r.ok) {
          const text = await r.text();
          console.error(`AI provider error [${r.status}]: ${text}`);
          let msg = `AI provider error (${r.status})`;
          if (r.status === 402 || text.includes("insufficient_balance")) {
            msg = body.lang === "en"
              ? "Insufficient balance in AI account. Please top up VyceAI credits."
              : "এআই অ্যাকাউন্টে ব্যালেন্স অপর্যাপ্ত। অনুগ্রহ করে VyceAI ক্রেডিট রিচার্জ করুন।";
          }
          return Response.json({ error: msg }, { status: r.status, headers: CORS });
        }
        const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        return Response.json({ reply: data.choices?.[0]?.message?.content ?? "" }, { headers: CORS });
      },
    },
  },
});
