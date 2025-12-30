import { prisma } from '../utils/database';
import { Role, TaskStatus, OrderStatus, SubscriptionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../config/logger';

// Dashboard Statistics
export const getDashboardStatistics = async () => {
  const [
    totalUsers,
    verifiedUsers,
    adminUsers,
    newUsersThisMonth,
    totalTasks,
    totalOrders,
    totalRevenue,
    activeSubscriptions,
    canceledSubscriptions,
    expiredSubscriptions,
    totalTools,
    publicTools,
    thisMonthOrders,
    thisMonthRevenue,
  ] = await Promise.all([
    // User statistics
    prisma.user.count(),
    prisma.user.count({ where: { isVerified: true } }),
    prisma.user.count({ where: { role: Role.ADMIN } }),
    prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),

    // Task statistics
    prisma.task.count(),

    // Order statistics
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: OrderStatus.PAID },
      _sum: { amount: true },
    }),

    // Subscription statistics
    prisma.subscription.count({
      where: { status: SubscriptionStatus.ACTIVE },
    }),
    prisma.subscription.count({
      where: { status: SubscriptionStatus.CANCELED },
    }),
    prisma.subscription.count({
      where: { status: SubscriptionStatus.EXPIRED },
    }),

    // Tool statistics
    prisma.tool.count(),
    prisma.tool.count({ where: { isPublic: true } }),

    // This month statistics
    prisma.order.count({
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
    prisma.order.aggregate({
      where: {
        status: OrderStatus.PAID,
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { amount: true },
    }),
  ]);

  // Task status distribution
  const tasksByStatus = await prisma.task.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  // Convert task status counts to expected format
  const taskStatusCounts = tasksByStatus.reduce((acc, item) => {
    acc[item.status] = item._count.status;
    return acc;
  }, {} as Record<string, number>);

  // Return data in the format expected by frontend
  return {
    users: {
      total: totalUsers,
      verified: verifiedUsers,
      admins: adminUsers,
      newThisMonth: newUsersThisMonth,
    },
    tasks: {
      total: totalTasks,
      pending: taskStatusCounts[TaskStatus.PENDING] || 0,
      running: taskStatusCounts[TaskStatus.RUNNING] || 0,
      completed: taskStatusCounts[TaskStatus.COMPLETED] || 0,
      failed: taskStatusCounts[TaskStatus.FAILED] || 0,
    },
    orders: {
      total: totalOrders,
      totalRevenue: totalRevenue._sum.amount || 0,
      thisMonth: thisMonthOrders,
      thisMonthRevenue: thisMonthRevenue._sum.amount || 0,
    },
    subscriptions: {
      active: activeSubscriptions,
      canceled: canceledSubscriptions,
      expired: expiredSubscriptions,
    },
    tools: {
      total: totalTools,
      public: publicTools,
    },
  };
};

// Users Management
interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
}

export const getUsers = async (params: PaginationParams) => {
  const { page = 1, limit = 10, search, role } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }
  
  if (role) {
    where.role = role;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            tasks: true,
            orders: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
};

export const createUser = async (
  data: {
    email: string;
    password: string;
    name?: string;
    role: Role;
  },
  adminId: string
) => {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(data.password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      ...data,
      password: hashedPassword,
      isVerified: true, // Admin-created users are auto-verified
    },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
      isVerified: true,
      createdAt: true,
    },
  });

  // Create audit log
  await createAuditLog(adminId, 'createUser', user.id, {
    email: data.email,
    role: data.role,
  });

  return user;
};

export const getUserById = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
      isVerified: true,
      createdAt: true,
      updatedAt: true,
      subscription: {
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      _count: {
        select: {
          tasks: true,
          orders: true,
        },
      },
    },
  });

  return user;
};

export const updateUser = async (
  userId: string,
  data: {
    name?: string;
    role?: Role;
    isVerified?: boolean;
  },
  adminId: string
) => {
  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isVerified: true },
  });

  if (!existingUser) {
    throw new Error('User not found');
  }

  // Update user
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
      isVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Create audit log
  await createAuditLog(adminId, 'updateUser', userId, {
    changes: data,
    previous: {
      role: existingUser.role,
      isVerified: existingUser.isVerified,
    },
  });

  return user;
};

export const deleteUser = async (userId: string, adminId: string) => {
  // Prevent admin from deleting themselves
  if (userId === adminId) {
    throw new Error('You cannot delete yourself');
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Delete user (this will cascade delete related records due to foreign key constraints)
  await prisma.user.delete({
    where: { id: userId },
  });

  // Create audit log
  await createAuditLog(adminId, 'deleteUser', userId, {
    email: user.email,
  });
};

// Tasks Management
export const getTasks = async (params: PaginationParams & {
  status?: string;
  toolId?: string;
  deploymentMode?: string;
}) => {
  const { page = 1, limit = 10, search, status, toolId, deploymentMode } = params;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (search) {
    where.OR = [
      { id: { contains: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { tool: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  if (status && status !== 'all') {
    where.status = status;
  }

  if (toolId && toolId !== 'all') {
    where.toolId = toolId;
  }

  if (deploymentMode && deploymentMode !== 'all') {
    where.deploymentMode = deploymentMode;
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
        tool: { select: { id: true, name: true, description: true } },
      },
      select: {
        id: true,
        status: true,
        deploymentMode: true,
        localStoragePath: true,
        downloadStatus: true,
        timeoutType: true,
        errorMessage: true,
        queuedAt: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
        user: true,
        tool: true,
        parameters: true
      }
    }),
    prisma.task.count({ where }),
  ]);

  return {
    tasks,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
};

export const getTaskById = async (taskId: string) => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      user: { 
        select: { 
          id: true, 
          email: true, 
          name: true,
          subscription: {
            select: {
              id: true,
              status: true,
              plan: { select: { name: true } },
            },
          },
        } 
      },
      tool: { 
        select: { 
          id: true, 
          name: true, 
          description: true,
          inputSchema: true,
          dockerImage: true,
          version: true,
        } 
      },
    },
  });

  return task;
};

// Orders Management
export const getOrders = async (params: PaginationParams) => {
  const { page = 1, limit = 10, search } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  if (search) {
    where.OR = [
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { plan: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
        plan: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
};

export const getOrderById = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { 
        select: { 
          id: true, 
          email: true, 
          name: true,
        } 
      },
      plan: { 
        select: { 
          id: true, 
          name: true, 
          description: true,
          priceMonth: true,
          priceYear: true,
          features: true,
        } 
      },
      subscription: {
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  return order;
};

// Subscriptions Management
export const getSubscriptions = async (params: PaginationParams) => {
  const { page = 1, limit = 10, search } = params;
  const skip = (page - 1) * limit;

  const where: any = {};
  
  if (search) {
    where.OR = [
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { plan: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
        plan: { select: { id: true, name: true } },
        order: { select: { id: true, amount: true, paymentMethod: true } },
      },
    }),
    prisma.subscription.count({ where }),
  ]);

  return {
    subscriptions,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
};

export const updateSubscription = async (
  subscriptionId: string,
  data: {
    status?: SubscriptionStatus;
    endDate?: string;
  },
  adminId: string
) => {
  // Check if subscription exists
  const existingSubscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { 
      id: true, 
      status: true, 
      endDate: true,
      user: { select: { email: true } },
    },
  });

  if (!existingSubscription) {
    throw new Error('Subscription not found');
  }

  const updateData: any = {};
  if (data.status) updateData.status = data.status;
  if (data.endDate) updateData.endDate = new Date(data.endDate);

  // Update subscription
  const subscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: updateData,
    include: {
      user: { select: { id: true, email: true, name: true } },
      plan: { select: { id: true, name: true } },
      order: { select: { id: true, amount: true } },
    },
  });

  // Create audit log
  await createAuditLog(adminId, 'updateSubscription', subscriptionId, {
    changes: data,
    userEmail: existingSubscription.user.email,
    previous: {
      status: existingSubscription.status,
      endDate: existingSubscription.endDate,
    },
  });

  return subscription;
};

// Plans Management
export const getPlans = async () => {
  const plans = await prisma.plan.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          subscriptions: true,
          orders: true,
        },
      },
    },
  });

  return plans;
};

export const createPlan = async (
  data: {
    name: string;
    description?: string;
    priceMonth: number;
    priceYear: number;
    features: Record<string, any>;
  },
  adminId: string
) => {
  // Check if plan name already exists
  const existingPlan = await prisma.plan.findUnique({
    where: { name: data.name },
  });

  if (existingPlan) {
    throw new Error('Plan with this name already exists');
  }

  // Create plan
  const plan = await prisma.plan.create({
    data,
  });

  // Create audit log
  await createAuditLog(adminId, 'createPlan', plan.id, {
    name: data.name,
    priceMonth: data.priceMonth,
    priceYear: data.priceYear,
  });

  return plan;
};

export const updatePlan = async (
  planId: string,
  data: {
    name?: string;
    description?: string;
    priceMonth?: number;
    priceYear?: number;
    features?: Record<string, any>;
  },
  adminId: string
) => {
  // Check if plan exists
  const existingPlan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, priceMonth: true, priceYear: true },
  });

  if (!existingPlan) {
    throw new Error('Plan not found');
  }

  // Check if name is being changed and already exists
  if (data.name && data.name !== existingPlan.name) {
    const nameExists = await prisma.plan.findUnique({
      where: { name: data.name },
    });
    if (nameExists) {
      throw new Error('Plan with this name already exists');
    }
  }

  // Update plan
  const plan = await prisma.plan.update({
    where: { id: planId },
    data,
  });

  // Create audit log
  await createAuditLog(adminId, 'updatePlan', planId, {
    changes: data,
    previous: {
      name: existingPlan.name,
      priceMonth: existingPlan.priceMonth,
      priceYear: existingPlan.priceYear,
    },
  });

  return plan;
};

export const deletePlan = async (planId: string, adminId: string) => {
  // Check if plan exists
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { 
      id: true, 
      name: true,
      _count: {
        select: {
          subscriptions: {
            where: { status: SubscriptionStatus.ACTIVE },
          },
        },
      },
    },
  });

  if (!plan) {
    throw new Error('Plan not found');
  }

  // Check if plan has active subscriptions
  if (plan._count.subscriptions > 0) {
    throw new Error('Cannot delete plan that has active subscriptions');
  }

  // Delete plan
  await prisma.plan.delete({
    where: { id: planId },
  });

  // Create audit log
  await createAuditLog(adminId, 'deletePlan', planId, {
    name: plan.name,
  });
};

// Tools Management
export const getTools = async () => {
  const tools = await prisma.tool.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          tasks: true,
        },
      },
    },
  });

  return tools;
};

export const createTool = async (
  data: {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    dockerImage: string;
    version: string;
    configTemplate?: Record<string, any>;
    isPublic: boolean;
  },
  adminId: string
) => {
  // Check if tool name already exists
  const existingTool = await prisma.tool.findUnique({
    where: { name: data.name },
  });

  if (existingTool) {
    throw new Error('Tool with this name already exists');
  }

  // Create tool
  const tool = await prisma.tool.create({
    data,
  });

  // Create audit log
  await createAuditLog(adminId, 'createTool', tool.id, {
    name: data.name,
    dockerImage: data.dockerImage,
    version: data.version,
  });

  return tool;
};

export const getToolById = async (toolId: string) => {
  const tool = await prisma.tool.findUnique({
    where: { id: toolId },
    include: {
      _count: {
        select: {
          tasks: true,
        },
      },
    },
  });

  return tool;
};

export const updateTool = async (
  toolId: string,
  data: {
    name?: string;
    description?: string;
    inputSchema?: Record<string, any>;
    dockerImage?: string;
    version?: string;
    configTemplate?: Record<string, any>;
    isPublic?: boolean;
  },
  adminId: string
) => {
  // Check if tool exists
  const existingTool = await prisma.tool.findUnique({
    where: { id: toolId },
    select: { id: true, name: true, version: true, dockerImage: true },
  });

  if (!existingTool) {
    throw new Error('Tool not found');
  }

  // Check if name is being changed and already exists
  if (data.name && data.name !== existingTool.name) {
    const nameExists = await prisma.tool.findUnique({
      where: { name: data.name },
    });
    if (nameExists) {
      throw new Error('Tool with this name already exists');
    }
  }

  // Update tool
  const tool = await prisma.tool.update({
    where: { id: toolId },
    data,
  });

  // Create audit log
  await createAuditLog(adminId, 'updateTool', toolId, {
    changes: data,
    previous: {
      name: existingTool.name,
      version: existingTool.version,
      dockerImage: existingTool.dockerImage,
    },
  });

  return tool;
};

export const deleteTool = async (toolId: string, adminId: string) => {
  // Check if tool exists
  const tool = await prisma.tool.findUnique({
    where: { id: toolId },
    select: { 
      id: true, 
      name: true,
      _count: {
        select: {
          tasks: true,
        },
      },
    },
  });

  if (!tool) {
    throw new Error('Tool not found');
  }

  // Check if tool has associated tasks
  if (tool._count.tasks > 0) {
    throw new Error('Cannot delete tool that has associated tasks');
  }

  // Delete tool
  await prisma.tool.delete({
    where: { id: toolId },
  });

  // Create audit log
  await createAuditLog(adminId, 'deleteTool', toolId, {
    name: tool.name,
  });
};

// System Monitoring Services
export const getSystemLogs = async (params: {
  page: number;
  limit: number;
  level?: string;
  module?: string;
  search?: string;
}) => {
  const { page, limit, level, module, search } = params;
  const skip = (page - 1) * limit;

  // 从数据库获取真实的审计日志
  const where: any = {};

  if (search) {
    where.OR = [
      { action: { contains: search, mode: 'insensitive' } },
      { details: { path: ['message'], string_contains: search } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, email: true, name: true }
        }
      }
    }),
    prisma.auditLog.count({ where }),
  ]);

  // 转换为日志格式
  const formattedLogs = logs.map(log => ({
    id: log.id,
    level: 'info', // 审计日志默认为info级别
    message: `${log.action} - ${log.actor?.email || 'System'} performed ${log.action} on ${log.targetId}`,
    timestamp: log.createdAt.toISOString(),
    module: 'admin',
    userId: log.actorId,
    metadata: {
      action: log.action,
      targetId: log.targetId,
      details: log.details,
      actor: log.actor
    }
  }));

  return {
    logs: formattedLogs,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
};




export const getToolsAnalytics = async () => {
  try {
    console.log('🔍 开始获取工具分析数据...');

    // 从数据库获取真实的工具分析数据
    const tools = await prisma.tool.findMany({
    include: {
      _count: {
        select: {
          tasks: true
        }
      },
      tasks: {
        select: {
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              subscription: {
                select: {
                  plan: {
                    select: {
                      priceMonth: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  const analytics = tools.map(tool => {
    const tasks = tool.tasks;
    const totalUsage = tasks.length;
    const successfulTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED).length;
    const failedTasks = tasks.filter(t => t.status === TaskStatus.FAILED).length;
    const successRate = totalUsage > 0 ? Math.round((successfulTasks / totalUsage) * 100) : 0;

    // 计算收入（基于使用该工具的付费用户）
    const revenue = tasks.reduce((sum, task) => {
      const planPrice = task.user?.subscription?.plan?.priceMonth || 0;
      return sum + (planPrice * 0.1); // 假设每次使用贡献10%的月费
    }, 0);

    // 计算活跃用户数
    const uniqueUsers = new Set(tasks.map(t => t.user?.id).filter(Boolean)).size;

    // 计算平均执行时间（使用updatedAt作为完成时间的近似）
    const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED && t.updatedAt && t.createdAt);
    const avgExecutionTime = completedTasks.length > 0
      ? completedTasks.reduce((sum, task) => {
          const duration = new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime();
          return sum + duration;
        }, 0) / completedTasks.length / 1000 // 转换为秒
      : 0;

    return {
      toolId: tool.id,
      name: tool.name,
      stats: {
        totalUsage,
        activeUsers: uniqueUsers,
        revenue: Math.round(revenue),
        successRate,
        avgExecutionTime: Math.round(avgExecutionTime),
        errorRate: totalUsage > 0 ? Math.round((failedTasks / totalUsage) * 100) : 0,

        // 商业分析数据（基于真实数据计算，暂无数据时显示0）
        conversionRate: 0, // 需要实际转化数据
        userRetentionRate: 0, // 需要实际留存数据
        customerSatisfaction: "0.0", // 需要实际满意度数据

        // 趋势数据（需要历史数据支持，暂无数据时显示0）
        usageGrowth: "0.0", // 需要历史使用数据对比
        revenueGrowth: "0.0", // 需要历史收入数据对比

        // 行为数据（基于真实数据计算，暂无数据时显示0）
        repeatUsageRate: 0, // 需要用户重复使用数据
        featureAdoptionRate: 0, // 需要功能采用数据
        resourceUtilization: 0, // 需要资源利用率数据
      },

      // 时间序列数据（最近30天）
      usageHistory: Array.from({ length: 30 }, (_, i) => {
        const date = new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000);
        const dayTasks = tasks.filter(t => {
          const taskDate = new Date(t.createdAt);
          return taskDate.toDateString() === date.toDateString();
        });

        return {
          date: date.toISOString().split('T')[0],
          usage: dayTasks.length,
          revenue: Math.round(dayTasks.length * (revenue / totalUsage || 0)),
          users: new Set(dayTasks.map(t => t.user?.id).filter(Boolean)).size,
        };
      }),

      // 用户分布（基于真实订阅数据）
      userSegments: [
        {
          segment: '免费用户',
          count: tasks.filter(t => !t.user?.subscription).length,
          revenue: 0
        },
        {
          segment: '专业用户',
          count: tasks.filter(t => t.user?.subscription?.plan?.priceMonth).length,
          revenue: Math.round(revenue * 0.8)
        },
        {
          segment: '企业用户',
          count: 0, // 暂时没有企业用户数据
          revenue: Math.round(revenue * 0.2)
        },
      ],

      // 功能使用分析（基于真实数据，暂无数据时显示0）
      featureUsage: [
        { feature: '基础功能', usage: 0, satisfaction: 0 },
        { feature: '高级配置', usage: 0, satisfaction: 0 },
        { feature: '自定义模板', usage: 0, satisfaction: 0 },
        { feature: '批量处理', usage: 0, satisfaction: 0 },
      ],

      // 错误分析（基于真实数据，暂无数据时显示0）
      errorTypes: [
        { type: '输入验证错误', count: 0, impact: '低' },
        { type: '资源超限', count: 0, impact: '中' },
        { type: '系统异常', count: 0, impact: '高' },
      ],
    };
  });

  console.log('✅ 工具分析数据获取成功，返回', analytics.length, '个工具的数据');
  return analytics;

  } catch (error) {
    console.error('❌ 获取工具分析数据时发生错误:', error);
    throw error;
  }
};

// System Monitoring
export const getSystemMetrics = async () => {
  try {
    // 获取Redis连接池状态
    const { redisPool } = await import('./redis-pool.service');
    const queueStatus = await redisPool.getQueueStatus();

    // 获取任务统计
    const taskStats = await prisma.task.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });

    // 获取最近24小时的任务数量
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTasks = await prisma.task.count({
      where: {
        createdAt: {
          gte: last24Hours
        }
      }
    });

    // 获取平均任务执行时间
    const completedTasks = await prisma.task.findMany({
      where: {
        status: 'COMPLETED',
        startedAt: { not: null },
        finishedAt: { not: null }
      },
      select: {
        startedAt: true,
        finishedAt: true
      },
      take: 100,
      orderBy: { finishedAt: 'desc' }
    });

    const avgExecutionTime = completedTasks.length > 0
      ? completedTasks.reduce((sum, task) => {
          const duration = task.finishedAt!.getTime() - task.startedAt!.getTime();
          return sum + duration;
        }, 0) / completedTasks.length / 1000 // 转换为秒
      : 0;

    // 获取用户活跃度
    const activeUsers = await prisma.task.groupBy({
      by: ['userId'],
      where: {
        createdAt: {
          gte: last24Hours
        }
      },
      _count: {
        userId: true
      }
    });

    return {
      redis: {
        queueLength: queueStatus.queueLength,
        activeTasksCount: queueStatus.activeTasksCount,
        activeTaskIds: queueStatus.activeTaskIds
      },
      tasks: {
        total: taskStats.reduce((sum, stat) => sum + stat._count.status, 0),
        byStatus: taskStats.reduce((acc, stat) => {
          acc[stat.status] = stat._count.status;
          return acc;
        }, {} as Record<string, number>),
        recent24h: recentTasks,
        avgExecutionTimeSeconds: Math.round(avgExecutionTime)
      },
      users: {
        activeCount: activeUsers.length,
        totalTasksToday: activeUsers.reduce((sum, user) => sum + user._count.userId, 0)
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to get system metrics:', error);
    throw error;
  }
};

export const getSystemResources = async () => {
  try {
    const os = require('os');
    const fs = require('fs').promises;
    const path = require('path');

    // 获取系统资源信息
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    // 获取CPU信息
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // 获取磁盘使用情况
    let diskUsage = { total: 0, used: 0, free: 0, usagePercent: 0 };
    try {
      const stats = await fs.statfs(process.cwd());
      const total = stats.blocks * stats.frsize;
      const free = stats.bavail * stats.frsize;
      const used = total - free;
      diskUsage = {
        total,
        used,
        free,
        usagePercent: (used / total) * 100
      };
    } catch (error) {
      logger.warn('Failed to get disk usage:', error);
    }

    // 获取目录大小
    const { FileSystemLockService } = await import('./file-system-lock.service');
    const jobsSize = await FileSystemLockService.getDirectorySize(path.join(process.cwd(), 'jobs'));
    const tempSize = await FileSystemLockService.getDirectorySize(path.join(process.cwd(), 'temp'));

    return {
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usagePercent: Math.round(memoryUsagePercent * 100) / 100
      },
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        loadAverage: loadAverage.map((load: number) => Math.round(load * 100) / 100)
      },
      disk: {
        total: diskUsage.total,
        used: diskUsage.used,
        free: diskUsage.free,
        usagePercent: Math.round(diskUsage.usagePercent * 100) / 100
      },
      directories: {
        jobsSize,
        tempSize,
        totalSize: jobsSize + tempSize
      },
      uptime: os.uptime(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to get system resources:', error);
    throw error;
  }
};



// Audit Log Helper
const createAuditLog = async (
  actorId: string,
  action: string,
  targetId: string,
  details?: Record<string, any>
) => {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      targetId,
      details: details || {},
    },
  });
};