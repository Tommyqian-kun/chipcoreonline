import { prisma } from '../utils/database';

export const getUserById = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      isVerified: true,
      role: true,
      createdAt: true,
    },
  });
  return user;
};

export const getUserProfile = async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      isVerified: true,
      role: true,
      createdAt: true,
    },
  });
};

export const updateUserProfile = async (userId: string, data: { name?: string; avatar?: string }) => {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
    },
  });
};