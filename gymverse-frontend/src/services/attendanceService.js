import api from './api';

export const checkIn = async (data) => (await api.post('/attendance/check-in', data)).data;

export const checkOut = async (data) => (await api.patch('/attendance/check-out', data)).data;

export const getAttendanceHistory = async (params) => (await api.get('/attendance', { params })).data;
