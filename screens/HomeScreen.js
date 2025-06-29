import { useContext, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { AuthContext } from "../context/AuthContext";

export default function HomeScreen({ navigation }) {
  const { isLoggedIn, authLoading, logout } = useContext(AuthContext);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      navigation.replace("Login");
    }
  }, [authLoading, isLoggedIn]);

  if (authLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <Text className="text-lg text-gray-600">Checking login status...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center items-center bg-white px-6">
      <Text className="text-2xl font-bold text-green-600 mb-6">
        🎶 You're logged in!
      </Text>

      <Pressable
        onPress={logout}
        className="px-6 py-3 bg-red-500 rounded-full active:scale-95"
      >
        <Text className="text-white text-lg font-semibold">Log out</Text>
      </Pressable>
    </View>
  );
}
