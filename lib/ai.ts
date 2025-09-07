import type { NextRequest } from "next/server";

const USE_CONVERSATIONS = false; // flip to true to use Conversations API

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function callOpenAI(messages: ChatMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!USE_CONVERSATIONS) {
    // Responses API (simple)
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: messages.map(m => ({ role: m.role, content: m.content }))
      })
    });
    if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
    const json = await resp.json();
    // Responses API returns output_text or output as array
    const text = json.output_text ?? json.output?.[0]?.content?.[0]?.text ?? "";
    return text as string;
  }

  // Conversations API (creates/updates a conversation thread)
  // Minimal single‑shot create; you could persist conversation_id per room.
  const resp = await fetch("https://api.openai.com/v1/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages
    })
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status}`);
  const json = await resp.json();
  const last = json.messages?.findLast((m: any) => m.role === "assistant");
  return last?.content?.[0]?.text ?? "";
}

