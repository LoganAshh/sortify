// app/index.tsx// app/index.tsx
import { useRouter } from "expo-router";
import { useContext, useEffect, useState } from "react";
import { Image, Pressable, Text, View, ScrollView, RefreshControl } from "react-native";
import { AuthContext } from "../context/AuthContext";

interface PlaylistImage {
  url: string;
  height: number;
  width: number;
}

interface Playlist {
  id: string;
  name: string;
  description: string;
  tracks: {
    total: number;
  };
  images: PlaylistImage[];
  owner: {
    id: string;
    display_name: string;
  };
  public: boolean;
  collaborative: boolean;
}

export default function HomeScreen() {
  const { isLoggedIn, authLoading, logout, userProfile, showError, makeAuthenticatedRequest } =
    useContext(AuthContext);
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Function to decode HTML entities
  const decodeHtmlEntities = (text: string) => {
    const htmlEntities: { [key: string]: string } = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#x5C;': '\\',
      '&#x60;': '`',
      '&#x3D;': '=',
    };
    
    return text.replace(/&[#\w]+;/g, (entity) => {
      return htmlEntities[entity] || entity;
    });
  };

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.replace("/login");
    }
  }, [authLoading, isLoggedIn]);

  useEffect(() => {
    if (!authLoading && isLoggedIn) {
      fetchPlaylists();
    }
  }, [authLoading, isLoggedIn]);

  const fetchPlaylists = async () => {
    try {
      setPlaylistsLoading(true);
      
      const response = await makeAuthenticatedRequest('https://api.spotify.com/v1/me/playlists?limit=50');

      if (!response.ok) {
        throw new Error('Failed to fetch playlists');
      }

      const data = await response.json();
      // Filter to only show playlists owned by the current user
      const userPlaylists = (data.items || []).filter((playlist: Playlist) => 
        playlist.owner.id === userProfile?.id
      );
      setPlaylists(userPlaylists);
    } catch (error) {
      console.error('Error fetching playlists:', error);
      showError(
        "Playlist Error",
        "Failed to load your playlists. Please try again."
      );
    } finally {
      setPlaylistsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPlaylists();
    setRefreshing(false);
  };

  const handlePlaylistPress = (playlist: Playlist) => {
    // TODO: Navigate to playlist details or sorting interface
    showError(
      "Coming Soon",
      `Playlist sorting for "${playlist.name}" will be implemented next!`
    );
  };

  if (authLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <Text className="text-gray-500 text-lg">Checking login...</Text>
      </View>
    );
  }

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      showError(
        "Logout Error",
        "There was a problem logging out. Please try again."
      );
    }
  };

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header Section */}
        <View className="px-6 pt-12 pb-6 bg-gradient-to-b from-green-50 to-white">
          <Text className="text-2xl font-bold text-green-600 mb-6 text-center">
            🎶 Welcome to Sortify!
          </Text>

          {userProfile && (
            <View className="items-center mb-6">
              {userProfile.images && userProfile.images.length > 0 && (
                <Image
                  source={{ uri: userProfile.images[0].url }}
                  className="w-20 h-20 rounded-full mb-3"
                />
              )}
              <Text className="text-xl font-semibold text-gray-800">
                {userProfile.display_name}
              </Text>
              <Text className="text-gray-600">
                {userProfile.followers?.total || 0} followers
              </Text>
              <Text className="text-gray-500 text-sm">
                {userProfile.country} • {userProfile.product}
              </Text>
            </View>
          )}
        </View>

        {/* Playlists Section */}
        <View className="px-6 pb-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold text-gray-800">
              Your Playlists ({playlists.length})
            </Text>
            <Pressable
              onPress={fetchPlaylists}
              disabled={playlistsLoading}
              className="px-3 py-1 bg-green-100 rounded-full"
            >
              <Text className="text-green-600 text-sm font-medium">
                {playlistsLoading ? "Loading..." : "Refresh"}
              </Text>
            </Pressable>
          </View>

          {playlistsLoading && playlists.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-gray-500 text-lg">Loading playlists...</Text>
            </View>
          ) : playlists.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-gray-500 text-lg">No playlists found</Text>
              <Text className="text-gray-400 text-sm mt-2">
                Create some playlists in Spotify to get started!
              </Text>
            </View>
          ) : (
            <View className="space-y-3">
              {playlists.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  onPress={() => handlePlaylistPress(playlist)}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 active:scale-98"
                >
                  <View className="flex-row items-center">
                    {playlist.images && playlist.images.length > 0 ? (
                      <Image
                        source={{ uri: playlist.images[0].url }}
                        className="w-16 h-16 rounded-lg mr-4"
                      />
                    ) : (
                      <View className="w-16 h-16 rounded-lg mr-4 bg-gray-200 items-center justify-center">
                        <Text className="text-2xl">🎵</Text>
                      </View>
                    )}
                    
                    <View className="flex-1">
                      <Text className="text-lg font-semibold text-gray-800 mb-1">
                        {playlist.name}
                      </Text>
                      <Text className="text-sm text-gray-600 mb-1">
                        {playlist.tracks.total} tracks • by {playlist.owner.display_name}
                      </Text>
                      {playlist.description && (
                        <Text className="text-sm text-gray-500" numberOfLines={2}>
                          {decodeHtmlEntities(playlist.description)}
                        </Text>
                      )}
                      <View className="flex-row mt-2">
                        {playlist.collaborative && (
                          <View className="bg-blue-100 px-2 py-1 rounded-full mr-2">
                            <Text className="text-xs text-blue-600 font-medium">
                              Collaborative
                            </Text>
                          </View>
                        )}
                        {playlist.public && (
                          <View className="bg-green-100 px-2 py-1 rounded-full">
                            <Text className="text-xs text-green-600 font-medium">
                              Public
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View className="items-center">
                      <Text className="text-2xl">→</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Logout Button */}
        <View className="px-6 pb-6">
          <Pressable
            onPress={handleLogout}
            className="px-6 py-3 bg-red-500 rounded-full active:scale-95"
          >
            <Text className="text-white text-lg font-semibold text-center">
              Log out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}