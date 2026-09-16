import axios from 'axios';

// Development sets VITE_API_URL in .env.development (http://localhost:5000/api). A production
// build leaves it unset and calls /api on its own origin, which is where the backend serves
// the app (SERVE_FRONTEND_DIST) or where a reverse proxy forwards it.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Endpoints where a 401 is a normal, expected answer ("wrong password") rather than an
// expired session. Redirecting on these wiped the page before the error could be shown.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register'];

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthAttempt = AUTH_ENDPOINTS.some((path) => url.includes(path));

    const currentToken = localStorage.getItem('token');
    const belongsToCurrentSession = currentToken && error.config?.headers?.Authorization === `Bearer ${currentToken}`;
    if (error.response?.status === 401 && !isAuthAttempt && belongsToCurrentSession) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Pulls the most useful message out of an axios error, falling back to a caller-supplied
// default. Every page was reimplementing a slightly different version of this.
export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const data = error?.response?.data;
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.map((e) => e.msg || e.message).filter(Boolean).join(', ');
  }
  return data?.message || data?.error || error?.message || fallback;
};

export default api;
