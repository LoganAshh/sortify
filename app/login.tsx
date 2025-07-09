import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useContext, useEffect } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import {
  discovery,
  getRedirectUri,
  SCOPES,
  SPOTIFY_CLIENT_ID,
} from "../config/spotifyAuth";
import { AuthContext } from "../context/AuthContext";

export default function LoginScreen() {
  const router = useRouter();
  const { checkAuth } = useContext(AuthContext);

  // Get dynamic redirect URI
  const redirectUri = getRedirectUri();

  // Log the redirect URI for debugging
  console.log("Using redirect URI:", redirectUri);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SCOPES,
      redirectUri: redirectUri, // Use the dynamic redirect URI
      usePKCE: true,
    },
    discovery
  );

  useEffect(() => {
    if (response?.type === "success") {
      // With PKCE, we get an authorization code that needs to be exchanged for tokens
      if (response.params?.code) {
        console.log("Authorization code received, exchanging for tokens...");
        exchangeCodeForTokens(response.params.code);
      } else {
        console.error(
          "Authentication successful but no authorization code received"
        );
        Alert.alert(
          "Login failed",
          "Authentication completed but no authorization code received."
        );
      }
    } else if (response?.type === "error") {
      console.error("Auth error:", response.error);
      Alert.alert(
        "Login failed",
        `Could not authenticate with Spotify: ${response.error?.message || "Unknown error"}`
      );
    }
  }, [response]);

  const exchangeCodeForTokens = async (code: string) => {
    try {
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: SPOTIFY_CLIENT_ID,
          code,
          redirectUri: redirectUri,
          extraParams: {
            code_verifier: request?.codeVerifier || "",
          },
        },
        discovery
      );

      if (tokenResponse.accessToken) {
        await SecureStore.setItemAsync(
          "accessToken",
          tokenResponse.accessToken
        );
        if (tokenResponse.refreshToken) {
          await SecureStore.setItemAsync(
            "refreshToken",
            tokenResponse.refreshToken
          );
        }

        // Trigger auth check to update AuthContext state
        await checkAuth();

        // Now redirect to home
        router.replace("/");
      } else {
        Alert.alert(
          "Login failed",
          "Could not retrieve access token from Spotify."
        );
      }
    } catch (error) {
      console.error("Token exchange error:", error);
      Alert.alert(
        "Login failed",
        "Could not exchange authorization code for tokens."
      );
    }
  };

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
