import api from './api';

// The class screens render every row they are given, so they ask for a full page rather
// than relying on the API's conservative default of 20 rows.
export const getClasses = async () => (await api.get('/classes', { params: { limit: 200 } })).data;

export const createClass = async (data) => (await api.post('/classes', data)).data;

export const updateClass = async (id, data) => (await api.put(`/classes/${id}`, data)).data;

export const deleteClass = async (id) => (await api.delete(`/classes/${id}`)).data;

// Admins managing the timetable also need to see sessions they cancelled.
export const getClassSchedules = async ({ includeCancelled = false } = {}) =>
  (await api.get('/schedules', { params: { limit: 200, ...(includeCancelled ? { include: 'cancelled' } : {}) } })).data;

export const createSchedule = async (data) => (await api.post('/schedules', data)).data;

export const updateSchedule = async (id, data) => (await api.patch(`/schedules/${id}`, data)).data;

export const enrollInClass = async (scheduleId, memberId) =>
  (await api.post(`/schedules/${scheduleId}/enroll`, { member_id: memberId })).data;
