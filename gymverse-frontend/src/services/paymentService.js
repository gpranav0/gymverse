import api from './api';

export const getPayments = async (params) => (await api.get('/payments', { params })).data;

export const updatePaymentStatus = async (id, data) => (await api.patch(`/payments/${id}`, data)).data;
