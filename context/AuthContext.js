//context/AuthContext.js
import * as SecureStore from "expo-secure-store";
import { createContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import { SPOTIFY_CLIENT_ID, discovery } from "../config/spotifyAuth";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // Validate token by making a test API call
  const validateToken = async (token) => {
    try {
      const response = await fetch("https://api.spotify.com/v1/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUserProfile(userData);
        return true;
      } else if (response.status === 401) {
        // Token is invalid/expired
        console.log("Token is invalid or expired");
        return false;
      } else {
        console.error("Error validating token:", response.status);
        return false;
      }
    } catch (error) {
      console.error("Network error validating token:", error);
      return false;
    }
  };

  const clearStoredTokens = async () => {
    try {
      await SecureStore.deleteItemAsync("accessToken");
      await SecureStore.deleteItemAsync("refreshToken");
    } catch (error) {
      console.error("Error clearing tokens:", error);
    }
  };

  // Refresh the access token using refresh token
  const refreshAccessToken = async (refreshToken) => {
    try {
      const response = await fetch(discovery.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: SPOTIFY_CLIENT_ID,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Store new tokens
        await SecureStore.setItemAsync("accessToken", data.access_token);
        if (data.refresh_token) {
          await SecureStore.setItemAsync("refreshToken", data.refresh_token);
        }

        return data.access_token;
      } else {
        console.error("Token refresh failed:", response.status);
        const errorData = await response.json().catch(() => ({}));
        console.error("Refresh error details:", errorData);

        // Clear stored tokens when refresh fails
        await clearStoredTokens();
        setAccessToken(null);
        setIsLoggedIn(false);
        setUserProfile(null);

        return null;
      }
    } catch (error) {
      console.error("Error refreshing token:", error);

      // Clear stored tokens on network error
      await clearStoredTokens();
      setAccessToken(null);
      setIsLoggedIn(false);
      setUserProfile(null);

      return null;
    }
  };

  const checkAuth = async () => {
    setAuthLoading(true);

    try {
      const storedToken = await SecureStore.getItemAsync("accessToken");
      const storedRefresh = await SecureStore.getItemAsync("refreshToken");

      if (storedToken) {
        console.log("Found stored access token, validating...");
        const isValid = await validateToken(storedToken);

        if (isValid) {
          setAccessToken(storedToken);
          setIsLoggedIn(true);
        } else if (storedRefresh) {
          console.log("Access token invalid, attempting refresh...");
          const newToken = await refreshAccessToken(storedRefresh);

          if (newToken) {
            const isNewTokenValid = await validateToken(newToken);
            if (isNewTokenValid) {
              setAccessToken(newToken);
              setIsLoggedIn(true);
            } else {
              console.log("Refreshed token is also invalid");
              // refreshAccessToken already cleared tokens and set auth state
            }
          } else {
            console.log("Token refresh failed");
            // refreshAccessToken already cleared tokens and set auth state
          }
        } else {
          console.log("No refresh token available");
          await clearStoredTokens();
          setIsLoggedIn(false);
        }
      } else {
        console.log("No stored access token found");
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.error("Error checking auth:", error);
      setIsLoggedIn(false);
      showError(
        "Authentication Error",
        "There was a problem checking your login status. Please try logging in again."
      );
    }

    setAuthLoading(false);
  };

  const logout = async () => {
    try {
      await clearStoredTokens();
      setAccessToken(null);
      setIsLoggedIn(false);
      setUserProfile(null);
    } catch (error) {
      console.error("Error logging out:", error);
      showError(
        "Logout Error",
        "There was a problem logging out. Please try again."
      );
    }
  };

  // Enhanced error handling
  const showError = (title, message) => {
    Alert.alert(title, message, [{ text: "OK", style: "default" }]);
  };

  // Auto-refresh token when it expires during app usage
  const makeAuthenticatedRequest = async (url, options = {}) => {
    if (!accessToken) {
      throw new Error("No access token available");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 401) {
      // Token expired, try to refresh
      const refreshToken = await SecureStore.getItemAsync("refreshToken");
      if (refreshToken) {
        const newToken = await refreshAccessToken(refreshToken);
        if (newToken) {
          setAccessToken(newToken);
          // Retry the request with new token
          return fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              Authorization: `Bearer ${newToken}`,
            },
          });
        }
      }
      // If refresh fails, refreshAccessToken already handled logout
      throw new Error("Session expired, please log in again");
    }

    return response;
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authLoading,
        isLoggedIn,
        accessToken,
        userProfile,
        logout,
        makeAuthenticatedRequest,
        showError,
        checkAuth, // Export checkAuth so login screen can call it
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
