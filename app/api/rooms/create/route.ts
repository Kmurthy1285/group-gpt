import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function POST() {
  const sb = supabaseService();
  const { data, error } = await sb.from("rooms").insert({}).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data!.id });
}

