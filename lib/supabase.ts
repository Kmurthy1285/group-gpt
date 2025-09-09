import { createClient } from "@supabase/supabase-js";

export function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

export function supabaseService() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Auth helper functions
export async function signInWithGoogle(redirectTo?: string) {
  const supabase = supabaseClient();
  
  console.log('Current origin:', typeof window !== 'undefined' ? window.location.origin : 'server-side');
  
  // Build the redirect URL with optional redirect_to parameter
  let redirectUrl = typeof window !== 'undefined' ? window.location.origin : 'https://group-gpt-eta.vercel.app';
  if (redirectTo) {
    redirectUrl += `/auth/callback?redirect_to=${encodeURIComponent(redirectTo)}`;
  } else {
    redirectUrl += '/auth/callback';
  }
  
  // Force the redirect to use the current production URL
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl
    }
  });
  return { data, error };
}

export async function signOut() {
  const supabase = supabaseClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const supabase = supabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

export async function getUserProfile(userId: string) {
  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

