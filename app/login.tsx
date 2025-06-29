// app/login.tsx
import { useRouter } from "expo-router";
import React, { useContext, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { AuthContext } from "../context/AuthContext";

export default function LoginScreen() {
  const { login, isLoggedIn, authLoading } = useContext(AuthContext);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && isLoggedIn) {
      router.replace("/");
    }
  }, [authLoading, isLoggedIn]);

  return (
    <View className="flex-1 justify-center items-center bg-white px-6">
      <Text className="text-2xl font-bold text-green-600 mb-4">
        Welcome to Sortify 🎧
      </Text>

      <Pressable
        onPress={login}
        className="px-6 py-3 bg-green-500 rounded-full active:scale-95"
      >
        <Text className="text-white text-lg font-semibold">
          Log in with Spotify
        </Text>
      </Pressable>
    </View>
  );
}
