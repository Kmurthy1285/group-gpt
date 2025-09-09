"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseClient, getCurrentUser, getUserProfile } from "@/lib/supabase";

type Message = { id: number; user_name: string; role: "user"|"assistant"|"system"; content: string; created_at: string };

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sb = supabaseClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isParticipant, setIsParticipant] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      console.log('Auth check starting for room:', id);
      
      const { user } = await getCurrentUser();
      if (!user) {
        // Redirect to login with the current room URL as redirect parameter
        router.push(`/login?redirect_to=${encodeURIComponent(`/room/${id}`)}`);
        return;
      }
      
      setUser(user);
      
      // Get user profile
      const { data: profileData } = await getUserProfile(user.id);
      setProfile(profileData);
      
      // Use fresh supabase client instead of the sb prop
      const supabase = supabaseClient();
      
      // Get room info
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', id)
        .single();
        
      if (!roomData) {
        router.push('/dashboard');
        return;
      }
      
      setRoom(roomData);
      
      // Check if user is a participant, if not redirect to dashboard
      const { data: participant } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_id', id)
        .eq('user_id', user.id)
        .single();
        
      if (!participant) {
        // User is not a participant, auto-join them (for invite links)
        try {
          const { error } = await supabase
            .from('room_participants')
            .insert({
              room_id: id,
              user_id: user.id
            });

          if (error) throw error;
          
          setIsParticipant(true);
          
          // Load messages after successful auto-join
          try {
            console.log('Loading messages for room after auto-join:', id);
            const { data } = await supabase.from("messages").select("*").eq("room_id", id).order("created_at", { ascending: true });
            setMessages((data as any) || []);
            setMessagesLoaded(true);
            console.log('Messages loaded successfully after auto-join, count:', data?.length || 0);
          } catch (error) {
            console.error('Error loading messages after auto-join:', error);
          }
          
        } catch (error) {
          console.error('Error joining room:', error);
          // If auto-join fails, show join button
          setIsParticipant(false);
        }
        setRoom(roomData);
        setLoading(false);
        return;
      }
      
      setIsParticipant(true);
      
      // Load messages here, only once when auth is complete
      try {
        console.log('Loading messages for room:', id);
        const { data } = await supabase.from("messages").select("*").eq("room_id", id).order("created_at", { ascending: true });
        setMessages((data as any) || []);
        setMessagesLoaded(true);
        console.log('Messages loaded successfully, count:', data?.length || 0);
      } catch (error) {
        console.error('Error loading messages:', error);
      }
      
      setLoading(false);
    };
    
    checkAuth();
  }, [id, router]); // Removed 'sb' from dependencies

  // Set up realtime typing indicators (separate from message loading)
  useEffect(() => {
    if (!user || !isParticipant) return;
    
    console.log('Setting up typing indicators for room:', id);
    
    const supabase = supabaseClient();
    const channel = supabase
      .channel(`typing:${id}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        const { user_name, is_typing } = payload.payload;
        if (user_name !== profile?.display_name) { // Don't show our own typing
          setTypingUsers(prev => {
            if (is_typing) {
              return prev.includes(user_name) ? prev : [...prev, user_name];
            } else {
              return prev.filter(user => user !== user_name);
            }
          });
        }
      })
      .subscribe((status) => {
        console.log('Typing channel status:', status);
      });

    return () => {
      console.log('Cleaning up typing channel');
      supabase.removeChannel(channel);
    };
  }, [id, user, isParticipant, profile?.display_name]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // Cleanup typing indicator on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Send stop typing event when component unmounts
      if (profile) {
        sendTypingEvent(false);
      }
    };
  }, [profile]);

  const send = async () => {
    const text = input.trim();
    if (!text || !profile) return;
    setInput("");
    
    // Stop typing indicator when sending message
    sendTypingEvent(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Create a temporary message object for immediate UI update
    const tempMessage = {
      id: Date.now(), // Temporary ID
      user_name: profile.display_name,
      user_id: user.id,
      role: "user" as const,
      content: text,
      created_at: new Date().toISOString()
    };
    
    // Add message to local state immediately for instant UI update
    setMessages(prev => [...prev, tempMessage]);
    
    try {
      const response = await fetch(`/api/rooms/${id}/send`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
          user_name: profile.display_name, 
          user_id: user.id,
          content: text 
        }) 
      });
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      // Optionally reload messages to get the real message with proper ID
      // This ensures we have the correct message data from the server
      const supabase = supabaseClient();
      const { data } = await supabase.from("messages").select("*").eq("room_id", id).order("created_at", { ascending: true });
      setMessages((data as any) || []);
      
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove the temporary message if sending failed
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      alert('Failed to send message. Please try again.');
    }
  };

  const handleJoinRoom = async () => {
    if (!user) return;
    
    try {
      const { error } = await sb
        .from('room_participants')
        .insert({
          room_id: id,
          user_id: user.id
        });

      if (error) throw error;
      
      setIsParticipant(true);
    } catch (error) {
      console.error('Error joining room:', error);
      alert('Failed to join room. Please try again.');
    }
  };

  const sendEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  // Typing indicator functions
  const sendTypingEvent = (isTyping: boolean) => {
    if (!profile?.display_name) return;
    
    const supabase = supabaseClient();
    const channel = supabase.channel(`typing:${id}`);
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_name: profile.display_name, is_typing: isTyping }
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    
    // Send typing start event
    if (value.length > 0) {
      sendTypingEvent(true);
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set timeout to stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingEvent(false);
      }, 2000);
    } else {
      // If input is empty, stop typing immediately
      sendTypingEvent(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const inviteUrl = typeof window !== 'undefined' ? window.location.href : "";

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)'
      }}>
        <div style={{
          fontSize: '18px',
          color: 'var(--text-secondary)'
        }}>
          Loading chat...
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
      {/* Room Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '16px 0',
        borderBottom: '1px solid var(--border-light)',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-light)',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ←
          </button>
          <div>
            <h2 style={{ 
              fontSize: '18px', 
              fontWeight: '600',
              color: 'var(--text-primary)',
              margin: 0
            }}>
              {room?.name || 'Chat Room'}
            </h2>
          </div>
        </div>
        <button 
          style={{
            fontSize: '14px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer'
          }}
          onClick={() => navigator.clipboard.writeText(inviteUrl)}
        >
          📋 Copy invite link
        </button>
      </div>

      {/* Join Room UI */}
      {!isParticipant && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)',
          marginBottom: '16px'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '8px'
          }}>
            Join "{room?.name || 'Chat Room'}"
          </h3>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            You're not a member of this chat yet. Click below to join the conversation.
          </p>
          <button
            onClick={handleJoinRoom}
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-message-user)',
              color: 'var(--text-message-user)',
              fontSize: '16px',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            Join Chat
          </button>
        </div>
      )}

      {/* Messages Container */}
      {isParticipant && (
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
            const isCurrentUser = m.user_name === profile?.display_name;
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
          
          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '18px',
              marginTop: '8px',
              alignSelf: 'flex-start',
              maxWidth: '200px'
            }}>
              <div style={{
                display: 'flex',
                gap: '2px'
              }}>
                <div style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: 'var(--text-secondary)',
                  borderRadius: '50%',
                  animation: 'typing 1.4s infinite ease-in-out'
                }} />
                <div style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: 'var(--text-secondary)',
                  borderRadius: '50%',
                  animation: 'typing 1.4s infinite ease-in-out 0.2s'
                }} />
                <div style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: 'var(--text-secondary)',
                  borderRadius: '50%',
                  animation: 'typing 1.4s infinite ease-in-out 0.4s'
                }} />
              </div>
              <span style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontStyle: 'italic'
              }}>
                {typingUsers.length === 1 
                  ? `${typingUsers[0]} is typing...`
                  : `${typingUsers.length} people are typing...`
                }
              </span>
            </div>
          )}
          
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
            onChange={handleInputChange} 
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
      )}

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
