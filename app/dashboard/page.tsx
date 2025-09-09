"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient, signOut, getCurrentUser, getUserProfile } from "@/lib/supabase";

type Room = {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  message_count?: number;
  last_message?: string;
  last_message_at?: string;
};

type UserProfile = {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { user } = await getCurrentUser();
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUser(user);
      
      // Get user profile
      const { data: profileData } = await getUserProfile(user.id);
      setProfile(profileData);
      
      // Load user's rooms
      await loadRooms(user.id);
      setLoading(false);
    };
    
    checkAuth();
  }, [router]);

  const loadRooms = async (userId: string) => {
    const supabase = supabaseClient();
    
    // Get rooms where user is a participant
    const { data: participantRooms } = await supabase
      .from('room_participants')
      .select(`
        room_id,
        rooms (
          id,
          name,
          created_at,
          created_by
        )
      `)
      .eq('user_id', userId);

    // Get rooms created by user
    const { data: createdRooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('created_by', userId);

    // Combine and deduplicate rooms
    const allRooms = new Map();
    
    // Add created rooms
    createdRooms?.forEach(room => {
      allRooms.set(room.id, room);
    });
    
    // Add participant rooms
    participantRooms?.forEach((participant: any) => {
      if (participant.rooms) {
        allRooms.set(participant.rooms.id, participant.rooms);
      }
    });

    // Get message counts and last messages for each room
    const roomsWithStats = await Promise.all(
      Array.from(allRooms.values()).map(async (room) => {
        const { data: messages } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('room_id', room.id)
          .order('created_at', { ascending: false })
          .limit(1);

        return {
          ...room,
          message_count: messages?.length || 0,
          last_message: messages?.[0]?.content,
          last_message_at: messages?.[0]?.created_at
        };
      })
    );

    // Sort by last activity
    roomsWithStats.sort((a, b) => 
      new Date(b.last_message_at || b.created_at).getTime() - 
      new Date(a.last_message_at || a.created_at).getTime()
    );

    setRooms(roomsWithStats);
  };

  const createRoom = async () => {
    if (!newRoomName.trim() || !user) return;
    
    setCreating(true);
    try {
      const supabase = supabaseClient();
      
      // Create room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: newRoomName.trim(),
          created_by: user.id
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Add creator as participant
      const { error: participantError } = await supabase
        .from('room_participants')
        .insert({
          room_id: room.id,
          user_id: user.id
        });

      if (participantError) throw participantError;

      // Redirect to room
      router.push(`/room/${room.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setCreating(false);
      setShowCreateModal(false);
      setNewRoomName("");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

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
          Loading your chats...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border-light)'
        }}>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              marginBottom: '4px'
            }}>
              💬 GroupGPT
            </h1>
            <p style={{
              fontSize: '16px',
              color: 'var(--text-secondary)'
            }}>
              Welcome back, {profile?.display_name || 'User'}!
            </p>
          </div>
          
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center'
          }}>
            <button
              onClick={() => setShowCreateModal(true)}
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
              + New Chat
            </button>
            
            <button
              onClick={handleSignOut}
              style={{
                padding: '12px 24px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '16px',
                fontWeight: '500',
                border: '1px solid var(--border-light)',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Rooms List */}
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '16px'
          }}>
            Your Chats
          </h2>
          
          {rooms.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 20px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-md)'
            }}>
              <div style={{
                fontSize: '48px',
                marginBottom: '16px'
              }}>
                💬
              </div>
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                marginBottom: '8px'
              }}>
                No chats yet
              </h3>
              <p style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                marginBottom: '24px'
              }}>
                Create your first group chat to get started
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
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
                Create Your First Chat
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gap: '16px'
            }}>
              {rooms.map(room => (
                <div
                  key={room.id}
                  onClick={() => router.push(`/room/${room.id}`)}
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius)',
                    padding: '20px',
                    boxShadow: 'var(--shadow-md)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: '1px solid transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: 'var(--text-primary)'
                    }}>
                      {room.name}
                    </h3>
                    <span style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace'
                    }}>
                      {room.id.slice(0, 8)}
                    </span>
                  </div>
                  
                  {room.last_message && (
                    <p style={{
                      fontSize: '14px',
                      color: 'var(--text-secondary)',
                      marginBottom: '8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {room.last_message}
                    </p>
                  )}
                  
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)'
                  }}>
                    {room.last_message_at 
                      ? `Last active ${new Date(room.last_message_at).toLocaleDateString()}`
                      : `Created ${new Date(room.created_at).toLocaleDateString()}`
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius)',
            padding: '32px',
            boxShadow: 'var(--shadow-md)',
            width: '100%',
            maxWidth: '400px'
          }}>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '16px',
              color: 'var(--text-primary)',
              textAlign: 'center'
            }}>
              Create New Chat
            </h3>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '8px',
                color: 'var(--text-primary)'
              }}>
                Chat Name
              </label>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g., Project Planning, Book Club, etc."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-light)',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    createRoom();
                  }
                }}
                autoFocus
              />
            </div>
            
            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewRoomName("");
                }}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  fontWeight: '500',
                  border: '1px solid var(--border-light)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={createRoom}
                disabled={!newRoomName.trim() || creating}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-message-user)',
                  color: 'var(--text-message-user)',
                  fontSize: '16px',
                  fontWeight: '500',
                  border: 'none',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.7 : 1
                }}
              >
                {creating ? 'Creating...' : 'Create Chat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
