import api from './api';

export const getDashboardOverview = async () => (await api.get('/dashboard/overview')).data;

export const getRevenueData = async () => (await api.get('/dashboard/revenue')).data;

export const getTrainerDashboard = async () => (await api.get('/dashboard/trainer')).data;

export const getMemberDashboard = async () => (await api.get('/dashboard/member')).data;
