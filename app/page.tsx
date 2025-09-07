"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { const n = localStorage.getItem("displayName"); if (n) setName(n); }, []);

  const createRoom = async () => {
    if (!name.trim()) return alert("Please enter a display name");
    localStorage.setItem("displayName", name.trim());
    setCreating(true);
    const sb = supabaseClient();
    const { data, error } = await sb.from("rooms").insert({}).select("id").single();
    setCreating(false);
    if (error) return alert(error.message);
    router.push(`/room/${data!.id}`);
  };

  const joinByUrl = async () => {
    const url = prompt("Paste a room URL or ID:");
    if (!url) return;
    const id = url.split("/").pop()?.split("?")[0] || url;
    router.push(`/room/${id}`);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '24px',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: 'var(--radius)',
        padding: '32px',
        boxShadow: 'var(--shadow-md)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <label style={{ 
          display: 'block', 
          fontSize: '14px', 
          fontWeight: '500', 
          marginBottom: '8px',
          color: 'var(--text-primary)'
        }}>
          Display name
        </label>
        <input 
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-light)',
            fontSize: '16px',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)'
          }}
          value={name} 
          onChange={e=>setName(e.target.value)} 
          placeholder="e.g., Kartik" 
        />
        <p style={{ 
          fontSize: '12px', 
          color: 'var(--text-secondary)', 
          marginTop: '8px' 
        }}>
          This is visible to others in the room.
        </p>
      </div>
      
      <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '400px' }}>
        <button 
          style={{
            flex: 1,
            padding: '12px 24px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-message-user)',
            color: 'var(--text-message-user)',
            fontSize: '16px',
            fontWeight: '500',
            boxShadow: 'var(--shadow-sm)',
            opacity: creating ? 0.7 : 1
          }}
          onClick={createRoom} 
          disabled={creating}
        >
          {creating ? 'Creating...' : 'Create room'}
        </button>
        <button 
          style={{
            flex: 1,
            padding: '12px 24px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '16px',
            fontWeight: '500',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-sm)'
          }}
          onClick={joinByUrl}
        >
          Join by link
        </button>
      </div>
      
      <div style={{ 
        fontSize: '14px', 
        color: 'var(--text-secondary)',
        textAlign: 'center',
        maxWidth: '400px',
        lineHeight: '1.6'
      }}>
        After you create a room, share the URL with friends. Everyone chats with "ChatGPT" together.
      </div>
    </div>
  );
}
