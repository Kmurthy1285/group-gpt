import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { callOpenAI } from "@/lib/ai";

// Function to determine if AI should skip responding to a message
function shouldSkipAIResponse(content: string, userNames: string[], currentUser: string): boolean {
  const message = content.toLowerCase().trim();
  
  // Skip if message is very short (likely just acknowledgments)
  if (message.length < 10) return true;
  
  // Skip if message starts with direct address patterns
  const directAddressPatterns = [
    /^@\w+/,  // @username
    /^hey\s+\w+/i,  // Hey John
    /^hi\s+\w+/i,   // Hi Sarah
    /^hello\s+\w+/i, // Hello Mike
    /^\w+[,:]/,     // John, or John:
    /^dear\s+\w+/i, // Dear Alice
  ];
  
  for (const pattern of directAddressPatterns) {
    if (pattern.test(message)) {
      // Check if the addressed person is not the current user
      const match = message.match(pattern);
      if (match) {
        const addressedName = match[0].replace(/[@,:]/g, '').trim().toLowerCase();
        // If it's clearly addressing someone else, skip AI response
        if (userNames.some(name => name.toLowerCase() === addressedName) && addressedName !== currentUser.toLowerCase()) {
          return true;
        }
      }
    }
  }
  
  // Skip if message contains private conversation indicators
  const privateIndicators = [
    /private/i,
    /between us/i,
    /just between/i,
    /don't tell/i,
    /keep this/i,
    /confidential/i,
    /secret/i,
  ];
  
  for (const indicator of privateIndicators) {
    if (indicator.test(message)) {
      return true;
    }
  }
  
  // Skip if message is asking a specific person a personal question
  const personalQuestionPatterns = [
    /how are you\?/i,
    /how's your/i,
    /how was your/i,
    /did you have/i,
    /are you going/i,
    /will you be/i,
    /can you help me/i,
    /do you have/i,
    /what do you think/i,
  ];
  
  // Only skip if it's clearly directed at someone specific
  if (personalQuestionPatterns.some(pattern => pattern.test(message))) {
    // Check if message contains a specific name
    const hasSpecificName = userNames.some(name => 
      name.toLowerCase() !== currentUser.toLowerCase() && 
      message.includes(name.toLowerCase())
    );
    if (hasSpecificName) {
      return true;
    }
  }
  
  return false;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const roomId = params.id;
  const { content, user_name, user_id } = await req.json();
  const sb = supabaseService();

  // 1) Save the user's message
  const { error: e1 } = await sb.from("messages").insert({ 
    room_id: roomId, 
    user_name, 
    user_id,
    role: "user", 
    content 
  });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

  // 2) Fetch recent history for context
  const { data: history } = await sb.from("messages").select("role,content,user_name").eq("room_id", roomId).order("created_at", { ascending: true }).limit(50);
  
  // Get unique user names from the conversation
  const userNames = [...new Set(history?.filter((msg: any) => msg.role === 'user').map((msg: any) => msg.user_name) || [])];
  const userNameList = userNames.length > 0 ? userNames.join(', ') : 'users';
  
  // Check if the message is clearly addressed to someone else
  const shouldSkipAI = shouldSkipAIResponse(content, userNames, user_name);
  
  if (shouldSkipAI) {
    // Skip AI response for messages clearly addressed to others
    return NextResponse.json({ ok: true, skipped: true });
  }
  
  // Create system message with user context
  const systemMessage = {
    role: "system", 
    content: `You are ChatGPT in a group chat with ${userNameList}. Be concise, friendly, and mention names when replying to specific people. Keep responses conversational and helpful. The current user who just sent a message is ${user_name}.

IMPORTANT: Only respond when the message seems to be directed at you, the group, or is asking for general help. Do NOT respond to:
- Messages clearly addressed to specific people (like "Hey John, how are you?")
- Private conversations between users
- Very short acknowledgments (like "ok", "thanks", "lol")
- Personal questions directed at specific individuals

If you're unsure whether to respond, err on the side of not responding to avoid interrupting conversations.`
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
