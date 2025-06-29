import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "spotify_access_token";
const REFRESH_KEY = "spotify_refresh_token";

export const saveTokens = async ({ accessToken, refreshToken }) => {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
};

export const getAccessToken = async () => {
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

export const getRefreshToken = async () => {
  return await SecureStore.getItemAsync(REFRESH_KEY);
};

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
};
