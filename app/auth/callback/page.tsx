"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("Processing authentication...");

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const supabase = supabaseClient();
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          setStatus("Authentication failed. Redirecting to login...");
          setTimeout(() => router.push('/login'), 2000);
          return;
        }

        if (data.session) {
          setStatus("Authentication successful! Redirecting...");
          setTimeout(() => router.push('/dashboard'), 1000);
        } else {
          setStatus("No session found. Redirecting to login...");
          setTimeout(() => router.push('/login'), 2000);
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        setStatus("Authentication failed. Redirecting to login...");
        setTimeout(() => router.push('/login'), 2000);
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid #e5e7eb',
        borderTop: '3px solid #3b82f6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <div style={{
        fontSize: '18px',
        color: 'var(--text-primary)',
        textAlign: 'center'
      }}>
        {status}
      </div>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
