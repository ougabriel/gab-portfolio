/// <reference types="vite/client" />

// interface ImportMetaEnv {
//   readonly VITE_API_URL: string;
//   // Add other env variables here
// }

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add token to requests if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth Service
export const authService = {
  login: async (username: string, password: string) => {
    const response = await api.post('/auth/login', { username, password });
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  register: async (username: string, email: string, password: string) => {
    const response = await api.post('/auth/register', { username, email, password });
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },
};

// Blog Service
export const blogService = {
  getAllPosts: async () => {
    const response = await api.get('/blog');
    return response.data;
  },

  getPost: async (id: string) => {
    const response = await api.get(`/blog/${id}`);
    return response.data;
  },

  createPost: async (postData: FormData) => {
    const response = await api.post('/blog', postData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updatePost: async (id: string, postData: FormData) => {
    const response = await api.put(`/blog/${id}`, postData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  deletePost: async (id: string) => {
    const response = await api.delete(`/blog/${id}`);
    return response.data;
  },
};

// CV Service
export const cvService = {
  getLatestCV: async () => {
    const response = await api.get('/cv/latest');
    return response.data;
  },

  uploadCV: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/cv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getCVHistory: async () => {
    const response = await api.get('/cv/history');
    return response.data;
  },
};

// Error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authService.logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api; 