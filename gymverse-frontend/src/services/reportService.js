import api from './api';

export const getRevenueReport = async (params) => (await api.get('/reports/revenue', { params })).data;
