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
      
      // Only load rooms if we don't have them or they're stale (older than 5 minutes)
      const now = Date.now();
      if (rooms.length === 0 || (now - lastLoadTime) > 300000) {
        console.log('Loading rooms - cache miss or stale');
        await loadRooms(user.id);
        setLastLoadTime(now);
      } else {
        console.log('Using cached rooms');
      }
      setLoading(false);
    };
    
    checkAuth();
  }, [router]);

  const loadRooms = async (userId: string) => {
    console.log('Loading rooms for user:', userId);
    const startTime = Date.now();
    
    const supabase = supabaseClient();
    
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 10000)
      );
      
      // Get rooms with basic info only - no messages or participants initially
      const roomsQuery = supabase
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
        
      const { data: participantRooms, error: roomsError } = await Promise.race([
        roomsQuery,
        timeoutPromise
      ]) as any;

      if (roomsError) {
        console.error('Error loading rooms:', roomsError);
        return;
      }

      if (!participantRooms || participantRooms.length === 0) {
        console.log('No rooms found');
        setRooms([]);
        return;
      }

      console.log('Found rooms:', participantRooms.length);
      
      // Convert to array of rooms
      const allRooms = participantRooms?.map((participant: any) => participant.rooms).filter(Boolean) || [];
      
      // For now, just show rooms without message stats to make it fast
      const roomsWithBasicInfo = allRooms.map(room => ({
        ...room,
        message_count: 0,
        last_message: null,
        last_message_at: null,
        participants: []
      }));

      // Sort by creation date
      roomsWithBasicInfo.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      console.log('Setting rooms, took:', Date.now() - startTime, 'ms');
      setRooms(roomsWithBasicInfo);
      
      // Load message stats and participants in background (non-blocking)
      loadRoomStatsInBackground(allRooms);
      
    } catch (error) {
      console.error('Error in loadRooms:', error);
    }
  };

  const loadRoomStatsInBackground = async (rooms: any[]) => {
    console.log('Loading room stats in background for', rooms.length, 'rooms');
    const startTime = Date.now();
    
    const supabase = supabaseClient();
    const roomIds = rooms.map(room => room.id);

    try {
      // Get latest message for each room (limit to 1 per room)
      const { data: latestMessages } = await supabase
        .from('messages')
        .select('room_id, content, created_at')
        .in('room_id', roomIds)
        .order('created_at', { ascending: false });

      // Get participants for all rooms
      const { data: allParticipants } = await supabase
        .from('room_participants')
        .select(`
          room_id,
          user_id,
          user_profiles (
            display_name
          )
        `)
        .in('room_id', roomIds);

      // Group data
      const messagesByRoom = latestMessages?.reduce((acc, message) => {
        if (!acc[message.room_id]) {
          acc[message.room_id] = message;
        }
        return acc;
      }, {} as Record<string, any>) || {};

      const participantsByRoom = allParticipants?.reduce((acc, participant) => {
        if (!acc[participant.room_id]) {
          acc[participant.room_id] = [];
        }
        acc[participant.room_id].push(participant);
        return acc;
      }, {} as Record<string, any[]>) || {};

      // Update rooms with stats
      setRooms(prevRooms => 
        prevRooms.map(room => {
          const lastMessage = messagesByRoom[room.id];
          const participants = participantsByRoom[room.id] || [];

          return {
            ...room,
            message_count: lastMessage ? 1 : 0,
            last_message: lastMessage?.content,
            last_message_at: lastMessage?.created_at,
            participants: participants
          };
        })
      );

      console.log('Background stats loaded in:', Date.now() - startTime, 'ms');
      
    } catch (error) {
      console.error('Error loading room stats:', error);
    }
  };

  const refreshRooms = async () => {
    if (user) {
      await loadRooms(user.id);
      setLastLoadTime(Date.now());
    }
  };

  // Refresh rooms when user returns to the page (less aggressive)
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      if (user && (now - lastLoadTime) > 60000) { // Refresh if older than 1 minute
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
        // First delete all messages in the room
        const { error: messagesError } = await supabase
          .from('messages')
          .delete()
          .eq('room_id', roomId);
          
        if (messagesError) {
          console.error('Error deleting messages:', messagesError);
        }
        
        // Then delete all participants
        const { error: participantsError } = await supabase
          .from('room_participants')
          .delete()
          .eq('room_id', roomId);
          
        if (participantsError) {
          console.error('Error deleting participants:', participantsError);
        }
        
        // Finally delete the room itself
        const { error: deleteError } = await supabase
          .from('rooms')
          .delete()
          .eq('id', roomId);
          
        if (deleteError) {
          console.error('Error deleting room:', deleteError);
          throw deleteError;
        }
        
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
      
      // Update the rooms list immediately by removing the room from state
      setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
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
        backgroundColor: '#f9fafb'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '2px solid #e5e7eb',
            borderTop: '2px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginRight: '12px'
          }} />
          <span style={{
            fontSize: '14px',
            color: '#6b7280',
            fontWeight: '500'
          }}>
            Loading...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      padding: '16px'
    }}>
      <div style={{
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          padding: '16px 20px',
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div>
            <h1 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#1f2937',
              margin: '0 0 2px 0'
            }}>
              Messages
            </h1>
            <p style={{
              fontSize: '12px',
              color: '#6b7280',
              margin: 0
            }}>
              {profile?.display_name || 'User'}
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
                padding: '10px 20px',
                borderRadius: '20px',
                background: '#3b82f6',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#3b82f6';
              }}
            >
              + New Chat
            </button>
            
            <button
              onClick={handleSignOut}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'transparent',
                color: '#6b7280',
                fontSize: '12px',
                fontWeight: '500',
                border: '1px solid #e5e7eb',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
                e.currentTarget.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Rooms List */}
        <div>
          
          {rooms.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                fontSize: '32px',
                marginBottom: '12px'
              }}>
                💬
              </div>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#1f2937',
                marginBottom: '8px'
              }}>
                No conversations yet
              </h3>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                marginBottom: '16px'
              }}>
                Start your first group chat
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '20px',
                  background: '#3b82f6',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                + New Chat
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1px',
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid #e5e7eb'
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
                      backgroundColor: 'white',
                      padding: '16px 20px',
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                    onClick={() => router.push(`/room/${room.id}`)}
                  >
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px',
                      flex: 1
                    }}>
                      {/* Avatar placeholder */}
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '16px',
                        fontWeight: '600'
                      }}>
                        {room.name.charAt(0).toUpperCase()}
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '4px'
                        }}>
                          <h3 style={{
                            fontSize: '16px',
                            fontWeight: '500',
                            color: '#1f2937',
                            margin: 0
                          }}>
                            {room.name}
                          </h3>
                          <span style={{
                            fontSize: '12px',
                            color: '#9ca3af'
                          }}>
                            {room.last_message_at 
                              ? new Date(room.last_message_at).toLocaleDateString()
                              : new Date(room.created_at).toLocaleDateString()
                            }
                          </span>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <p style={{
                            fontSize: '13px',
                            color: '#6b7280',
                            margin: 0
                          }}>
                            {participantCount} {participantCount === 1 ? 'person' : 'people'}
                            {displayParticipants && ` • ${displayParticipants}`}
                          </p>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              leaveRoom(room.id, room.name);
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'transparent',
                              color: '#ef4444',
                              border: '1px solid #fecaca',
                              fontSize: '10px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2';
                              e.currentTarget.style.borderColor = '#fca5a5';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.borderColor = '#fecaca';
                            }}
                          >
                            Leave
                          </button>
                        </div>
                      </div>
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