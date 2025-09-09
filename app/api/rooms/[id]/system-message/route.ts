import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { action, user_name, user_id } = await request.json();
    const roomId = params.id;

    if (!action || !user_name || !user_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = supabaseService();
    
    // Create system message based on action
    let content = "";
    if (action === "join") {
      content = `${user_name} joined the chat`;
    } else if (action === "leave") {
      content = `${user_name} left the chat`;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Insert system message
    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        user_id: user_id,
        user_name: user_name,
        role: "system",
        content: content
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating system message:", error);
      return NextResponse.json({ error: "Failed to create system message" }, { status: 500 });
    }

    return NextResponse.json({ message: data });
  } catch (error) {
    console.error("Error in system message API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
