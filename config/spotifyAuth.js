import * as AuthSession from "expo-auth-session";

export const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

export const SPOTIFY_CLIENT_ID = "45eb125c13c84eaca7307c1a1097e8af";

export const SCOPES = [
  "user-read-private",
  "playlist-modify-public",
  "playlist-read-private",
];

// Function to get dynamic redirect URI
export const getRedirectUri = () => {
  return AuthSession.makeRedirectUri({
    useProxy: true,
  });
};
