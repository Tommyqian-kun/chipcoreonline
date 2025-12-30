import api from './api';

export const getMe = () => {
  return api.get('/users/me', {
    skipGlobal401Handler: true
  });
};

export const updateMyProfile = (data: { name?: string; avatar?: string }) => {
  return api.patch('/users/me', data);
};