// app/index.tsx
import { useRouter } from "expo-router";
import { useContext, useEffect } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { AuthContext } from "../context/AuthContext";

export default function HomeScreen() {
  const { isLoggedIn, authLoading, logout, userProfile, showError } =
    useContext(AuthContext);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.replace("/login");
    }
  }, [authLoading, isLoggedIn]);

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
    <View className="flex-1 justify-center items-center bg-white px-6">
      <Text className="text-2xl font-bold text-green-600 mb-6">
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

      <View className="space-y-3">
        <Pressable
          className="px-6 py-3 bg-green-500 rounded-full active:scale-95"
          onPress={() => {
            // TODO: Navigate to playlists or main app features
            showError(
              "Coming Soon",
              "Main app features will be implemented next!"
            );
          }}
        >
          <Text className="text-white text-lg font-semibold text-center">
            Explore Your Music
          </Text>
        </Pressable>

        <Pressable
          onPress={handleLogout}
          className="px-6 py-3 bg-red-500 rounded-full active:scale-95"
        >
          <Text className="text-white text-lg font-semibold text-center">
            Log out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
