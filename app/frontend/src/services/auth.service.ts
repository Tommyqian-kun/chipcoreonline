import api from './api';

export const register = (email: string, password: string) => {
  return api.post('/auth/register', { email, password });
};

export const login = (email: string, password: string, rememberMe: boolean) => {
  return api.post('/auth/login', { email, password, rememberMe });
};

export const logout = () => {
  return api.post('/auth/logout');
};

export const resendVerification = (email: string) => {
  return api.post('/auth/resend-verification', { email });
};

export const requestPasswordReset = (email: string) => {
  return api.post('/auth/request-password-reset', { email });
};

export const resetPassword = (token: string, newPassword: string) => {
  return api.post('/auth/reset-password', { token, newPassword });
}; 