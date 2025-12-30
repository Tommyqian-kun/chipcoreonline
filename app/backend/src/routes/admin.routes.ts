import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { Role } from '@prisma/client';
import * as adminController from '../controllers/admin.controller';
import { getAllFeedback, getFeedbackById, updateFeedback } from '../controllers/feedback.controller';
import logManagementRoutes from './admin/log-management';

const router = Router();

// 所有admin路由都需要认证和ADMIN角色
router.use(authenticateToken);
router.use(requireRole(Role.ADMIN));

// Dashboard API
router.get('/dashboard/stats', adminController.getDashboardStats);

// Users Management API
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId', adminController.updateUser);
router.delete('/users/:userId', adminController.deleteUser);

// Tasks Management API
router.get('/tasks', adminController.getTasks);
router.get('/tasks/:taskId', adminController.getTaskById);

// Orders Management API
router.get('/orders', adminController.getOrders);
router.get('/orders/:orderId', adminController.getOrderById);

// Subscriptions Management API
router.get('/subscriptions', adminController.getSubscriptions);
router.put('/subscriptions/:subId', adminController.updateSubscription);

// Plans Management API
router.get('/plans', adminController.getPlans);
router.post('/plans', adminController.createPlan);
router.put('/plans/:planId', adminController.updatePlan);
router.delete('/plans/:planId', adminController.deletePlan);

// Tools Management API
router.get('/tools', adminController.getTools);
router.get('/tools/analytics', adminController.getToolsAnalytics);
router.post('/tools', adminController.createTool);
router.get('/tools/:toolId', adminController.getToolById);
router.put('/tools/:toolId', adminController.updateTool);
router.delete('/tools/:toolId', adminController.deleteTool);

// Feedback Management API
router.get('/feedback', getAllFeedback);
router.get('/feedback/:id', getFeedbackById);
router.patch('/feedback/:id', updateFeedback);

// System Monitoring API
router.get('/system/logs', adminController.getSystemLogs);
router.get('/system/metrics', adminController.getSystemMetrics);
router.get('/system/resources', adminController.getSystemResources);

// Task Log Management API
router.use('/logs', logManagementRoutes);

export default router;