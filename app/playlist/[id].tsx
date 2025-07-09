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

interface AudioFeatures {
  id: string;
  energy: number;
  valence: number;
  danceability: number;
  tempo: number;
  acousticness: number;
  instrumentalness: number;
}

interface Track {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  preview_url: string;
  duration_ms: number;
}

interface TrackWithFeatures extends Track {
  audioFeatures: AudioFeatures;
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
  const [numberOfClusters, setNumberOfClusters] = useState(3);

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

      // Get all tracks (handle pagination)
      let allTracks: Track[] = [];
      let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`;

      while (url) {
        const tracksResponse = await makeAuthenticatedRequest(url);
        if (!tracksResponse.ok) {
          throw new Error("Failed to fetch tracks");
        }

        const tracksData = await tracksResponse.json();
        console.log("Fetched tracks batch:", tracksData.items.length);

        const validTracks = tracksData.items
          .filter((item: any) => {
            if (!item.track) {
              console.log("Skipping item without track");
              return false;
            }
            if (!item.track.id) {
              console.log("Skipping track without ID:", item.track.name);
              return false;
            }
            if (item.track.type !== "track") {
              console.log("Skipping non-track item:", item.track.type);
              return false;
            }
            return true;
          })
          .map((item: any) => item.track);

        console.log("Valid tracks in this batch:", validTracks.length);
        allTracks = [...allTracks, ...validTracks];
        url = tracksData.next;
      }

      console.log("Total valid tracks found:", allTracks.length);

      if (allTracks.length === 0) {
        setTracksWithFeatures([]);
        return;
      }

      // Get audio features for all tracks
      const trackIds = allTracks.map((track) => track.id);
      console.log("Fetching audio features for", trackIds.length, "tracks");
      console.log("First few track IDs:", trackIds.slice(0, 5));

      const audioFeatures = await fetchAudioFeatures(trackIds);
      console.log("Audio features received:", audioFeatures.length);

      // Create a map of track ID to audio features for easier lookup
      const featuresMap = new Map();
      audioFeatures.forEach((feature) => {
        if (feature && feature.id) {
          featuresMap.set(feature.id, feature);
        }
      });

      console.log("Features map size:", featuresMap.size);

      // Combine tracks with their audio features
      const tracksWithAudioFeatures: TrackWithFeatures[] = [];

      allTracks.forEach((track) => {
        const features = featuresMap.get(track.id);
        if (features) {
          tracksWithAudioFeatures.push({
            ...track,
            audioFeatures: features,
          });
        } else {
          console.log(
            "No audio features for track:",
            track.name,
            "ID:",
            track.id
          );
        }
      });

      console.log(
        "Final tracks with features:",
        tracksWithAudioFeatures.length
      );
      setTracksWithFeatures(tracksWithAudioFeatures);
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

  const fetchAudioFeatures = async (
    trackIds: string[]
  ): Promise<AudioFeatures[]> => {
    const features: AudioFeatures[] = [];

    try {
      console.log("=== STARTING AUDIO FEATURES FETCH ===");
      console.log("Total track IDs to fetch:", trackIds.length);
      console.log("First 3 track IDs:", trackIds.slice(0, 3));

      // Spotify API allows max 100 IDs per request
      for (let i = 0; i < trackIds.length; i += 100) {
        const batch = trackIds.slice(i, i + 100);
        console.log(`\n--- Batch ${Math.floor(i / 100) + 1} ---`);
        console.log(
          `Fetching tracks ${i + 1}-${Math.min(i + 100, trackIds.length)}`
        );
        console.log("Batch size:", batch.length);
        console.log("Sample IDs in batch:", batch.slice(0, 3));

        const url = `https://api.spotify.com/v1/audio-features?ids=${batch.join(",")}`;
        console.log("Request URL length:", url.length);

        const response = await makeAuthenticatedRequest(url);
        console.log("Response status:", response.status);
        console.log("Response ok:", response.ok);

        if (response.ok) {
          const data = await response.json();
          console.log("Raw response data keys:", Object.keys(data));
          console.log("Audio features array exists:", !!data.audio_features);
          console.log(
            "Audio features array length:",
            data.audio_features?.length || 0
          );

          if (data.audio_features) {
            const allFeatures = data.audio_features;
            console.log("Raw audio_features array:", allFeatures.slice(0, 2)); // Show first 2

            const validFeatures = allFeatures.filter(
              (feature: any) => feature !== null
            );
            const nullCount = allFeatures.length - validFeatures.length;

            console.log(
              `Results: ${allFeatures.length} total, ${validFeatures.length} valid, ${nullCount} null`
            );

            if (validFeatures.length > 0) {
              console.log(
                "First valid feature keys:",
                Object.keys(validFeatures[0])
              );
              console.log("First valid feature sample:", {
                id: validFeatures[0].id,
                energy: validFeatures[0].energy,
                valence: validFeatures[0].valence,
              });
            }

            features.push(...validFeatures);
          } else {
            console.log("❌ No audio_features property in response");
            console.log("Full response:", data);
          }
        } else {
          console.error("❌ API request failed");
          console.error("Status:", response.status);
          try {
            const errorData = await response.json();
            console.error("Error response:", errorData);
          } catch (e) {
            console.error("Could not parse error response");
          }
        }
      }

      console.log("\n=== AUDIO FEATURES FETCH COMPLETE ===");
      console.log("Total valid features collected:", features.length);
      return features;
    } catch (error) {
      console.error("❌ Exception in fetchAudioFeatures:", error);
      return [];
    }
  };

  const normalizeFeatures = (features: AudioFeatures[]) => {
    const tempos = features.map((f) => f.tempo);
    const maxTempo = Math.max(...tempos);
    const minTempo = Math.min(...tempos);

    return features.map((f) => ({
      energy: f.energy,
      valence: f.valence,
      danceability: f.danceability,
      tempo:
        maxTempo > minTempo ? (f.tempo - minTempo) / (maxTempo - minTempo) : 0,
    }));
  };

  const clusterPlaylist = async () => {
    if (tracksWithFeatures.length < numberOfClusters) {
      showError(
        "Not Enough Songs",
        `You need at least ${numberOfClusters} songs to create ${numberOfClusters} clusters.`
      );
      return;
    }

    setClustering(true);

    try {
      // Normalize the audio features
      const normalizedFeatures = normalizeFeatures(
        tracksWithFeatures.map((t) => t.audioFeatures)
      );

      // Prepare data for clustering
      const data = normalizedFeatures.map((f) => [
        f.energy,
        f.valence,
        f.danceability,
        f.tempo,
      ]);

      // Run K-Means clustering
      const clusters = kMeans(data, numberOfClusters);

      // Assign cluster numbers to tracks
      const clusteredTracks = tracksWithFeatures.map((track, index) => ({
        ...track,
        cluster: clusters[index],
      }));

      setTracksWithFeatures(clusteredTracks);
      setClustered(true);
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

  const getClusterName = (clusterId: number) => {
    const clusterNames = [
      "🎵 Group 1",
      "🎶 Group 2",
      "🎼 Group 3",
      "🎹 Group 4",
      "🎸 Group 5",
    ];
    return clusterNames[clusterId] || `🎵 Group ${clusterId + 1}`;
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

      {/* Debug Info */}
      {!loading && (
        <View className="px-6 py-2 bg-yellow-50 border-b border-yellow-200">
          <Text className="text-sm text-yellow-800">
            Debug: Found {tracksWithFeatures.length} tracks with audio features
            {playlist && ` out of ${playlist.tracks.total} total tracks`}
          </Text>
        </View>
      )}

      {/* Clustering Controls */}
      {!clustered && (
        <View className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800 mb-3">
            🧩 Cluster Your Playlist
          </Text>
          <Text className="text-gray-600 mb-4">
            Group your songs by their musical characteristics using AI
            clustering
          </Text>

          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-gray-700 font-medium">Number of groups:</Text>
            <View className="flex-row space-x-2">
              {[2, 3, 4, 5].map((num) => (
                <Pressable
                  key={num}
                  onPress={() => setNumberOfClusters(num)}
                  className={`px-3 py-2 rounded-full ${
                    numberOfClusters === num ? "bg-green-500" : "bg-gray-200"
                  }`}
                >
                  <Text
                    className={`font-medium ${
                      numberOfClusters === num ? "text-white" : "text-gray-700"
                    }`}
                  >
                    {num}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

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
                  Analyzing Songs...
                </Text>
              </View>
            ) : (
              <Text className="text-white font-semibold text-center">
                🔄 Create Groups ({numberOfClusters} clusters)
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
              🎵 Grouped Songs
            </Text>
            <Pressable
              onPress={() => {
                setClustered(false);
                setTracksWithFeatures((prev) =>
                  prev.map((t) => ({ ...t, cluster: undefined }))
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
                {getClusterName(parseInt(clusterId))} ({tracks.length} songs)
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
              {tracksWithFeatures.map((track, index) => (
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
            </View>
          </View>
        )
      )}
    </ScrollView>
  );
}
