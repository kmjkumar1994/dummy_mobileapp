import api from './api';

export const commitmentService = {
  // Create a new commitment
  create: async (data) => {
    const response = await api.post('/commitments', data);
    return response.data;
  },

  // Get all commitments (optional filters)
  getAll: async ({ date, from, to, status, category } = {}) => {
    const params = {};
    if (date) params.date = date;
    if (from) params.from = from;
    if (to) params.to = to;
    if (status) params.status = status;
    if (category) params.category = category;

    const response = await api.get('/commitments', { params });
    return response.data;
  },

  // Get a single commitment by ID
  getOne: async (id) => {
    const response = await api.get(`/commitments/${id}`);
    return response.data;
  },

  // Update a commitment
  update: async (id, data) => {
    const response = await api.put(`/commitments/${id}`, data);
    return response.data;
  },

  // Delete a commitment
  delete: async (id) => {
    const response = await api.delete(`/commitments/${id}`);
    return response.data;
  },

  // Get day health score + availability for a date
  getAvailability: async (date) => {
    const response = await api.get(`/commitments/availability/${date}`);
    return response.data;
  },
};