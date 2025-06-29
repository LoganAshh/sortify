export const config = {
  clientId: "45eb125c13c84eaca7307c1a1097e8af",
  redirectUrl: "exp://127.0.0.1:19000",
  scopes: [
    "user-read-private",
    "playlist-read-private",
    "playlist-modify-public",
  ],
  serviceConfiguration: {
    authorizationEndpoint: "https://accounts.spotify.com/authorize",
    tokenEndpoint: "https://accounts.spotify.com/api/token",
  },
  usePKCE: true,
};
