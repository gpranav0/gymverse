import api from './api';

export const changePassword = async (current_password, new_password) =>
  (await api.post('/auth/change-password', { current_password, new_password })).data;

export const forgotPassword = async (email) =>
  (await api.post('/auth/forgot-password', { email })).data;

export const resetPassword = async (token, password) =>
  (await api.post('/auth/reset-password', { token, password })).data;

export const verifyEmail = async (token) =>
  (await api.post('/auth/verify-email', { token })).data;

export const resendVerification = async (email) =>
  (await api.post('/auth/resend-verification', { email })).data;
