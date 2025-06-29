import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import "../global.css";

export default function HomePage() {
  const offset = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-xl font-bold text-blue-500 mb-4">
        Welcome to NativeWind!
      </Text>

      <Pressable
        onPress={() => {
          offset.value = withSpring(Math.random() * 150 - 75);
        }}
        className="p-4 bg-blue-500 rounded-lg"
      >
        <Text className="text-white">Move Box</Text>
      </Pressable>

      <Animated.View
        className="w-16 h-16 bg-red-500 mt-6 rounded-md"
        style={animatedStyle}
      />
    </View>
  );
}
