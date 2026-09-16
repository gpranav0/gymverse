import api from './api';

// Pickers and catalogue grids render everything they are given, so these ask for a full
// page rather than relying on the API's conservative default of 20 rows.
export const getExercises = async (params = {}) => (await api.get('/exercises', { params: { limit: 200, ...params } })).data;

export const createExercise = async (data) => (await api.post('/exercises', data)).data;

export const updateExercise = async (id, data) => (await api.put(`/exercises/${id}`, data)).data;

export const deleteExercise = async (id) => (await api.delete(`/exercises/${id}`)).data;

export const getWorkoutPlans = async () => (await api.get('/workout-plans', { params: { limit: 200 } })).data;

export const getWorkoutPlanById = async (id) => (await api.get(`/workout-plans/${id}`)).data;

export const createWorkoutPlan = async (data) => (await api.post('/workout-plans', data)).data;

export const assignWorkoutPlan = async (data) => (await api.post('/member-workouts', data)).data;

export const logWorkoutSession = async (data) => (await api.post('/workout-sessions', data)).data;
