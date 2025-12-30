import api from './api';

export interface PlanFeatures {
  id: string;
  name: string;
  description: string;
  priceMonth: number;
  priceYear: number;
  features: {
    maxConcurrentTasks: number;
    totalUsageLimit?: number | null;
    monthlyLimit?: number | null;
    supportLevel: string;
    accessToAdvancedTools: boolean;
    dataExport: boolean;
    prioritySupport: boolean;
  };
  featureList: string[];
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonth: number;
  priceYear: number;
  features: any;
}

/**
 * 获取所有计划（原有API，保持兼容性）
 */
export const getPlans = async (): Promise<Plan[]> => {
  const response = await api.get('/plans');
  return response.data;
};

/**
 * 获取所有计划及其详细权益信息
 */
export const getAllPlansWithFeatures = async (): Promise<PlanFeatures[]> => {
  const response = await api.get('/plans/features');
  return response.data;
};

/**
 * 获取特定计划的权益信息
 */
export const getPlanFeatures = async (planId: string): Promise<PlanFeatures> => {
  const response = await api.get(`/plans/${planId}/features`);
  return response.data;
};
