import { Request, Response } from 'express';
import { z } from 'zod';
import * as feedbackService from '../services/feedback.service';
import logger from '../config/logger';

const createFeedbackSchema = z.object({
  firstName: z.string().min(1, '姓氏不能为空').max(50, '姓氏不能超过50个字符'),
  lastName: z.string().min(1, '名字不能为空').max(50, '名字不能超过50个字符'),
  email: z.string().email('请输入有效的电子邮箱地址'),
  message: z.string().min(10, '消息内容至少需要10个字符').max(1000, '消息内容不能超过1000个字符'),
});

const updateFeedbackSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  response: z.string().max(2000, '回复内容不能超过2000个字符').optional(),
});

/**
 * @description Create a new feedback
 * @route POST /api/v1/feedback
 */
export const createFeedback = async (req: Request, res: Response) => {
  try {
    const validation = createFeedbackSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: '输入数据验证失败',
        errors: validation.error.errors
      });
    }

    const feedback = await feedbackService.createFeedback(validation.data);
    
    logger.info({
      feedbackId: feedback.id,
      email: feedback.email,
    }, 'New feedback created');

    res.status(201).json({
      success: true,
      data: {
        id: feedback.id,
        message: '反馈提交成功，我们会尽快与您联系'
      }
    });
  } catch (error) {
    logger.error({ error }, 'Error creating feedback');
    res.status(500).json({
      success: false,
      message: '提交反馈失败，请稍后重试'
    });
  }
};

/**
 * @description Get all feedback (Admin only)
 * @route GET /api/v1/admin/feedback
 */
export const getAllFeedback = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;

    const result = await feedbackService.getAllFeedback({
      page,
      limit,
      status: status as any
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching feedback');
    res.status(500).json({
      success: false,
      message: '获取反馈列表失败'
    });
  }
};

/**
 * @description Get feedback by ID (Admin only)
 * @route GET /api/v1/admin/feedback/:id
 */
export const getFeedbackById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const feedback = await feedbackService.getFeedbackById(id);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: '反馈不存在'
      });
    }

    res.status(200).json({
      success: true,
      data: feedback
    });
  } catch (error) {
    logger.error({ error, feedbackId: req.params.id }, 'Error fetching feedback');
    res.status(500).json({
      success: false,
      message: '获取反馈详情失败'
    });
  }
};

/**
 * @description Update feedback status/response (Admin only)
 * @route PATCH /api/v1/admin/feedback/:id
 */
export const updateFeedback = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validation = updateFeedbackSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: '输入数据验证失败',
        errors: validation.error.errors
      });
    }

    const feedback = await feedbackService.updateFeedback(id, validation.data);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: '反馈不存在'
      });
    }

    logger.info({
      feedbackId: id,
      adminId: req.user?.id,
      updates: validation.data
    }, 'Feedback updated by admin');

    res.status(200).json({
      success: true,
      data: feedback
    });
  } catch (error) {
    logger.error({ error, feedbackId: req.params.id }, 'Error updating feedback');
    res.status(500).json({
      success: false,
      message: '更新反馈失败'
    });
  }
};
