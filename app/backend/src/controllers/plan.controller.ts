import { Request, Response } from 'express';
import * as planService from '../services/plan.service';
import * as planFeaturesService from '../services/plan-features.service';

/**
 * @description Get all available plans
 * @route GET /api/plans
 */
export const getPlans = async (req: Request, res: Response) => {
  try {
    const plans = await planService.findAllPlans();
    res.status(200).json(plans);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching plans', error });
  }
};

/**
 * @description Get all available plans with their features (enhanced version)
 * @route GET /api/plans/features
 */
export const getAllPlansWithFeatures = async (req: Request, res: Response) => {
  try {
    const plans = await planFeaturesService.getAllPlans();
    res.json(plans);
  } catch (error) {
    res.status(500).json({
      message: 'Error retrieving plans with features',
      error: (error as Error).message
    });
  }
};

/**
 * @description Get specific plan features
 * @route GET /api/plans/:planId/features
 */
export const getPlanFeatures = async (req: Request, res: Response) => {
  const { planId } = req.params;

  try {
    const planFeatures = await planFeaturesService.getPlanFeatures(planId);
    res.json(planFeatures);
  } catch (error) {
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({ message: (error as Error).message });
    }
    res.status(500).json({
      message: 'Error retrieving plan features',
      error: (error as Error).message
    });
  }
};