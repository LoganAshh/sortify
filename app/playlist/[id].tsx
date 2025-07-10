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

interface VibeFeatures {
  energy: number; // 0-1 scale based on genres and tags
  mood: number; // 0-1 scale (0=sad, 1=happy)
  popularity: number; // 0-1 scale based on play counts
  era: number; // 0-1 scale (0=old, 1=new)
  mainstream: number; // 0-1 scale (0=niche, 1=mainstream)
  vibe_category: string; // Overall vibe classification
  primary_tags: string[]; // Top 3 tags from Last.fm
}

interface TrackWithVibe extends Track {
  vibe?: VibeFeatures;
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

// Vibe categories based on energy + mood combinations
const VIBE_CATEGORIES = {
  party: {
    energy: [0.7, 1.0],
    mood: [0.6, 1.0],
    emoji: "🎉",
    description: "High energy, happy vibes",
  },
  workout: {
    energy: [0.8, 1.0],
    mood: [0.4, 0.8],
    emoji: "💪",
    description: "Intense, motivating energy",
  },
  chill: {
    energy: [0.0, 0.4],
    mood: [0.5, 1.0],
    emoji: "😌",
    description: "Relaxed, peaceful vibes",
  },
  focus: {
    energy: [0.3, 0.6],
    mood: [0.4, 0.7],
    emoji: "🎯",
    description: "Steady, concentrated energy",
  },
  melancholy: {
    energy: [0.0, 0.5],
    mood: [0.0, 0.4],
    emoji: "😔",
    description: "Sad, introspective vibes",
  },
  romantic: {
    energy: [0.2, 0.6],
    mood: [0.6, 0.9],
    emoji: "💕",
    description: "Love songs and tender moments",
  },
  nostalgic: {
    energy: [0.3, 0.7],
    mood: [0.4, 0.8],
    emoji: "🌅",
    description: "Throwback, reminiscent vibes",
  },
  experimental: {
    energy: [0.2, 0.8],
    mood: [0.2, 0.8],
    emoji: "🎭",
    description: "Unique, artistic sounds",
  },
};

// Enhanced tag analysis for better vibe detection
const TAG_ANALYSIS = {
  energy: {
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
    ],
  },
  mood: {
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
    ],
    neutral: ["cool", "smooth", "mellow", "laid-back", "moderate", "balanced"],
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
    ],
  },
  era: {
    vintage: [
      "classic",
      "oldies",
      "60s",
      "70s",
      "80s",
      "retro",
      "vintage",
      "traditional",
    ],
    modern: [
      "contemporary",
      "new",
      "recent",
      "2010s",
      "2020s",
      "current",
      "fresh",
    ],
  },
  mainstream: {
    popular: ["pop", "mainstream", "commercial", "radio", "chart", "hit"],
    niche: [
      "underground",
      "indie",
      "experimental",
      "avant-garde",
      "alternative",
      "obscure",
    ],
  },
};

// Simple K-Means implementation for vibe clustering
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
  const [tracksWithVibes, setTracksWithVibes] = useState<TrackWithVibe[]>([]);
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

  // Get artist info for additional context
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

  // Analyze track vibe using Last.fm data
  const analyzeTrackVibe = async (
    artist: string,
    track: string
  ): Promise<VibeFeatures> => {
    console.log(`Analyzing vibe for: ${track} by ${artist}`);

    // Get track and artist info from Last.fm
    const [trackInfo, artistInfo] = await Promise.all([
      getLastFmTrackInfo(artist, track),
      getLastFmArtistInfo(artist),
    ]);

    // Extract tags from both track and artist
    const trackTags = trackInfo?.toptags?.tag || [];
    const artistTags = artistInfo?.tags?.tag || [];
    const allTags = [...trackTags, ...artistTags];

    // Get top 3 most relevant tags
    const primaryTags = allTags
      .slice(0, 3)
      .map((tag: any) => tag.name?.toLowerCase() || "")
      .filter(Boolean);

    // Calculate vibe features
    const energy = calculateEnergyFromTags(primaryTags, allTags);
    const mood = calculateMoodFromTags(primaryTags, allTags);
    const popularity = calculatePopularity(trackInfo, artistInfo);
    const era = calculateEra(primaryTags, artistInfo);
    const mainstream = calculateMainstream(primaryTags, popularity);

    // Determine overall vibe category
    const vibeCategory = determineVibeCategory(energy, mood, primaryTags);

    return {
      energy,
      mood,
      popularity,
      era,
      mainstream,
      vibe_category: vibeCategory,
      primary_tags: primaryTags,
    };
  };

  const calculateEnergyFromTags = (
    primaryTags: string[],
    allTags: any[]
  ): number => {
    let energyScore = 0.5; // Default medium energy
    let tagCount = 0;

    // Check primary tags first (weighted more heavily)
    for (const tag of primaryTags) {
      if (TAG_ANALYSIS.energy.high.some((keyword) => tag.includes(keyword))) {
        energyScore += 0.3;
        tagCount++;
      } else if (
        TAG_ANALYSIS.energy.low.some((keyword) => tag.includes(keyword))
      ) {
        energyScore -= 0.3;
        tagCount++;
      } else if (
        TAG_ANALYSIS.energy.medium.some((keyword) => tag.includes(keyword))
      ) {
        energyScore += 0.1;
        tagCount++;
      }
    }

    // Check all tags with lower weight
    for (const tagObj of allTags.slice(0, 10)) {
      const tag = tagObj.name?.toLowerCase() || "";
      if (TAG_ANALYSIS.energy.high.some((keyword) => tag.includes(keyword))) {
        energyScore += 0.1;
        tagCount++;
      } else if (
        TAG_ANALYSIS.energy.low.some((keyword) => tag.includes(keyword))
      ) {
        energyScore -= 0.1;
        tagCount++;
      }
    }

    return Math.max(0, Math.min(1, energyScore));
  };

  const calculateMoodFromTags = (
    primaryTags: string[],
    allTags: any[]
  ): number => {
    let moodScore = 0.5; // Default neutral mood

    for (const tag of primaryTags) {
      if (TAG_ANALYSIS.mood.happy.some((keyword) => tag.includes(keyword))) {
        moodScore += 0.3;
      } else if (
        TAG_ANALYSIS.mood.sad.some((keyword) => tag.includes(keyword))
      ) {
        moodScore -= 0.3;
      }
    }

    // Check for romantic indicators
    const romanticKeywords = ["love", "romantic", "ballad", "tender"];
    if (
      primaryTags.some((tag) =>
        romanticKeywords.some((keyword) => tag.includes(keyword))
      )
    ) {
      moodScore += 0.2;
    }

    return Math.max(0, Math.min(1, moodScore));
  };

  const calculatePopularity = (trackInfo: any, artistInfo: any): number => {
    const trackPlaycount = parseInt(trackInfo?.playcount || "0");
    const trackListeners = parseInt(trackInfo?.listeners || "0");
    const artistPlaycount = parseInt(artistInfo?.stats?.playcount || "0");
    const artistListeners = parseInt(artistInfo?.stats?.listeners || "0");

    // Use logarithmic scale for play counts
    const trackPopularity = Math.min(
      Math.log10(Math.max(trackPlaycount, 1)) / 6,
      1
    );
    const artistPopularity = Math.min(
      Math.log10(Math.max(artistListeners, 1)) / 7,
      1
    );

    return (trackPopularity + artistPopularity) / 2;
  };

  const calculateEra = (tags: string[], artistInfo: any): number => {
    let eraScore = 0.5; // Default to middle era

    // Check for era-specific tags
    if (
      tags.some((tag) =>
        TAG_ANALYSIS.era.vintage.some((keyword) => tag.includes(keyword))
      )
    ) {
      eraScore -= 0.3;
    }
    if (
      tags.some((tag) =>
        TAG_ANALYSIS.era.modern.some((keyword) => tag.includes(keyword))
      )
    ) {
      eraScore += 0.3;
    }

    // Use artist play count as era indicator (more popular = potentially newer)
    const artistListeners = parseInt(artistInfo?.stats?.listeners || "0");
    if (artistListeners > 1000000) eraScore += 0.1; // Very popular artists tend to be more current

    return Math.max(0, Math.min(1, eraScore));
  };

  const calculateMainstream = (tags: string[], popularity: number): number => {
    let mainstreamScore = popularity * 0.6; // Start with popularity

    if (
      tags.some((tag) =>
        TAG_ANALYSIS.mainstream.popular.some((keyword) => tag.includes(keyword))
      )
    ) {
      mainstreamScore += 0.3;
    }
    if (
      tags.some((tag) =>
        TAG_ANALYSIS.mainstream.niche.some((keyword) => tag.includes(keyword))
      )
    ) {
      mainstreamScore -= 0.3;
    }

    return Math.max(0, Math.min(1, mainstreamScore));
  };

  const determineVibeCategory = (
    energy: number,
    mood: number,
    tags: string[]
  ): string => {
    // Check for specific tag-based vibes first
    if (
      tags.some((tag) =>
        ["love", "romantic", "ballad"].some((keyword) => tag.includes(keyword))
      )
    ) {
      return "romantic";
    }
    if (
      tags.some((tag) =>
        ["workout", "gym", "training"].some((keyword) => tag.includes(keyword))
      )
    ) {
      return "workout";
    }
    if (
      tags.some((tag) =>
        ["ambient", "study", "concentration"].some((keyword) =>
          tag.includes(keyword)
        )
      )
    ) {
      return "focus";
    }
    if (
      tags.some((tag) =>
        ["experimental", "avant-garde", "weird"].some((keyword) =>
          tag.includes(keyword)
        )
      )
    ) {
      return "experimental";
    }
    if (
      tags.some((tag) =>
        ["classic", "oldies", "vintage"].some((keyword) =>
          tag.includes(keyword)
        )
      )
    ) {
      return "nostalgic";
    }

    // Use energy + mood combinations for general vibes
    if (energy >= 0.7 && mood >= 0.6) return "party";
    if (energy >= 0.8) return "workout";
    if (energy <= 0.4 && mood >= 0.5) return "chill";
    if (energy >= 0.3 && energy <= 0.6 && mood >= 0.4 && mood <= 0.7)
      return "focus";
    if (mood <= 0.4) return "melancholy";
    if (energy <= 0.6 && mood >= 0.6) return "romantic";

    return "chill"; // Default fallback
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
      setTracksWithVibes(allTracks);
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

  const analyzePlaylistVibes = async () => {
    setAnalyzing(true);
    setAnalysisProgress(0);

    try {
      console.log("Starting Last.fm vibe analysis...");

      const enhancedTracks: TrackWithVibe[] = [];

      for (let i = 0; i < tracksWithVibes.length; i++) {
        const track = tracksWithVibes[i];
        const artistName = track.artists[0].name;
        const trackName = track.name;

        setAnalysisProgress(((i + 1) / tracksWithVibes.length) * 100);

        const vibe = await analyzeTrackVibe(artistName, trackName);

        enhancedTracks.push({
          ...track,
          vibe,
        });

        // Rate limiting for Last.fm API
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // Determine optimal number of clusters based on vibe diversity
      const uniqueVibes = new Set(
        enhancedTracks.map((t) => t.vibe?.vibe_category)
      );
      const optimalClusters = Math.min(Math.max(2, uniqueVibes.size), 6);

      // Create feature vectors for clustering
      const features = enhancedTracks.map((track) => {
        const v = track.vibe!;
        return [v.energy, v.mood, v.popularity, v.era, v.mainstream];
      });

      // Run K-means clustering
      const clusters = kMeans(features, optimalClusters);

      // Assign clusters to tracks
      const clusteredTracks = enhancedTracks.map((track, index) => ({
        ...track,
        cluster: clusters[index],
      }));

      setTracksWithVibes(clusteredTracks);
      setClustered(true);

      console.log(
        `Vibe analysis complete! Created ${optimalClusters} vibe groups.`
      );
    } catch (error) {
      console.error("Error analyzing vibes:", error);
      showError(
        "Analysis Error",
        "Failed to analyze playlist vibes. Please try again."
      );
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(0);
    }
  };

  const getVibeClusterName = (clusterId: number, tracks: TrackWithVibe[]) => {
    const clusterTracks = tracks.filter((t) => t.cluster === clusterId);
    const vibes = clusterTracks.map((t) => t.vibe).filter(Boolean);

    if (vibes.length === 0) return `🎵 Group ${clusterId + 1}`;

    // Find most common vibe category
    const vibeCounts: { [key: string]: number } = {};
    vibes.forEach((v) => {
      vibeCounts[v!.vibe_category] = (vibeCounts[v!.vibe_category] || 0) + 1;
    });

    const topVibe =
      Object.entries(vibeCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ||
      "mixed";

    // Calculate averages
    const avgEnergy =
      vibes.reduce((sum, v) => sum + v!.energy, 0) / vibes.length;
    const avgMood = vibes.reduce((sum, v) => sum + v!.mood, 0) / vibes.length;

    const vibeInfo = VIBE_CATEGORIES[topVibe as keyof typeof VIBE_CATEGORIES];
    if (vibeInfo) {
      return `${vibeInfo.emoji} ${topVibe.charAt(0).toUpperCase() + topVibe.slice(1)} Vibes`;
    }

    // Fallback naming
    const energyDesc =
      avgEnergy >= 0.7
        ? "🔥 High Energy"
        : avgEnergy >= 0.4
          ? "⚡ Medium Energy"
          : "😌 Chill";
    const moodDesc =
      avgMood >= 0.7
        ? "😄 Happy"
        : avgMood <= 0.3
          ? "😔 Melancholy"
          : "😐 Balanced";

    return `${energyDesc} ${moodDesc}`;
  };

  const getVibeColor = (vibeCategory: string) => {
    const colors: { [key: string]: string } = {
      party: "bg-pink-100 text-pink-600",
      workout: "bg-red-100 text-red-600",
      chill: "bg-blue-100 text-blue-600",
      focus: "bg-green-100 text-green-600",
      melancholy: "bg-gray-100 text-gray-600",
      romantic: "bg-rose-100 text-rose-600",
      nostalgic: "bg-amber-100 text-amber-600",
      experimental: "bg-purple-100 text-purple-600",
    };
    return colors[vibeCategory] || "bg-indigo-100 text-indigo-600";
  };

  const groupedTracks = clustered
    ? tracksWithVibes.reduce(
        (groups, track) => {
          const clusterId = track.cluster!;
          if (!groups[clusterId]) {
            groups[clusterId] = [];
          }
          groups[clusterId].push(track);
          return groups;
        },
        {} as { [key: number]: TrackWithVibe[] }
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
          <Text className="text-gray-500">{tracksWithVibes.length} songs</Text>
        </View>
      </View>

      {/* Vibe Analysis Controls */}
      {!clustered && (
        <View className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800 mb-3">
            🎵 Vibe Analysis
          </Text>
          <Text className="text-gray-600 mb-4">
            Using Last.fm data to group songs by energy, mood, and overall vibe
            for the perfect listening experience
          </Text>

          {analyzing && (
            <View className="mb-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-sm text-gray-600">
                  Analyzing vibes...
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
            onPress={analyzePlaylistVibes}
            disabled={analyzing || tracksWithVibes.length === 0}
            className={`py-3 px-6 rounded-full ${
              analyzing || tracksWithVibes.length === 0
                ? "bg-gray-300"
                : "bg-green-500 active:scale-95"
            }`}
          >
            {analyzing ? (
              <View className="flex-row items-center justify-center">
                <ActivityIndicator size="small" color="white" />
                <Text className="text-white font-semibold ml-2">
                  Reading the vibes...
                </Text>
              </View>
            ) : (
              <Text className="text-white font-semibold text-center">
                🔍 Analyze Vibes with Last.fm
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
              🎵 Vibe Groups
            </Text>
            <Pressable
              onPress={() => {
                setClustered(false);
                setTracksWithVibes((prev) =>
                  prev.map((t) => ({
                    ...t,
                    cluster: undefined,
                    vibe: undefined,
                  }))
                );
              }}
              className="px-3 py-1 bg-gray-200 rounded-full"
            >
              <Text className="text-gray-700 text-sm font-medium">Reset</Text>
            </Pressable>
          </View>

          {Object.entries(groupedTracks).map(([clusterId, tracks]) => {
            const clusterName = getVibeClusterName(parseInt(clusterId), tracks);
            const avgVibe = tracks.reduce(
              (acc, track) => {
                if (track.vibe) {
                  acc.energy += track.vibe.energy;
                  acc.mood += track.vibe.mood;
                  acc.count++;
                }
                return acc;
              },
              { energy: 0, mood: 0, count: 0 }
            );

            const vibeDesc = tracks[0]?.vibe?.vibe_category
              ? VIBE_CATEGORIES[
                  tracks[0].vibe.vibe_category as keyof typeof VIBE_CATEGORIES
                ]?.description || "Mixed vibes"
              : "Mixed vibes";

            return (
              <View key={clusterId} className="mb-6">
                <View className="mb-3">
                  <Text className="text-lg font-semibold text-gray-800 mb-1">
                    {clusterName} ({tracks.length} songs)
                  </Text>
                  <Text className="text-sm text-gray-600 italic">
                    {vibeDesc}
                  </Text>
                </View>

                <View className="space-y-2">
                  {tracks.map((track, index) => (
                    <View
                      key={`${track.id}-${index}`}
                      className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"
                    >
                      <View className="flex-row items-center">
                        {track.album.images &&
                          track.album.images.length > 0 && (
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

                          {/* Show vibe features */}
                          {track.vibe && (
                            <View className="flex-row flex-wrap mt-1">
                              <View
                                className={`px-2 py-1 rounded mr-1 mb-1 ${getVibeColor(track.vibe.vibe_category)}`}
                              >
                                <Text className="text-xs">
                                  {
                                    VIBE_CATEGORIES[
                                      track.vibe
                                        .vibe_category as keyof typeof VIBE_CATEGORIES
                                    ]?.emoji
                                  }{" "}
                                  {track.vibe.vibe_category}
                                </Text>
                              </View>
                              <View className="bg-orange-100 px-2 py-1 rounded mr-1 mb-1">
                                <Text className="text-xs text-orange-600">
                                  Energy: {Math.round(track.vibe.energy * 100)}%
                                </Text>
                              </View>
                              <View className="bg-cyan-100 px-2 py-1 rounded mr-1 mb-1">
                                <Text className="text-xs text-cyan-600">
                                  Mood: {Math.round(track.vibe.mood * 100)}%
                                </Text>
                              </View>
                              {track.vibe.primary_tags.length > 0 && (
                                <View className="bg-indigo-100 px-2 py-1 rounded mr-1 mb-1">
                                  <Text className="text-xs text-indigo-600">
                                    {track.vibe.primary_tags[0]}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        // Original track list
        tracksWithVibes.length > 0 && (
          <View className="px-6 py-4">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              All Songs ({tracksWithVibes.length})
            </Text>

            <View className="space-y-2">
              {tracksWithVibes.slice(0, 50).map((track, index) => (
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
              {tracksWithVibes.length > 50 && (
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
