// context/AuthContext.js
import { createContext, useEffect, useState } from "react";
import { authorize, refresh } from "react-native-app-auth";
import { config } from "../config/spotifyAuth";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveTokens,
} from "../utils/authStorage";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState(null);

  const checkAuth = async () => {
    setAuthLoading(true);

    const storedToken = await getAccessToken();
    const storedRefresh = await getRefreshToken();

    if (storedToken) {
      setAccessToken(storedToken);
      setIsLoggedIn(true);
    } else if (storedRefresh) {
      try {
        const refreshed = await refresh(config, {
          refreshToken: storedRefresh,
        });
        await saveTokens({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || storedRefresh,
        });
        setAccessToken(refreshed.accessToken);
        setIsLoggedIn(true);
      } catch (err) {
        console.log("Token refresh failed", err);
        setIsLoggedIn(false);
        await clearTokens();
      }
    } else {
      setIsLoggedIn(false);
    }

    setAuthLoading(false);
  };

  const login = async () => {
    try {
      const result = await authorize(config);
      await saveTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      setAccessToken(result.accessToken);
      setIsLoggedIn(true);
    } catch (error) {
      console.error("Login error", error);
    }
  };

  const logout = async () => {
    await clearTokens();
    setAccessToken(null);
    setIsLoggedIn(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{ authLoading, isLoggedIn, accessToken, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
