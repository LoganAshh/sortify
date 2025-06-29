// config/spotifyAuth.ts
export const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

export const SPOTIFY_CLIENT_ID = "your-client-id";
export const REDIRECT_URI = "exp://127.0.0.1:19000"; // or from AuthSession.makeRedirectUri()
export const SCOPES = [
  "user-read-private",
  "playlist-modify-public",
  "playlist-read-private",
];
