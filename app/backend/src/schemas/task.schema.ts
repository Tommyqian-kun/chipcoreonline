import { z } from 'zod';

/**
 * Schema for submitting a new task.
 * Validates that `toolId` is a non-empty string in the request body.
 * The `parameters` field is optional and expected to be a JSON string.
 * 修复：Multer处理FormData时直接将字段放到req.body，不需要嵌套body对象
 */
export const submitTaskSchema = z.object({
  body: z.object({
    toolId: z.string({ required_error: 'Tool ID is required.' }).min(1, 'Tool ID cannot be empty.'),
    parameters: z.string().optional(), // Assuming parameters are passed as a JSON string
  }),
});

/**
 * Schema for getting a task's status.
 * Validates that `taskId` is a UUID v4 in the route parameters.
 */
export const getTaskStatusSchema = z.object({
  params: z.object({
    taskId: z.string().uuid({ message: "Invalid Task ID format." }),
  }),
});

/**
 * Schema for generating a pre-signed download URL.
 * Validates `taskId` in params and the `type` in query.
 */
export const getDownloadUrlSchema = z.object({
  params: z.object({
    taskId: z.string().uuid({ message: "Invalid Task ID format." }),
  }),
  query: z.object({
    type: z.enum(['result', 'log'], { required_error: "Download type is required ('result' or 'log')." }),
  }),
});