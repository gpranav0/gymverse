import api from './api';

// The plan catalogue renders every plan it is given, so it asks for a full page rather
// than relying on the API's conservative default of 20 rows.
export const getMembershipPlans = async () => (await api.get('/membership-plans', { params: { limit: 200 } })).data;

export const createMembershipPlan = async (data) => (await api.post('/membership-plans', data)).data;

export const updateMembershipPlan = async (id, data) => (await api.put(`/membership-plans/${id}`, data)).data;

export const createSubscription = async (data) => (await api.post('/subscriptions', data)).data;
