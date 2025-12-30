import { Router } from 'express';
import * as planController from '../controllers/plan.controller';

const router = Router();

// 获取所有计划（原有API，保持兼容性）
router.get('/', planController.getPlans);

// 获取所有计划及其详细权益信息
router.get('/features', planController.getAllPlansWithFeatures);

// 获取特定计划的权益信息
router.get('/:planId/features', planController.getPlanFeatures);

export default router;