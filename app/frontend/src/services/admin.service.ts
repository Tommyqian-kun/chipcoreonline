import api from './api';

// Dashboard API
export const getDashboardStats = () => {
  return api.get('/admin/dashboard/stats');
};

// Users API
export const getUsers = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
}) => {
  return api.get('/admin/users', { params });
};

export const getUser = (userId: string) => {
  return api.get(`/admin/users/${userId}`);
};

export const createUser = (userData: {
  email: string;
  password: string;
  name?: string;
  role?: 'USER' | 'ADMIN';
}) => {
  return api.post('/admin/users', userData);
};

export const updateUser = (userId: string, userData: {
  email?: string;
  name?: string;
  role?: 'USER' | 'ADMIN';
  isVerified?: boolean;
}) => {
  return api.patch(`/admin/users/${userId}`, userData);
};

export const deleteUser = (userId: string) => {
  return api.delete(`/admin/users/${userId}`);
};

// Tasks API
export const getTasks = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  userId?: string;
  search?: string;
  toolId?: string;
}) => {
  return api.get('/admin/tasks', { params });
};

export const getTask = (taskId: string) => {
  return api.get(`/admin/tasks/${taskId}`);
};

// Orders API
export const getOrders = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  userId?: string;
}) => {
  return api.get('/admin/orders', { params });
};

// Subscriptions API
export const getSubscriptions = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  userId?: string;
}) => {
  return api.get('/admin/subscriptions', { params });
};

export const updateSubscription = (subscriptionId: string, data: {
  status?: 'ACTIVE' | 'CANCELED' | 'EXPIRED';
  endDate?: string;
}) => {
  return api.patch(`/admin/subscriptions/${subscriptionId}`, data);
};

// Plans API
export const getPlans = () => {
  return api.get('/admin/plans');
};

export const createPlan = (planData: {
  name: string;
  description?: string;
  priceMonth: number;
  priceYear: number;
  features: Record<string, any>;
}) => {
  return api.post('/admin/plans', planData);
};

export const updatePlan = (planId: string, planData: {
  name?: string;
  description?: string;
  priceMonth?: number;
  priceYear?: number;
  features?: Record<string, any>;
}) => {
  return api.patch(`/admin/plans/${planId}`, planData);
};

// Tools API
export const getTools = () => {
  return api.get('/admin/tools');
};

export const getTool = (toolId: string) => {
  return api.get(`/admin/tools/${toolId}`);
};

export const createTool = (toolData: {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  dockerImage: string;
  version: string;
  configTemplate?: Record<string, any>;
  isPublic?: boolean;
}) => {
  return api.post('/admin/tools', toolData);
};

export const updateTool = (toolId: string, toolData: {
  name?: string;
  description?: string;
  inputSchema?: Record<string, any>;
  dockerImage?: string;
  version?: string;
  configTemplate?: Record<string, any>;
  isPublic?: boolean;
}) => {
  return api.patch(`/admin/tools/${toolId}`, toolData);
};

export const deleteTool = (toolId: string) => {
  return api.delete(`/admin/tools/${toolId}`);
};

// System Monitoring API
export const getSystemLogs = (params?: {
  page?: number;
  limit?: number;
  level?: string;
  module?: string;
  search?: string;
}) => {
  return api.get('/admin/system/logs', { params });
};

export const getSystemMetrics = () => {
  return api.get('/admin/system/metrics');
};

export const getSystemResources = () => {
  return api.get('/admin/system/resources');
};

export const getToolsAnalytics = () => {
  return api.get('/admin/tools/analytics');
};

// Audit Logs API (for future implementation)
export const getAuditLogs = (params?: {
  page?: number;
  limit?: number;
  action?: string;
  actorId?: string;
}) => {
  return api.get('/admin/audit-logs', { params });
}; 