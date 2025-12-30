import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

// Define a custom error interface to ensure error objects have a status property
interface AppError extends Error {
  statusCode?: number;
}

/**
 * Custom error handler middleware for Express.
 *
 * This middleware catches all errors that occur in the route handlers
 * and sends a standardized JSON error response.
 *
 * @param err The error object. Can be a standard Error or a custom AppError.
 * @param req The Express request object.
 * @param res The Express response object.
 * @param next The Express next function.
 */
export const errorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {
  // If the headers have already been sent to the client, delegate to the default Express error handler.
  // This is important for cases like streaming responses where the error occurs after the response has started.
  if (res.headersSent) {
    return next(err);
  }

  // Determine the status code. Default to 500 (Internal Server Error) if not specified.
  const statusCode = err.statusCode || 500;

  // Log the error using structured logging
  const errorLogger = (req as any).logger || logger;
  errorLogger.error({
    error: {
      message: err.message,
      stack: err.stack,
      statusCode: statusCode,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
    },
    user: (req as any).user ? { id: (req as any).user.id, email: (req as any).user.email } : null,
  }, 'Application error occurred');

  // Send a standardized error response to the client.
  res.status(statusCode).json({
    status: 'error',
    statusCode: statusCode,
    message: err.message || 'An unexpected error occurred.',
    // Optionally, include the stack trace in development mode for easier debugging.
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}; 