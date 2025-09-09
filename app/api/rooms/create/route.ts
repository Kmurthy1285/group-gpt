import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { name, user_id } = await req.json();
  
  if (!user_id) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }
  
  const sb = supabaseService();
  
  // Create room with name and creator
  const { data: room, error: roomError } = await sb
    .from("rooms")
    .insert({
      name: name || 'Untitled Chat',
      created_by: user_id
    })
    .select()
    .single();
    
  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 400 });
  }
  
  // Add creator as participant
  const { error: participantError } = await sb
    .from("room_participants")
    .insert({
      room_id: room.id,
      user_id: user_id
    });
    
  if (participantError) {
    return NextResponse.json({ error: participantError.message }, { status: 400 });
  }
  
  return NextResponse.json({ room });
}

