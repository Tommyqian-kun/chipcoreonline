import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Creates a validation middleware using a Zod schema.
 * The middleware validates request body, query parameters, and route parameters.
 * @param schema The Zod schema to validate against.
 * @returns An Express middleware function.
 */
export const validate =
  (schema: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Provide detailed error messages from Zod
        return res.status(400).json({
          message: 'Validation failed',
          errors: error.flatten().fieldErrors,
        });
      }
      // Handle unexpected errors
      return res.status(500).json({
        message: 'Internal Server Error during validation',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }; 