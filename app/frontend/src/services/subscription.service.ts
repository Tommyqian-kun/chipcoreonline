import api from './api';

export const getMySubscription = async () => {
  try {
    const response = await api.get('/subscriptions/me');
    return response.data;
  } catch (error: any) {
    console.error('❌ 获取订阅信息失败:', error.response?.data || error.message);
    throw error;
  }
};

export const cancelSubscription = async () => {
  try {
    const response = await api.post('/subscriptions/cancel');
    return response.data;
  } catch (error: any) {
    console.error('❌ 取消订阅失败:', error.response?.data || error.message);
    throw error;
  }
};