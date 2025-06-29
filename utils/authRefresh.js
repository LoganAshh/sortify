import { refresh } from "react-native-app-auth";
import { config } from "../config/spotifyAuth";
import { getRefreshToken, saveTokens } from "./authStorage";

export const refreshAccessToken = async () => {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const result = await refresh(config, {
      refreshToken,
    });

    await saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || refreshToken,
    });

    return result.accessToken;
  } catch (error) {
    console.error("Token refresh failed:", error);
    return null;
  }
};
