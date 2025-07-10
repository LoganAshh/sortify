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

const LASTFM_API_KEY = "0e84436d0016844bdfc26b59aac7cd24"; // Get your free key at last.fm/api

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

interface SimpleMusicFeatures {
  energy: number; // 0-1 scale (low to high energy)
  mood: number; // 0-1 scale (sad to happy)
  genre: string; // Primary genre classification
  confidence: number; // How confident we are in the analysis (0-1)
}

interface TrackWithFeatures extends Track {
  features?: SimpleMusicFeatures;
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

// Energy classification from tags
const ENERGY_TAGS = {
  high: [
    "energetic",
    "upbeat",
    "dance",
    "electronic",
    "punk",
    "metal",
    "hardcore",
    "fast",
    "aggressive",
    "intense",
    "powerful",
    "driving",
    "house",
    "techno",
    "dubstep",
    "edm",
    "drum and bass",
  ],
  medium: [
    "rock",
    "pop",
    "indie",
    "alternative",
    "hip hop",
    "funk",
    "soul",
    "reggae",
    "country",
    "blues",
  ],
  low: [
    "ambient",
    "classical",
    "jazz",
    "folk",
    "acoustic",
    "chill",
    "downtempo",
    "calm",
    "peaceful",
    "relaxing",
    "soft",
    "ballad",
    "slow",
  ],
};

// Mood classification from tags
const MOOD_TAGS = {
  happy: [
    "happy",
    "uplifting",
    "positive",
    "cheerful",
    "joyful",
    "fun",
    "party",
    "celebration",
    "euphoric",
    "optimistic",
    "bright",
    "sunny",
  ],
  neutral: [
    "cool",
    "smooth",
    "mellow",
    "laid-back",
    "moderate",
    "balanced",
    "steady",
  ],
  sad: [
    "sad",
    "melancholy",
    "depressing",
    "dark",
    "emotional",
    "tragic",
    "lonely",
    "heartbreak",
    "blue",
    "somber",
    "moody",
  ],
};

// Genre classification - simplified to main categories
const GENRE_CLASSIFICATION = {
  electronic: [
    "electronic",
    "dance",
    "edm",
    "techno",
    "house",
    "dubstep",
    "trance",
    "drum and bass",
    "ambient",
    "downtempo",
  ],
  rock: [
    "rock",
    "metal",
    "punk",
    "grunge",
    "hard rock",
    "alternative rock",
    "indie rock",
  ],
  pop: ["pop", "pop rock", "dance pop", "electropop", "indie pop"],
  "hip hop": ["hip hop", "rap", "trap", "hip-hop"],
  "r&b": ["rnb", "r&b", "soul", "funk", "neo soul"],
  folk: ["folk", "acoustic", "singer-songwriter", "country", "americana"],
  jazz: ["jazz", "blues", "swing", "bebop", "smooth jazz"],
  classical: ["classical", "orchestral", "piano", "violin", "opera"],
  reggae: ["reggae", "ska", "dub"],
  alternative: ["alternative", "indie", "experimental", "art rock"],
};

// Simple K-Means implementation for 3D clustering (energy, mood, genre)
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
  const [analyzing, setAnalyzing] = useState(false);
  const [clustered, setClustered] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

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

  // Get track info from Last.fm API
  const getLastFmTrackInfo = async (artist: string, track: string) => {
    try {
      const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&format=json&autocorrect=1`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      return data.track || null;
    } catch (error) {
      console.error("Last.fm API error:", error);
      return null;
    }
  };

  // Get artist info for additional genre context
  const getLastFmArtistInfo = async (artist: string) => {
    try {
      const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(artist)}&format=json&autocorrect=1`;

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      return data.artist || null;
    } catch (error) {
      console.error("Last.fm artist info error:", error);
      return null;
    }
  };

  // Analyze track using Last.fm data
  const analyzeTrack = async (
    artist: string,
    track: string
  ): Promise<SimpleMusicFeatures> => {
    console.log(`Analyzing: ${track} by ${artist}`);

    // Get track and artist info from Last.fm
    const [trackInfo, artistInfo] = await Promise.all([
      getLastFmTrackInfo(artist, track),
      getLastFmArtistInfo(artist),
    ]);

    // Extract tags from both track and artist
    const trackTags = trackInfo?.toptags?.tag || [];
    const artistTags = artistInfo?.tags?.tag || [];
    const allTags = [...trackTags, ...artistTags];

    // Get tag names (prioritize track tags)
    const tagNames = allTags
      .slice(0, 10) // Use top 10 tags
      .map((tag: any) => tag.name?.toLowerCase() || "")
      .filter(Boolean);

    // Calculate features
    const energy = calculateEnergy(tagNames);
    const mood = calculateMood(tagNames);
    const genre = determineGenre(tagNames);
    const confidence = calculateConfidence(
      allTags.length,
      trackInfo,
      artistInfo
    );

    return {
      energy,
      mood,
      genre,
      confidence,
    };
  };

  const calculateEnergy = (tags: string[]): number => {
    let energyScore = 0.5; // Default medium energy
    let matches = 0;

    for (const tag of tags) {
      if (ENERGY_TAGS.high.some((keyword) => tag.includes(keyword))) {
        energyScore += 0.3;
        matches++;
      } else if (ENERGY_TAGS.low.some((keyword) => tag.includes(keyword))) {
        energyScore -= 0.3;
        matches++;
      } else if (ENERGY_TAGS.medium.some((keyword) => tag.includes(keyword))) {
        energyScore += 0.1;
        matches++;
      }
    }

    // If no matches, try to infer from track title
    if (matches === 0) {
      energyScore = inferEnergyFromTitle(tags.join(" "));
    }

    return Math.max(0, Math.min(1, energyScore));
  };

  const calculateMood = (tags: string[]): number => {
    let moodScore = 0.5; // Default neutral mood
    let matches = 0;

    for (const tag of tags) {
      if (MOOD_TAGS.happy.some((keyword) => tag.includes(keyword))) {
        moodScore += 0.3;
        matches++;
      } else if (MOOD_TAGS.sad.some((keyword) => tag.includes(keyword))) {
        moodScore -= 0.3;
        matches++;
      }
    }

    // If no matches, stay neutral
    return Math.max(0, Math.min(1, moodScore));
  };

  const determineGenre = (tags: string[]): string => {
    const genreScores: { [key: string]: number } = {};

    // Initialize scores
    Object.keys(GENRE_CLASSIFICATION).forEach((genre) => {
      genreScores[genre] = 0;
    });

    // Score each genre based on tag matches
    for (const tag of tags) {
      for (const [genre, keywords] of Object.entries(GENRE_CLASSIFICATION)) {
        if (keywords.some((keyword) => tag.includes(keyword))) {
          genreScores[genre] += 1;
        }
      }
    }

    // Find highest scoring genre
    const topGenre = Object.entries(genreScores).sort(
      ([, a], [, b]) => b - a
    )[0];

    return topGenre && topGenre[1] > 0 ? topGenre[0] : "other";
  };

  const inferEnergyFromTitle = (text: string): number => {
    const highEnergyWords = [
      "party",
      "dance",
      "pump",
      "energy",
      "power",
      "fire",
      "wild",
      "fast",
    ];
    const lowEnergyWords = [
      "slow",
      "soft",
      "calm",
      "quiet",
      "peace",
      "sleep",
      "dream",
    ];

    let score = 0.5;

    for (const word of highEnergyWords) {
      if (text.includes(word)) score += 0.1;
    }

    for (const word of lowEnergyWords) {
      if (text.includes(word)) score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
  };

  const calculateConfidence = (
    tagCount: number,
    trackInfo: any,
    artistInfo: any
  ): number => {
    let confidence = 0.3; // Base confidence

    // More tags = higher confidence
    confidence += Math.min(tagCount * 0.05, 0.4);

    // Having track info boosts confidence
    if (trackInfo) confidence += 0.15;

    // Having artist info boosts confidence
    if (artistInfo) confidence += 0.15;

    return Math.min(confidence, 1);
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

  const analyzePlaylist = async () => {
    setAnalyzing(true);
    setAnalysisProgress(0);

    try {
      console.log("Starting music analysis...");

      const enhancedTracks: TrackWithFeatures[] = [];

      for (let i = 0; i < tracksWithFeatures.length; i++) {
        const track = tracksWithFeatures[i];
        const artistName = track.artists[0].name;
        const trackName = track.name;

        setAnalysisProgress(((i + 1) / tracksWithFeatures.length) * 100);

        const features = await analyzeTrack(artistName, trackName);

        enhancedTracks.push({
          ...track,
          features,
        });

        // Rate limiting for Last.fm API
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // Determine optimal number of clusters based on genre and energy/mood diversity
      const uniqueGenres = new Set(
        enhancedTracks.map((t) => t.features?.genre)
      );
      const energyVariance = calculateVariance(
        enhancedTracks.map((t) => t.features?.energy || 0)
      );
      const moodVariance = calculateVariance(
        enhancedTracks.map((t) => t.features?.mood || 0)
      );

      // More diverse = more clusters
      let optimalClusters = Math.min(uniqueGenres.size, 5);
      if (energyVariance > 0.1 || moodVariance > 0.1)
        optimalClusters = Math.max(optimalClusters, 3);
      optimalClusters = Math.max(2, Math.min(6, optimalClusters));

      // Create feature vectors for clustering
      const features = enhancedTracks.map((track) => {
        const f = track.features!;
        // Include genre as numeric values using one-hot encoding
        const genreVector = createGenreVector(f.genre);
        return [f.energy, f.mood, ...genreVector];
      });

      // Run K-means clustering
      const clusters = kMeans(features, optimalClusters);

      // Assign clusters to tracks
      const clusteredTracks = enhancedTracks.map((track, index) => ({
        ...track,
        cluster: clusters[index],
      }));

      setTracksWithFeatures(clusteredTracks);
      setClustered(true);

      console.log(`Analysis complete! Created ${optimalClusters} groups.`);
    } catch (error) {
      console.error("Error analyzing playlist:", error);
      showError(
        "Analysis Error",
        "Failed to analyze playlist. Please try again."
      );
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(0);
    }
  };

  const calculateVariance = (numbers: number[]): number => {
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const squaredDiffs = numbers.map((num) => Math.pow(num - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
  };

  const createGenreVector = (genre: string): number[] => {
    const genres = Object.keys(GENRE_CLASSIFICATION);
    const vector = new Array(genres.length).fill(0);
    const index = genres.indexOf(genre);
    if (index !== -1) vector[index] = 1;
    return vector;
  };

  const getClusterName = (clusterId: number, tracks: TrackWithFeatures[]) => {
    const clusterTracks = tracks.filter((t) => t.cluster === clusterId);
    const features = clusterTracks.map((t) => t.features).filter(Boolean);

    if (features.length === 0) return `🎵 Group ${clusterId + 1}`;

    // Calculate averages
    const avgEnergy =
      features.reduce((sum, f) => sum + f!.energy, 0) / features.length;
    const avgMood =
      features.reduce((sum, f) => sum + f!.mood, 0) / features.length;

    // Find most common genre
    const genreCounts: { [key: string]: number } = {};
    features.forEach((f) => {
      genreCounts[f!.genre] = (genreCounts[f!.genre] || 0) + 1;
    });
    const topGenre =
      Object.entries(genreCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ||
      "mixed";

    // Create descriptive name
    const energyDesc =
      avgEnergy >= 0.7
        ? "High Energy"
        : avgEnergy >= 0.4
          ? "Medium Energy"
          : "Low Energy";

    const moodDesc =
      avgMood >= 0.7 ? "Happy" : avgMood <= 0.3 ? "Sad" : "Balanced";

    const genreEmoji = getGenreEmoji(topGenre);
    const genreCapitalized =
      topGenre.charAt(0).toUpperCase() + topGenre.slice(1);

    return `${genreEmoji} ${energyDesc} ${moodDesc} ${genreCapitalized}`;
  };

  const getGenreEmoji = (genre: string): string => {
    const emojiMap: { [key: string]: string } = {
      electronic: "🎛️",
      rock: "🎸",
      pop: "🎤",
      "hip hop": "🎤",
      "r&b": "🎵",
      folk: "🪕",
      jazz: "🎷",
      classical: "🎼",
      reggae: "🇯🇲",
      alternative: "🎭",
      other: "🎶",
    };
    return emojiMap[genre] || "🎶";
  };

  const getEnergyColor = (energy: number): string => {
    if (energy >= 0.7) return "bg-red-100 text-red-600";
    if (energy >= 0.4) return "bg-yellow-100 text-yellow-600";
    return "bg-blue-100 text-blue-600";
  };

  const getMoodColor = (mood: number): string => {
    if (mood >= 0.7) return "bg-green-100 text-green-600";
    if (mood <= 0.3) return "bg-gray-100 text-gray-600";
    return "bg-purple-100 text-purple-600";
  };

  const getGenreColor = (genre: string): string => {
    const colors: { [key: string]: string } = {
      electronic: "bg-cyan-100 text-cyan-600",
      rock: "bg-orange-100 text-orange-600",
      pop: "bg-pink-100 text-pink-600",
      "hip hop": "bg-indigo-100 text-indigo-600",
      "r&b": "bg-violet-100 text-violet-600",
      folk: "bg-amber-100 text-amber-600",
      jazz: "bg-teal-100 text-teal-600",
      classical: "bg-slate-100 text-slate-600",
      reggae: "bg-lime-100 text-lime-600",
      alternative: "bg-fuchsia-100 text-fuchsia-600",
      other: "bg-neutral-100 text-neutral-600",
    };
    return colors[genre] || "bg-gray-100 text-gray-600";
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

      {/* Analysis Controls */}
      {!clustered && (
        <View className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800 mb-3">
            🎵 Music Analysis
          </Text>
          <Text className="text-gray-600 mb-4">
            Group your songs by energy level, mood, and genre using Last.fm data
          </Text>

          {analyzing && (
            <View className="mb-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-sm text-gray-600">
                  Analyzing music...
                </Text>
                <Text className="text-sm text-gray-600">
                  {Math.round(analysisProgress)}%
                </Text>
              </View>
              <View className="w-full bg-gray-200 rounded-full h-2">
                <View
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${analysisProgress}%` }}
                />
              </View>
            </View>
          )}

          <Pressable
            onPress={analyzePlaylist}
            disabled={analyzing || tracksWithFeatures.length === 0}
            className={`py-3 px-6 rounded-full ${
              analyzing || tracksWithFeatures.length === 0
                ? "bg-gray-300"
                : "bg-green-500 active:scale-95"
            }`}
          >
            {analyzing ? (
              <View className="flex-row items-center justify-center">
                <ActivityIndicator size="small" color="white" />
                <Text className="text-white font-semibold ml-2">
                  Analyzing music...
                </Text>
              </View>
            ) : (
              <Text className="text-white font-semibold text-center">
                🔍 Analyze Energy, Mood & Genre
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
              🎵 Music Groups
            </Text>
            <Pressable
              onPress={() => {
                setClustered(false);
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

                        {/* Show energy, mood, and genre */}
                        {track.features && (
                          <View className="flex-row flex-wrap mt-1">
                            <View
                              className={`px-2 py-1 rounded mr-1 mb-1 ${getEnergyColor(track.features.energy)}`}
                            >
                              <Text className="text-xs">
                                Energy:{" "}
                                {Math.round(track.features.energy * 100)}%
                              </Text>
                            </View>
                            <View
                              className={`px-2 py-1 rounded mr-1 mb-1 ${getMoodColor(track.features.mood)}`}
                            >
                              <Text className="text-xs">
                                Mood: {Math.round(track.features.mood * 100)}%
                              </Text>
                            </View>
                            <View
                              className={`px-2 py-1 rounded mr-1 mb-1 ${getGenreColor(track.features.genre)}`}
                            >
                              <Text className="text-xs">
                                {getGenreEmoji(track.features.genre)}{" "}
                                {track.features.genre}
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
