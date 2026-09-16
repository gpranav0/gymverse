import api from './api';

export const getAssignments = async (params) =>
  (await api.get('/trainer-assignments', { params })).data;

export const createAssignment = async (data) =>
  (await api.post('/trainer-assignments', data)).data;

export const updateAssignment = async (id, data) =>
  (await api.patch(`/trainer-assignments/${id}`, data)).data;
