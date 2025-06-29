// app/login.tsx (or screens/LoginScreen.tsx)
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useEffect } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import {
  discovery,
  REDIRECT_URI,
  SCOPES,
  SPOTIFY_CLIENT_ID,
} from "../config/spotifyAuth";

export default function LoginScreen() {
  const router = useRouter();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      usePKCE: true,
    },
    discovery
  );

  useEffect(() => {
    if (response?.type === "success") {
      const { accessToken, refreshToken } = response.authentication!;
      SecureStore.setItemAsync("accessToken", accessToken);
      if (refreshToken) {
        SecureStore.setItemAsync("refreshToken", refreshToken);
      }
      router.replace("/");
    } else if (response?.type === "error") {
      Alert.alert("Login failed", "Could not authenticate with Spotify.");
    }
  }, [response]);

  return (
    <View className="flex-1 justify-center items-center bg-white px-6">
      <Text className="text-2xl font-bold text-green-600 mb-4">
        Welcome to Sortify 🎧
      </Text>

      <Pressable
        onPress={() => promptAsync()}
        disabled={!request}
        className="px-6 py-3 bg-green-500 rounded-full active:scale-95"
      >
        <Text className="text-white text-lg font-semibold">
          Log in with Spotify
        </Text>
      </Pressable>
    </View>
  );
}
