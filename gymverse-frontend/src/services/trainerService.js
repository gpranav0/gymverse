import api from './api';

export const getTrainers = async (params) => (await api.get('/trainers', { params })).data;

export const getTrainerById = async (id) => (await api.get(`/trainers/${id}`)).data;

export const createTrainer = async (data) => (await api.post('/trainers', data)).data;

export const updateTrainer = async (id, data) => (await api.put(`/trainers/${id}`, data)).data;

export const deleteTrainer = async (id) => (await api.delete(`/trainers/${id}`)).data;
