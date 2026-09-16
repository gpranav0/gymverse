import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);
  // The token whose account is already in `user`. Sign-in and registration hand the account
  // back with the token, so asking /auth/me about that same token was a wasted request.
  const loadedFor = useRef(null);

  useEffect(() => {
    let current = true;
    const fetchUser = async () => {
      if (token && loadedFor.current !== token) {
        try {
          const res = await api.get('/auth/me');
          if (!current) return;
          loadedFor.current = token;
          setUser(res.data.data);
        } catch (error) {
          if (!current) return;
          console.error("Token invalid or expired", error);
          setToken(null);
          localStorage.removeItem('token');
        }
      }
      if (current) setLoading(false);
    };
    fetchUser();
    return () => { current = false; };
  }, [token]);

  // Store the token separately from the user object rather than leaving a copy of it on
  // `user`, where every component that reads the context can see it.
  const acceptSession = useCallback((newToken, account) => {
    localStorage.setItem('token', newToken);
    loadedFor.current = newToken;
    setToken(newToken);
    setUser(account);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, ...userPayload } = res.data.data;
    acceptSession(newToken, userPayload);
  }, [acceptSession]);

  // By default the server revokes only this session. `everywhere` ends every session of
  // the account, on every device.
  const logout = useCallback(async ({ everywhere = false } = {}) => {
    const oldToken = localStorage.getItem('token');
    loadedFor.current = null;
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    try {
      await api.post('/auth/logout', everywhere ? { everywhere: true } : {}, { headers: { Authorization: `Bearer ${oldToken}` } });
    } catch { /* Local sign-out must not wait on the network. */ }
  }, []);

  // A password change revokes every existing token and hands back a new one for this
  // session; swapping it in keeps the user signed in here. The account itself is unchanged.
  const replaceToken = useCallback((newToken) => {
    localStorage.setItem('token', newToken);
    loadedFor.current = newToken;
    setToken(newToken);
  }, []);

  const register = useCallback(async (userData) => {
    const res = await api.post('/auth/register', userData);
    // No token means the account is pending approval or must confirm its email first.
    if (res.data.data && res.data.data.token) {
      const { token: newToken, ...userPayload } = res.data.data;
      acceptSession(newToken, userPayload);
    }
    return res.data;
  }, [acceptSession]);

  // A stable value, so consumers re-render when auth state changes rather than every time
  // the provider does.
  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!token, loading, login, logout, register, replaceToken }),
    [user, token, loading, login, logout, register, replaceToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
