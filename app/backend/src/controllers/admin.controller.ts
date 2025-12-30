import { Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import * as monitoringService from '../services/monitoring.service';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Dashboard Statistics
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const stats = await adminService.getDashboardStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ 
      message: 'Error fetching dashboard statistics', 
      error: (error as Error).message 
    });
  }
};

// Users Management
const paginationSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  limit: z.string().transform(val => parseInt(val) || 10).optional(),
  search: z.string().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const getUsers = async (req: Request, res: Response) => {
  const validation = paginationSchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const result = await adminService.getUsers(validation.data);
    res.json(result);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      message: 'Error fetching users', 
      error: (error as Error).message 
    });
  }
};

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
});

export const createUser = async (req: Request, res: Response) => {
  const validation = createUserSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const user = await adminService.createUser(validation.data, req.user!.id);
    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    if ((error as Error).message.includes('already exists')) {
      return res.status(409).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error creating user', 
      error: (error as Error).message 
    });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    const user = await adminService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      message: 'Error fetching user', 
      error: (error as Error).message 
    });
  }
};

const updateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  isVerified: z.boolean().optional(),
});

export const updateUser = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const validation = updateUserSchema.safeParse(req.body);
  
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const user = await adminService.updateUser(userId, validation.data, req.user!.id);
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error updating user', 
      error: (error as Error).message 
    });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    await adminService.deleteUser(userId, req.user!.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    if ((error as Error).message.includes('cannot delete yourself')) {
      return res.status(400).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error deleting user', 
      error: (error as Error).message 
    });
  }
};

// Tasks Management
const tasksPaginationSchema = paginationSchema.extend({
  status: z.string().optional(),
  toolId: z.string().optional(),
  deploymentMode: z.string().optional(),
});

export const getTasks = async (req: Request, res: Response) => {
  const validation = tasksPaginationSchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const result = await adminService.getTasks(validation.data);
    res.json(result);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      message: 'Error fetching tasks',
      error: (error as Error).message
    });
  }
};

export const getTaskById = async (req: Request, res: Response) => {
  const { taskId } = req.params;

  try {
    const task = await adminService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ 
      message: 'Error fetching task', 
      error: (error as Error).message 
    });
  }
};

// Orders Management
export const getOrders = async (req: Request, res: Response) => {
  const validation = paginationSchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const result = await adminService.getOrders(validation.data);
    res.json(result);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      message: 'Error fetching orders', 
      error: (error as Error).message 
    });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  const { orderId } = req.params;

  try {
    const order = await adminService.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ 
      message: 'Error fetching order', 
      error: (error as Error).message 
    });
  }
};

// Subscriptions Management
export const getSubscriptions = async (req: Request, res: Response) => {
  const validation = paginationSchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const result = await adminService.getSubscriptions(validation.data);
    res.json(result);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ 
      message: 'Error fetching subscriptions', 
      error: (error as Error).message 
    });
  }
};

const updateSubscriptionSchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELED', 'EXPIRED']).optional(),
  endDate: z.string().datetime().optional(),
});

export const updateSubscription = async (req: Request, res: Response) => {
  const { subId } = req.params;
  const validation = updateSubscriptionSchema.safeParse(req.body);
  
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const subscription = await adminService.updateSubscription(subId, validation.data, req.user!.id);
    res.json(subscription);
  } catch (error) {
    console.error('Error updating subscription:', error);
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error updating subscription', 
      error: (error as Error).message 
    });
  }
};

// Plans Management
export const getPlans = async (req: Request, res: Response) => {
  try {
    const plans = await adminService.getPlans();
    res.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ 
      message: 'Error fetching plans', 
      error: (error as Error).message 
    });
  }
};

const createPlanSchema = z.object({
  name: z.string().min(2, 'Plan name must be at least 2 characters'),
  description: z.string().optional(),
  priceMonth: z.number().min(0, 'Monthly price must be non-negative'),
  priceYear: z.number().min(0, 'Yearly price must be non-negative'),
  features: z.record(z.any()), // JSON object
});

export const createPlan = async (req: Request, res: Response) => {
  const validation = createPlanSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const plan = await adminService.createPlan(validation.data, req.user!.id);
    res.status(201).json(plan);
  } catch (error) {
    console.error('Error creating plan:', error);
    if ((error as Error).message.includes('already exists')) {
      return res.status(409).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error creating plan', 
      error: (error as Error).message 
    });
  }
};

const updatePlanSchema = z.object({
  name: z.string().min(2, 'Plan name must be at least 2 characters').optional(),
  description: z.string().optional(),
  priceMonth: z.number().min(0, 'Monthly price must be non-negative').optional(),
  priceYear: z.number().min(0, 'Yearly price must be non-negative').optional(),
  features: z.record(z.any()).optional(), // JSON object
});

export const updatePlan = async (req: Request, res: Response) => {
  const { planId } = req.params;
  const validation = updatePlanSchema.safeParse(req.body);
  
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const plan = await adminService.updatePlan(planId, validation.data, req.user!.id);
    res.json(plan);
  } catch (error) {
    console.error('Error updating plan:', error);
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    if ((error as Error).message.includes('already exists')) {
      return res.status(409).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error updating plan', 
      error: (error as Error).message 
    });
  }
};

export const deletePlan = async (req: Request, res: Response) => {
  const { planId } = req.params;

  try {
    await adminService.deletePlan(planId, req.user!.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting plan:', error);
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    if ((error as Error).message.includes('has active subscriptions')) {
      return res.status(400).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error deleting plan', 
      error: (error as Error).message 
    });
  }
};

// Tools Management
export const getTools = async (req: Request, res: Response) => {
  try {
    const tools = await adminService.getTools();
    res.json(tools);
  } catch (error) {
    console.error('Error fetching tools:', error);
    res.status(500).json({ 
      message: 'Error fetching tools', 
      error: (error as Error).message 
    });
  }
};

const createToolSchema = z.object({
  name: z.string().min(2, 'Tool name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  inputSchema: z.record(z.any()), // JSON object
  dockerImage: z.string().min(1, 'Docker image is required'),
  version: z.string().min(1, 'Version is required'),
  configTemplate: z.record(z.any()).optional(), // JSON object
  isPublic: z.boolean().default(true),
});

export const createTool = async (req: Request, res: Response) => {
  const validation = createToolSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const tool = await adminService.createTool(validation.data, req.user!.id);
    res.status(201).json(tool);
  } catch (error) {
    console.error('Error creating tool:', error);
    if ((error as Error).message.includes('already exists')) {
      return res.status(409).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error creating tool', 
      error: (error as Error).message 
    });
  }
};

export const getToolById = async (req: Request, res: Response) => {
  const { toolId } = req.params;

  try {
    const tool = await adminService.getToolById(toolId);
    if (!tool) {
      return res.status(404).json({ message: 'Tool not found' });
    }
    res.json(tool);
  } catch (error) {
    console.error('Error fetching tool:', error);
    res.status(500).json({ 
      message: 'Error fetching tool', 
      error: (error as Error).message 
    });
  }
};

const updateToolSchema = z.object({
  name: z.string().min(2, 'Tool name must be at least 2 characters').optional(),
  description: z.string().min(10, 'Description must be at least 10 characters').optional(),
  inputSchema: z.record(z.any()).optional(), // JSON object
  dockerImage: z.string().min(1, 'Docker image is required').optional(),
  version: z.string().min(1, 'Version is required').optional(),
  configTemplate: z.record(z.any()).optional(), // JSON object
  isPublic: z.boolean().optional(),
});

export const updateTool = async (req: Request, res: Response) => {
  const { toolId } = req.params;
  const validation = updateToolSchema.safeParse(req.body);
  
  if (!validation.success) {
    return res.status(400).json({ errors: validation.error.errors });
  }

  try {
    const tool = await adminService.updateTool(toolId, validation.data, req.user!.id);
    res.json(tool);
  } catch (error) {
    console.error('Error updating tool:', error);
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    if ((error as Error).message.includes('already exists')) {
      return res.status(409).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error updating tool', 
      error: (error as Error).message 
    });
  }
};

export const deleteTool = async (req: Request, res: Response) => {
  const { toolId } = req.params;

  try {
    await adminService.deleteTool(toolId, req.user!.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting tool:', error);
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    if ((error as Error).message.includes('has associated tasks')) {
      return res.status(400).json({ message: (error as Error).message });
    }
    res.status(500).json({ 
      message: 'Error deleting tool', 
      error: (error as Error).message 
    });
  }
};

// System Monitoring APIs
export const getSystemMetrics = async (req: Request, res: Response) => {
  try {
    const result = await adminService.getSystemMetrics();
    res.json(result);
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    res.status(500).json({
      message: 'Error fetching system metrics',
      error: (error as Error).message
    });
  }
};

export const getSystemResources = async (req: Request, res: Response) => {
  try {
    const result = await adminService.getSystemResources();
    res.json(result);
  } catch (error) {
    console.error('Error fetching system resources:', error);
    res.status(500).json({
      message: 'Error fetching system resources',
      error: (error as Error).message
    });
  }
};

export const getSystemLogs = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const level = req.query.level as string;
    const module = req.query.module as string;
    const search = req.query.search as string;

    const logs = await adminService.getSystemLogs({
      page,
      limit,
      level,
      module,
      search
    });

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({
      message: 'Error fetching system logs',
      error: (error as Error).message
    });
  }
};

export const getToolsAnalytics = async (req: Request, res: Response) => {
  try {
    const analytics = await adminService.getToolsAnalytics();
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching tools analytics:', error);
    res.status(500).json({
      message: 'Error fetching tools analytics',
      error: (error as Error).message
    });
  }
};