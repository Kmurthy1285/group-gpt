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
  participants?: Array<{
    user_id: string;
    user_profiles: {
      display_name: string;
    };
  }>;
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
  const [lastLoadTime, setLastLoadTime] = useState<number>(0);

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
      
      // Only load rooms if we don't have them or they're stale (older than 30 seconds)
      const now = Date.now();
      if (rooms.length === 0 || (now - lastLoadTime) > 30000) {
        await loadRooms(user.id);
        setLastLoadTime(now);
      }
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

    // Get message counts, last messages, and participants for each room
    const roomsWithStats = await Promise.all(
      Array.from(allRooms.values()).map(async (room) => {
        const { data: messages } = await supabase
          .from('messages')
          .select('content, created_at')
          .eq('room_id', room.id)
          .order('created_at', { ascending: false })
          .limit(1);

        // Get participants
        const { data: participants } = await supabase
          .from('room_participants')
          .select(`
            user_id,
            user_profiles (
              display_name
            )
          `)
          .eq('room_id', room.id);

        return {
          ...room,
          message_count: messages?.length || 0,
          last_message: messages?.[0]?.content,
          last_message_at: messages?.[0]?.created_at,
          participants: participants || []
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

  const refreshRooms = async () => {
    if (user) {
      await loadRooms(user.id);
      setLastLoadTime(Date.now());
    }
  };

  // Refresh rooms when user returns to the page
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (user && (now - lastLoadTime) > 10000) { // Refresh if older than 10 seconds
        refreshRooms();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, lastLoadTime]);

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

  const leaveRoom = async (roomId: string, roomName: string) => {
    if (!user) return;
    
    try {
      const supabase = supabaseClient();
      
      // Check how many participants are in the room
      const { data: participants, error: participantsError } = await supabase
        .from('room_participants')
        .select('user_id')
        .eq('room_id', roomId);
        
      if (participantsError) throw participantsError;
      
      const participantCount = participants?.length || 0;
      
      // If this is the last person, warn them
      if (participantCount === 1) {
        const confirmed = confirm(
          `You are the last person in "${roomName}". Leaving will permanently delete this chat and all its messages. Are you sure you want to continue?`
        );
        
        if (!confirmed) return;
        
        // Delete the entire room and all its messages
        const { error: deleteError } = await supabase
          .from('rooms')
          .delete()
          .eq('id', roomId);
          
        if (deleteError) throw deleteError;
        
        alert('Chat deleted successfully.');
      } else {
        // Just remove the user from the room
        const { error: leaveError } = await supabase
          .from('room_participants')
          .delete()
          .eq('room_id', roomId)
          .eq('user_id', user.id);
          
        if (leaveError) throw leaveError;
        
        alert('Left chat successfully.');
      }
      
      // Reload the rooms list
      await loadRooms(user.id);
      setLastLoadTime(Date.now());
      
    } catch (error) {
      console.error('Error leaving room:', error);
      alert('Failed to leave chat. Please try again.');
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
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px',
          backgroundColor: 'rgba(255, 255, 255, 0.6)',
          borderRadius: '16px',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #e0f2fe',
            borderTop: '3px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginRight: '16px'
          }} />
          <span style={{
            fontSize: '16px',
            color: '#64748b',
            fontWeight: '500'
          }}>
            Loading your chats...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
          padding: '24px',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: '16px',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <div>
            <h1 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#1e40af',
              margin: '0 0 4px 0',
              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Welcome back, {profile?.display_name || 'User'}! 👋
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#64748b',
              margin: 0
            }}>
              Ready to start a new conversation?
            </p>
          </div>
          
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center'
          }}>
            <button
              onClick={refreshRooms}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                color: '#64748b',
                fontSize: '14px',
                fontWeight: '500',
                border: '1px solid rgba(100, 116, 139, 0.2)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                e.currentTarget.style.color = '#475569';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                e.currentTarget.style.color = '#64748b';
              }}
            >
              🔄 Refresh
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: 'white',
                fontSize: '16px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.3)';
              }}
            >
              ✨ New Chat
            </button>
            
            <button
              onClick={handleSignOut}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                color: '#64748b',
                fontSize: '14px',
                fontWeight: '500',
                border: '1px solid rgba(100, 116, 139, 0.2)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                e.currentTarget.style.color = '#475569';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                e.currentTarget.style.color = '#64748b';
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
            color: '#1e40af',
            marginBottom: '20px',
            paddingLeft: '8px'
          }}>
            Your Conversations 💬
          </h2>
          
          {rooms.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 40px',
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              borderRadius: '20px',
              backdropFilter: 'blur(10px)',
              border: '2px dashed rgba(59, 130, 246, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                fontSize: '64px',
                marginBottom: '20px'
              }}>
                💭
              </div>
              <h3 style={{
                fontSize: '22px',
                fontWeight: '700',
                color: '#1e40af',
                marginBottom: '12px'
              }}>
                No conversations yet
              </h3>
              <p style={{
                fontSize: '16px',
                color: '#64748b',
                marginBottom: '24px',
                lineHeight: '1.5'
              }}>
                Start your first group chat and invite friends to collaborate!
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  padding: '16px 32px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.3)';
                }}
              >
                ✨ Create Your First Chat
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gap: '20px',
              gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))'
            }}>
              {rooms.map(room => {
                const participantNames = room.participants?.map(p => p.user_profiles?.display_name).filter(Boolean) || [];
                const participantCount = participantNames.length;
                const displayParticipants = participantCount > 3 
                  ? `${participantNames.slice(0, 3).join(', ')} +${participantCount - 3} more`
                  : participantNames.join(', ');

                return (
                  <div
                    key={room.id}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderRadius: '16px',
                      padding: '24px',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15)';
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1)';
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                    }}
                    onClick={() => router.push(`/room/${room.id}`)}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: '16px'
                    }}>
                      <div style={{ flex: 1 }}>
                        <h3 style={{
                          fontSize: '18px',
                          fontWeight: '700',
                          color: '#1e40af',
                          margin: '0 0 8px 0',
                          lineHeight: '1.3'
                        }}>
                          {room.name}
                        </h3>
                        
                        {/* Participants */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '12px'
                        }}>
                          <span style={{
                            fontSize: '12px',
                            color: '#64748b',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            fontWeight: '500'
                          }}>
                            👥 {participantCount} {participantCount === 1 ? 'person' : 'people'}
                          </span>
                        </div>
                        
                        {displayParticipants && (
                          <p style={{
                            fontSize: '13px',
                            color: '#64748b',
                            margin: '0 0 12px 0',
                            fontStyle: 'italic'
                          }}>
                            {displayParticipants}
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          leaveRoom(room.id, room.name);
                        }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: '#dc2626',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                          e.currentTarget.style.color = '#b91c1c';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.color = '#dc2626';
                        }}
                      >
                        Leave
                      </button>
                    </div>
                    
                    {room.last_message && (
                      <p style={{
                        fontSize: '14px',
                        color: '#475569',
                        marginBottom: '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: '1.4'
                      }}>
                        💬 {room.last_message}
                      </p>
                    )}
                    
                    <div style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      fontWeight: '500'
                    }}>
                      {room.last_message_at 
                        ? `Last active ${new Date(room.last_message_at).toLocaleDateString()}`
                        : `Created ${new Date(room.created_at).toLocaleDateString()}`
                      }
                    </div>
                  </div>
                );
              })}
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
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 'var(--radius)',
            padding: '32px',
            width: '90%',
            maxWidth: '400px',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '16px'
            }}>
              Create New Chat
            </h3>
            <input
              type="text"
              placeholder="Enter chat name..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && createRoom()}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-light)',
                fontSize: '16px',
                marginBottom: '20px'
              }}
            />
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
                  backgroundColor: 'var(--bg-secondary)',
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
                disabled={creating}
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