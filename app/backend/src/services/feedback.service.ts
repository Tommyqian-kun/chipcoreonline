import { FeedbackStatus } from '@prisma/client';
import { prisma } from '../utils/database';

interface CreateFeedbackData {
  firstName: string;
  lastName: string;
  email: string;
  message: string;
}

interface UpdateFeedbackData {
  status?: FeedbackStatus;
  response?: string;
}

interface GetFeedbackOptions {
  page: number;
  limit: number;
  status?: FeedbackStatus;
}

/**
 * Create a new feedback
 */
export const createFeedback = async (data: CreateFeedbackData) => {
  return await prisma.feedback.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      message: data.message,
    },
  });
};

/**
 * Get all feedback with pagination and filtering
 */
export const getAllFeedback = async (options: GetFeedbackOptions) => {
  const { page, limit, status } = options;
  const skip = (page - 1) * limit;

  const where = status ? { status } : {};

  const [feedback, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.feedback.count({ where }),
  ]);

  return {
    feedback,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get feedback by ID
 */
export const getFeedbackById = async (id: string) => {
  return await prisma.feedback.findUnique({
    where: { id },
  });
};

/**
 * Update feedback
 */
export const updateFeedback = async (id: string, data: UpdateFeedbackData) => {
  return await prisma.feedback.update({
    where: { id },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });
};

/**
 * Get feedback statistics
 */
export const getFeedbackStats = async () => {
  const [total, pending, inProgress, resolved, closed] = await Promise.all([
    prisma.feedback.count(),
    prisma.feedback.count({ where: { status: 'PENDING' } }),
    prisma.feedback.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.feedback.count({ where: { status: 'RESOLVED' } }),
    prisma.feedback.count({ where: { status: 'CLOSED' } }),
  ]);

  return {
    total,
    pending,
    inProgress,
    resolved,
    closed,
  };
};
