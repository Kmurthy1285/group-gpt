import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { callOpenAI } from "@/lib/ai";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const roomId = params.id;
  const { content, user_name } = await req.json();
  const sb = supabaseService();

  // 1) Save the user's message
  const { error: e1 } = await sb.from("messages").insert({ room_id: roomId, user_name, role: "user", content });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

  // 2) Fetch recent history for context
  const { data: history } = await sb.from("messages").select("role,content,user_name").eq("room_id", roomId).order("created_at", { ascending: true }).limit(50);
  
  // Get unique user names from the conversation
  const userNames = [...new Set(history?.filter((msg: any) => msg.role === 'user').map((msg: any) => msg.user_name) || [])];
  const userNameList = userNames.length > 0 ? userNames.join(', ') : 'users';
  
  // Create system message with user context
  const systemMessage = {
    role: "system", 
    content: `You are ChatGPT in a group chat with ${userNameList}. Be concise, friendly, and mention names when replying to specific people. Keep responses conversational and helpful. The current user who just sent a message is ${user_name}.`
  };
  
  // Format messages for OpenAI (include user names in content)
  const formattedMessages = history?.map((msg: any) => ({
    role: msg.role,
    content: msg.role === 'user' ? `${msg.user_name}: ${msg.content}` : msg.content
  })) || [];
  
  const messages = [systemMessage, ...formattedMessages];

  // 3) Get assistant reply
  let reply = "";
  try { reply = await callOpenAI(messages as any); } catch (err: any) { reply = `⚠️ OpenAI error: ${err.message}`; }

  // 4) Save assistant message
  const { error: e2 } = await sb.from("messages").insert({ room_id: roomId, user_name: "ChatGPT", role: "assistant", content: reply });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
