// app/playlist/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AuthContext } from "../../context/AuthContext";

const LASTFM_API_KEY = "0e84436d0016844bdfc26b59aac7cd24";

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
    release_date?: string;
  };
  preview_url: string;
  duration_ms: number;
}

interface TrackFeatures {
  energy: number; // 0-1 scale
  mood: string; // 'energetic', 'chill', 'happy', 'sad', 'party'
  genres: string[];
}

interface TrackWithFeatures extends Track {
  features?: TrackFeatures;
  cluster?: number;
}

interface PlaylistDetails {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: {
    total: number;
    items: { track: Track }[];
  };
}

// Simple K-Means implementation
const kMeans = (data: number[][], k: number, maxIterations = 100) => {
  const n = data.length;
  const dimensions = data[0].length;

  // Initialize centroids randomly
  const centroids = Array(k)
    .fill(null)
    .map(() =>
      Array(dimensions)
        .fill(0)
        .map(() => Math.random())
    );

  let clusters = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign points to nearest centroid
    const newClusters = data.map((point) => {
      let minDistance = Infinity;
      let closestCentroid = 0;

      centroids.forEach((centroid, i) => {
        const distance = Math.sqrt(
          point.reduce((sum, val, j) => sum + Math.pow(val - centroid[j], 2), 0)
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestCentroid = i;
        }
      });

      return closestCentroid;
    });

    // Check for convergence
    if (newClusters.every((cluster, i) => cluster === clusters[i])) {
      break;
    }

    clusters = newClusters;

    // Update centroids
    for (let i = 0; i < k; i++) {
      const clusterPoints = data.filter((_, index) => clusters[index] === i);
      if (clusterPoints.length > 0) {
        for (let j = 0; j < dimensions; j++) {
          centroids[i][j] =
            clusterPoints.reduce((sum, point) => sum + point[j], 0) /
            clusterPoints.length;
        }
      }
    }
  }

  return clusters;
};

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams();
  const { makeAuthenticatedRequest, showError } = useContext(AuthContext);
  const router = useRouter();

  const [playlist, setPlaylist] = useState<PlaylistDetails | null>(null);
  const [tracksWithFeatures, setTracksWithFeatures] = useState<
    TrackWithFeatures[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [clustering, setClustering] = useState(false);
  const [clustered, setClustered] = useState(false);
  const [selectedMoodGroup, setSelectedMoodGroup] = useState<string | null>(
    null
  );

  const decodeHtmlEntities = (text: string) => {
    const htmlEntities: { [key: string]: string } = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#x27;": "'",
      "&#x2F;": "/",
      "&#x5C;": "\\",
      "&#x60;": "`",
      "&#x3D;": "=",
    };

    return text.replace(/&[#\w]+;/g, (entity) => {
      return htmlEntities[entity] || entity;
    });
  };

  useEffect(() => {
    if (id) {
      fetchPlaylistDetails();
    }
  }, [id]);

  // Define all possible mood groups
  const ALL_MOOD_GROUPS = [
    {
      id: "party",
      name: "🎉 Party Vibes",
      keywords: ["party", "dance", "club", "upbeat", "celebration"],
    },
    {
      id: "energetic",
      name: "🔥 High Energy",
      keywords: [
        "rock",
        "metal",
        "punk",
        "hardcore",
        "aggressive",
        "energetic",
      ],
    },
    {
      id: "happy",
      name: "😊 Feel Good",
      keywords: ["happy", "uplifting", "positive", "cheerful", "joyful"],
    },
    {
      id: "chill",
      name: "😌 Chill Out",
      keywords: ["chill", "mellow", "relaxing", "peaceful", "calm", "ambient"],
    },
    {
      id: "sad",
      name: "😢 Emotional",
      keywords: ["sad", "melancholy", "emotional", "depressing", "lonely"],
    },
    {
      id: "electronic",
      name: "🎛️ Electronic",
      keywords: ["electronic", "techno", "house", "edm", "synthesizer"],
    },
    {
      id: "acoustic",
      name: "🎸 Acoustic",
      keywords: ["acoustic", "folk", "singer-songwriter", "unplugged"],
    },
    {
      id: "intense",
      name: "⚡ Intense",
      keywords: ["intense", "dramatic", "powerful", "epic"],
    },
  ];

  // Analyze energy and mood from Last.fm tags
  const analyzeEnergyAndMood = (tags: string[]): TrackFeatures => {
    const tagString = tags.join(" ").toLowerCase();

    // Energy analysis based on genre and descriptive tags
    let energy = 0.5; // default neutral

    // High energy indicators
    if (
      tagString.includes("rock") ||
      tagString.includes("metal") ||
      tagString.includes("punk") ||
      tagString.includes("electronic") ||
      tagString.includes("dance") ||
      tagString.includes("hip hop") ||
      tagString.includes("techno") ||
      tagString.includes("house")
    ) {
      energy += 0.3;
    }

    if (
      tagString.includes("hardcore") ||
      tagString.includes("aggressive") ||
      tagString.includes("energetic") ||
      tagString.includes("upbeat") ||
      tagString.includes("party") ||
      tagString.includes("fast")
    ) {
      energy += 0.2;
    }

    // Low energy indicators
    if (
      tagString.includes("ambient") ||
      tagString.includes("chill") ||
      tagString.includes("mellow") ||
      tagString.includes("soft") ||
      tagString.includes("acoustic") ||
      tagString.includes("folk") ||
      tagString.includes("ballad") ||
      tagString.includes("slow")
    ) {
      energy -= 0.3;
    }

    if (
      tagString.includes("relaxing") ||
      tagString.includes("peaceful") ||
      tagString.includes("dreamy") ||
      tagString.includes("calm")
    ) {
      energy -= 0.2;
    }

    // Clamp energy between 0 and 1
    energy = Math.max(0, Math.min(1, energy));

    // Find matching mood groups
    let bestMood = "neutral";
    let bestScore = 0;

    for (const group of ALL_MOOD_GROUPS) {
      const score = group.keywords.reduce((acc, keyword) => {
        return acc + (tagString.includes(keyword) ? 1 : 0);
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestMood = group.id;
      }
    }

    // Fallback to energy-based mood if no keywords match
    if (bestScore === 0) {
      if (energy > 0.7) {
        bestMood = "energetic";
      } else if (energy < 0.3) {
        bestMood = "chill";
      }
    }

    return {
      energy,
      mood: bestMood,
      genres: tags.slice(0, 3), // Keep top 3 genres
    };
  };

  // Get Last.fm track info
  const getLastFmTrackInfo = async (artist: string, track: string) => {
    try {
      const response = await fetch(
        `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&format=json`
      );

      if (!response.ok) return null;

      const data = await response.json();
      const trackInfo = data.track;

      if (!trackInfo || trackInfo.error) return null;

      const tags = trackInfo.toptags?.tag?.map((tag: any) => tag.name) || [];

      return analyzeEnergyAndMood(tags);
    } catch (error) {
      console.error("Last.fm API error:", error);
      return null;
    }
  };

  const fetchPlaylistDetails = async () => {
    try {
      setLoading(true);

      // Get playlist details
      const playlistResponse = await makeAuthenticatedRequest(
        `https://api.spotify.com/v1/playlists/${id}`
      );

      if (!playlistResponse.ok) {
        throw new Error("Failed to fetch playlist details");
      }

      const playlistData = await playlistResponse.json();
      setPlaylist(playlistData);
      console.log(
        "Playlist data:",
        playlistData.name,
        "Total tracks:",
        playlistData.tracks.total
      );

      // Get all tracks
      let allTracks: Track[] = [];
      let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`;

      while (url) {
        const tracksResponse = await makeAuthenticatedRequest(url);
        if (!tracksResponse.ok) {
          throw new Error("Failed to fetch tracks");
        }

        const tracksData = await tracksResponse.json();

        const validTracks = tracksData.items
          .filter((item: any) => {
            if (!item.track) return false;
            if (!item.track.id) return false;
            if (item.track.type !== "track") return false;
            return true;
          })
          .map((item: any) => item.track);

        allTracks = [...allTracks, ...validTracks];
        url = tracksData.next;
      }

      console.log("Total tracks found:", allTracks.length);
      setTracksWithFeatures(allTracks);
    } catch (error) {
      console.error("Error fetching playlist:", error);
      showError(
        "Playlist Error",
        "Failed to load playlist details. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Intelligently determine clusters based on actual mood diversity
  const determineOptimalClusters = (tracks: TrackWithFeatures[]) => {
    // Count unique moods present in the playlist
    const moodCounts: { [key: string]: number } = {};
    tracks.forEach((track) => {
      if (track.features?.mood) {
        moodCounts[track.features.mood] =
          (moodCounts[track.features.mood] || 0) + 1;
      }
    });

    // Only include moods that have at least 2 songs (to make meaningful clusters)
    const meaningfulMoods = Object.entries(moodCounts)
      .filter(([mood, count]) => count >= 2)
      .map(([mood]) => mood);

    console.log("Mood distribution:", moodCounts);
    console.log("Meaningful moods found:", meaningfulMoods);

    // Return the number of meaningful mood groups found
    return Math.max(2, meaningfulMoods.length);
  };

  const clusterPlaylist = async () => {
    setClustering(true);

    try {
      console.log("Starting Last.fm analysis for energy and mood...");

      const enhancedTracks: TrackWithFeatures[] = [];

      for (let i = 0; i < tracksWithFeatures.length; i++) {
        const track = tracksWithFeatures[i];
        const artistName = track.artists[0].name;
        const trackName = track.name;

        console.log(
          `Analyzing ${i + 1}/${tracksWithFeatures.length}: ${trackName}`
        );

        const features = await getLastFmTrackInfo(artistName, trackName);

        enhancedTracks.push({
          ...track,
          features: features || {
            energy: 0.5,
            mood: "neutral",
            genres: [],
          },
        });

        // Rate limit: 5 requests per second max for Last.fm
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // Determine optimal clusters based on actual mood diversity
      const optimalClusters = determineOptimalClusters(enhancedTracks);

      if (enhancedTracks.length < optimalClusters) {
        showError(
          "Not Enough Songs",
          `You need at least ${optimalClusters} songs for optimal clustering.`
        );
        return;
      }

      // Create feature vectors for clustering based on detected moods
      const moodCounts: { [key: string]: number } = {};
      enhancedTracks.forEach((track) => {
        if (track.features?.mood) {
          moodCounts[track.features.mood] =
            (moodCounts[track.features.mood] || 0) + 1;
        }
      });

      // Get unique moods that actually exist in the playlist
      const existingMoods = Object.keys(moodCounts).filter(
        (mood) => moodCounts[mood] >= 2
      );

      const features = enhancedTracks.map((track) => {
        const f = track.features!;

        // Create feature vector based on energy and mood presence
        const moodVector = existingMoods.map((mood) =>
          f.mood === mood ? 1 : 0
        );

        return [
          f.energy, // Energy level (0-1)
          ...moodVector, // One-hot encoding for existing moods only
        ];
      });

      // Run K-means clustering with optimal number of clusters
      const clusters = kMeans(features, optimalClusters);

      // Assign clusters to tracks
      const clusteredTracks = enhancedTracks.map((track, index) => ({
        ...track,
        cluster: clusters[index],
      }));

      setTracksWithFeatures(clusteredTracks);
      setClustered(true);

      // Auto-select the first mood group
      const firstMoodGroup = Object.keys(groupedTracks)[0];
      if (firstMoodGroup) {
        setSelectedMoodGroup(firstMoodGroup);
      }

      console.log(`Clustering complete! Created ${optimalClusters} groups.`);
    } catch (error) {
      console.error("Error clustering playlist:", error);
      showError(
        "Clustering Error",
        "Failed to cluster playlist. Please try again."
      );
    } finally {
      setClustering(false);
    }
  };

  const getClusterName = (clusterId: number, tracks: TrackWithFeatures[]) => {
    const features = tracks.map((t) => t.features).filter(Boolean);

    if (features.length === 0) {
      return `🎵 Group ${clusterId + 1}`;
    }

    // Find most common mood in this cluster
    const moodCounts: { [key: string]: number } = {};
    features.forEach((f) => {
      moodCounts[f!.mood] = (moodCounts[f!.mood] || 0) + 1;
    });
    const dominantMood = Object.entries(moodCounts).sort(
      ([, a], [, b]) => b - a
    )[0]?.[0];

    // Find the corresponding mood group name
    const moodGroup = ALL_MOOD_GROUPS.find(
      (group) => group.id === dominantMood
    );

    return moodGroup ? moodGroup.name : `🎵 Mixed Mood`;
  };

  const getMoodEmoji = (mood: string) => {
    const moodGroup = ALL_MOOD_GROUPS.find((group) => group.id === mood);
    return moodGroup?.name.split(" ")[0] || "🎵";
  };

  const getEnergyColor = (energy: number) => {
    if (energy > 0.7) return "bg-red-100 text-red-600";
    if (energy > 0.4) return "bg-yellow-100 text-yellow-600";
    return "bg-blue-100 text-blue-600";
  };

  const groupedTracks = clustered
    ? tracksWithFeatures.reduce(
        (groups, track) => {
          const clusterId = track.cluster!;
          if (!groups[clusterId]) {
            groups[clusterId] = [];
          }
          groups[clusterId].push(track);
          return groups;
        },
        {} as { [key: number]: TrackWithFeatures[] }
      )
    : {};

  // Get mood groups with their names for button display
  const getMoodGroups = () => {
    if (!clustered) return [];

    return Object.entries(groupedTracks).map(([clusterId, tracks]) => ({
      id: clusterId,
      name: getClusterName(parseInt(clusterId), tracks),
      tracks: tracks,
      count: tracks.length,
    }));
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#22c55e" />
        <Text className="text-gray-500 text-lg mt-4">Loading playlist...</Text>
      </View>
    );
  }

  if (!playlist) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <Text className="text-gray-500 text-lg">Playlist not found</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 bg-green-500 rounded-full"
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-6 pt-12 pb-6 bg-gradient-to-b from-green-50 to-white">
        <Pressable
          onPress={() => router.back()}
          className="mb-4 self-start px-3 py-1 bg-green-100 rounded-full"
        >
          <Text className="text-green-600 font-medium">← Back</Text>
        </Pressable>

        <View className="items-center">
          {playlist.images && playlist.images.length > 0 && (
            <Image
              source={{ uri: playlist.images[0].url }}
              className="w-32 h-32 rounded-lg mb-4"
            />
          )}
          <Text className="text-2xl font-bold text-gray-800 text-center mb-2">
            {playlist.name}
          </Text>
          {playlist.description && (
            <Text className="text-gray-600 text-center mb-4">
              {decodeHtmlEntities(playlist.description)}
            </Text>
          )}
          <Text className="text-gray-500">
            {tracksWithFeatures.length} songs
          </Text>
        </View>
      </View>

      {/* Clustering Controls */}
      {!clustered && (
        <View className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800 mb-3">
            🎵 Smart Grouping
          </Text>
          <Text className="text-gray-600 mb-4">
            The app will automatically detect what mood types exist in your
            playlist and create groups only for those moods (up to 8 possible:
            Party, High Energy, Feel Good, Chill, Emotional, Electronic,
            Acoustic, Intense)
          </Text>

          <Pressable
            onPress={clusterPlaylist}
            disabled={clustering || tracksWithFeatures.length === 0}
            className={`py-3 px-6 rounded-full ${
              clustering || tracksWithFeatures.length === 0
                ? "bg-gray-300"
                : "bg-green-500 active:scale-95"
            }`}
          >
            {clustering ? (
              <View className="flex-row items-center justify-center">
                <ActivityIndicator size="small" color="white" />
                <Text className="text-white font-semibold ml-2">
                  Analyzing mood & energy...
                </Text>
              </View>
            ) : (
              <Text className="text-white font-semibold text-center">
                🔍 Auto-Group by Energy & Mood
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Clustered Results */}
      {clustered ? (
        <View className="px-6 py-4">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-bold text-gray-800">
              🎵 Mood Groups
            </Text>
            <Pressable
              onPress={() => {
                setClustered(false);
                setSelectedMoodGroup(null);
                setTracksWithFeatures((prev) =>
                  prev.map((t) => ({
                    ...t,
                    cluster: undefined,
                    features: undefined,
                  }))
                );
              }}
              className="px-3 py-1 bg-gray-200 rounded-full"
            >
              <Text className="text-gray-700 text-sm font-medium">Reset</Text>
            </Pressable>
          </View>

          {Object.entries(groupedTracks).map(([clusterId, tracks]) => (
            <View key={clusterId} className="mb-6">
              <Text className="text-lg font-semibold text-gray-800 mb-3">
                {getClusterName(parseInt(clusterId), tracks)} ({tracks.length}{" "}
                songs)
              </Text>

              <View className="space-y-2">
                {tracks.map((track, index) => (
                  <View
                    key={`${track.id}-${index}`}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"
                  >
                    <View className="flex-row items-center">
                      {track.album.images && track.album.images.length > 0 && (
                        <Image
                          source={{ uri: track.album.images[0].url }}
                          className="w-12 h-12 rounded mr-3"
                        />
                      )}

                      <View className="flex-1">
                        <Text
                          className="font-semibold text-gray-800"
                          numberOfLines={1}
                        >
                          {track.name}
                        </Text>
                        <Text
                          className="text-sm text-gray-600"
                          numberOfLines={1}
                        >
                          {track.artists
                            .map((artist) => artist.name)
                            .join(", ")}
                        </Text>
                        <Text
                          className="text-xs text-gray-500"
                          numberOfLines={1}
                        >
                          {track.album.name}
                        </Text>

                        {/* Show mood and energy */}
                        {track.features && (
                          <View className="flex-row flex-wrap mt-1">
                            <View className="bg-purple-100 px-2 py-1 rounded mr-1 mb-1">
                              <Text className="text-xs text-purple-600">
                                {getMoodEmoji(track.features.mood)}{" "}
                                {track.features.mood}
                              </Text>
                            </View>
                            <View
                              className={`px-2 py-1 rounded mr-1 mb-1 ${getEnergyColor(track.features.energy)}`}
                            >
                              <Text className="text-xs">
                                Energy:{" "}
                                {Math.round(track.features.energy * 100)}%
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        // Original track list
        tracksWithFeatures.length > 0 && (
          <View className="px-6 py-4">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              All Songs ({tracksWithFeatures.length})
            </Text>

            <View className="space-y-2">
              {tracksWithFeatures.slice(0, 50).map((track, index) => (
                <View
                  key={`${track.id}-${index}`}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"
                >
                  <View className="flex-row items-center">
                    {track.album.images && track.album.images.length > 0 && (
                      <Image
                        source={{ uri: track.album.images[0].url }}
                        className="w-12 h-12 rounded mr-3"
                      />
                    )}

                    <View className="flex-1">
                      <Text
                        className="font-semibold text-gray-800"
                        numberOfLines={1}
                      >
                        {track.name}
                      </Text>
                      <Text className="text-sm text-gray-600" numberOfLines={1}>
                        {track.artists.map((artist) => artist.name).join(", ")}
                      </Text>
                      <Text className="text-xs text-gray-500" numberOfLines={1}>
                        {track.album.name}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
              {tracksWithFeatures.length > 50 && (
                <Text className="text-center text-gray-500 py-4">
                  Showing first 50 songs...
                </Text>
              )}
            </View>
          </View>
        )
      )}
    </ScrollView>
  );
}
