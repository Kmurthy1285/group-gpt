"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabase";

type Message = { id: number; user_name: string; role: "user"|"assistant"|"system"; content: string; created_at: string };

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const sb = supabaseClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [tempName, setTempName] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { 
    const savedName = localStorage.getItem("displayName");
    if (savedName) {
      setName(savedName);
    } else {
      // Show name input if no saved name
      setShowNameInput(true);
    }
  }, []);

  // Load history and set up real-time subscription
  useEffect(() => {
    let channel: any;
    
    const setupRealtime = async () => {
      // Load initial messages
      const { data } = await sb.from("messages").select("*").eq("room_id", id).order("created_at", { ascending: true });
      setMessages((data as any) || []);
      
      // Set up real-time subscription
      channel = sb
        .channel(`room:${id}`)
        .on("postgres_changes", { 
          event: "INSERT", 
          schema: "public", 
          table: "messages", 
          filter: `room_id=eq.${id}` 
        }, (payload) => {
          console.log('New message received:', payload.new);
          setMessages(prev => {
            // Check if message already exists to avoid duplicates
            const exists = prev.some(msg => msg.id === payload.new.id);
            if (exists) return prev;
            return [...prev, payload.new as any];
          });
          // Scroll to bottom after a short delay to ensure DOM is updated
          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 100);
        })
        .subscribe((status) => {
          console.log('Subscription status:', status);
        });
    };
    
    setupRealtime();
    
    return () => { 
      if (channel) {
        sb.removeChannel(channel);
      }
    };
  }, [id, sb]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await fetch(`/api/rooms/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_name: name, content: text }) });
  };

  const sendEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const handleNameSubmit = () => {
    if (tempName.trim()) {
      setName(tempName.trim());
      localStorage.setItem("displayName", tempName.trim());
      setShowNameInput(false);
    }
  };

  const inviteUrl = typeof window !== 'undefined' ? window.location.href : "";

  // Show name input modal if needed
  if (showNameInput) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius)',
          padding: '32px',
          boxShadow: 'var(--shadow-md)',
          width: '90%',
          maxWidth: '400px'
        }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '16px',
            color: 'var(--text-primary)',
            textAlign: 'center'
          }}>
            Join Chat Room
          </h3>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            Enter your display name to join the conversation
          </p>
          <input
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-light)',
              fontSize: '16px',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              marginBottom: '20px'
            }}
            value={tempName}
            onChange={e => setTempName(e.target.value)}
            placeholder="Enter your name"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleNameSubmit();
              }
            }}
            autoFocus
          />
          <button
            style={{
              width: '100%',
              padding: '12px 24px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-message-user)',
              color: 'var(--text-message-user)',
              fontSize: '16px',
              fontWeight: '500',
              boxShadow: 'var(--shadow-sm)'
            }}
            onClick={handleNameSubmit}
            disabled={!tempName.trim()}
          >
            Join Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: 'calc(100vh - 120px)',
      maxHeight: '800px'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '16px 0',
        borderBottom: '1px solid var(--border-light)',
        marginBottom: '16px'
      }}>
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: '600',
          color: 'var(--text-primary)'
        }}>
          Room <span style={{ 
            fontFamily: 'monospace', 
            color: 'var(--text-secondary)',
            fontSize: '14px'
          }}>
            {id.slice(0,8)}
          </span>
        </h2>
        <button 
          style={{
            fontSize: '14px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-sm)'
          }}
          onClick={() => navigator.clipboard.writeText(inviteUrl)}
        >
          📋 Copy invite link
        </button>
      </div>

      {/* Messages Container */}
      <div style={{
        flex: 1,
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Messages Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {messages.map(m => {
            const isCurrentUser = m.user_name === name;
            const isAI = m.role === 'assistant';
            
            return (
              <div key={m.id} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
                maxWidth: '70%'
              }}>
                {/* Message Bubble */}
                <div style={{
                  backgroundColor: isCurrentUser 
                    ? 'var(--bg-message-user)' 
                    : isAI 
                      ? 'var(--bg-message-ai)'
                      : 'var(--bg-message-other)',
                  color: isCurrentUser 
                    ? 'var(--text-message-user)' 
                    : 'var(--text-message-other)',
                  padding: '12px 16px',
                  borderRadius: isCurrentUser 
                    ? '18px 18px 4px 18px' 
                    : '18px 18px 18px 4px',
                  boxShadow: 'var(--shadow-sm)',
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  fontSize: '15px',
                  lineHeight: '1.4'
                }}>
                  {m.content}
                </div>
                
                {/* Message Info */}
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  padding: '0 8px'
                }}>
                  {isAI ? '🤖 ChatGPT' : m.user_name} · {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        
        {/* Input Area */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-primary)',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-end'
        }}>
          <input 
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '20px',
              border: '1px solid var(--border-light)',
              fontSize: '15px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              resize: 'none',
              minHeight: '44px',
              maxHeight: '120px'
            }}
            value={input} 
            onChange={e=>setInput(e.target.value)} 
            onKeyDown={sendEnter} 
            placeholder="Type a message…" 
          />
          <button 
            style={{
              padding: '12px 20px',
              borderRadius: '20px',
              backgroundColor: 'var(--bg-message-user)',
              color: 'var(--text-message-user)',
              fontSize: '15px',
              fontWeight: '500',
              boxShadow: 'var(--shadow-sm)',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={send}
          >
            Send
          </button>
        </div>
      </div>

      {/* Footer Tip */}
      <p style={{ 
        fontSize: '12px', 
        color: 'var(--text-secondary)',
        textAlign: 'center',
        marginTop: '12px'
      }}>
        💡 Tip: ChatGPT joins automatically after any user message
      </p>
    </div>
  );
}
