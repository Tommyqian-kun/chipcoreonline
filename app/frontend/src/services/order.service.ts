import api from './api';

interface CreateOrderPayload {
  planId: string;
  billingCycle: string;
  paymentMethod: 'ALIPAY' | 'WECHAT';
}

export const createOrder = async (payload: CreateOrderPayload) => {
  try {
    console.log('🔄 创建订单请求:', payload);

    const response = await api.post('/orders', {
      planId: payload.planId,
      billingCycle: payload.billingCycle.toUpperCase(),
      paymentMethod: payload.paymentMethod,
    });

    console.log('✅ 订单创建成功:', response.data);
    return response;
  } catch (error: any) {
    console.error('❌ 订单创建失败:', error.response?.data || error.message);
    throw error;
  }
};

// 查询订单状态
export const getOrderStatus = async (orderId: string) => {
  try {
    const response = await api.get(`/orders/${orderId}`);
    return response.data;
  } catch (error: any) {
    console.error('❌ 查询订单状态失败:', error.response?.data || error.message);
    throw error;
  }
};

export const getMyOrders = async () => {
  try {
    const response = await api.get('/orders');
    return response.data;
  } catch (error: any) {
    console.error('❌ 获取订单列表失败:', error.response?.data || error.message);
    throw error;
  }
};

export const getOrderDetails = async (orderId: string) => {
  try {
    const response = await api.get(`/orders/${orderId}`);
    return response.data;
  } catch (error: any) {
    console.error('❌ 获取订单详情失败:', error.response?.data || error.message);
    throw error;
  }
};