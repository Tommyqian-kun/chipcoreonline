import { prisma } from '../utils/database';
import logger from '../config/logger';
import { redisPool } from './redis-pool.service';
import { updateTaskStatusInternal } from './task.service';

const PENDING_SET_KEY = 'task_status_sync_pending';
const PAYLOAD_HASH_KEY = 'task_status_sync_payload';

export class TaskStatusSyncQueueService {
  private static instance: TaskStatusSyncQueueService;
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 30000;

  private constructor() {}

  public static getInstance(): TaskStatusSyncQueueService {
    if (!TaskStatusSyncQueueService.instance) {
      TaskStatusSyncQueueService.instance = new TaskStatusSyncQueueService();
    }
    return TaskStatusSyncQueueService.instance;
  }

  public start(): void {
    if (this.syncInterval) {
      logger.warn('Task status sync queue service is already running');
      return;
    }

    logger.info('Starting task status sync queue service');
    this.syncInterval = setInterval(async () => {
      try {
        await this.processPending();
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Error during task status sync queue processing');
      }
    }, this.SYNC_INTERVAL_MS);
  }

  public stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Stopped task status sync queue service');
    }
  }

  private async processPending(): Promise<void> {
    const redisClient = redisPool.getClient();
    const pendingTaskIds = await redisClient.smembers(PENDING_SET_KEY);
    if (!pendingTaskIds.length) return;

    for (const taskId of pendingTaskIds) {
      try {
        const payloadJson = await redisClient.hget(PAYLOAD_HASH_KEY, taskId);
        let payload: any = null;

        if (payloadJson) {
          try {
            payload = JSON.parse(payloadJson);
            if (payload?.finishedAt && typeof payload.finishedAt === 'string') {
              const parsedFinishedAt = new Date(payload.finishedAt);
              if (!Number.isNaN(parsedFinishedAt.getTime())) {
                payload.finishedAt = parsedFinishedAt;
              } else {
                delete payload.finishedAt;
              }
            }
          } catch (parseError) {
            logger.warn({ taskId }, 'Failed to parse status sync payload, falling back to DB');
          }
        }

        if (!payload) {
          const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: {
              status: true,
              errorMessage: true,
              finishedAt: true,
              outputFile: true,
              downloadStatus: true,
              downloadTimeRemaining: true,
              currentStep: true,
              progress: true
            }
          });

          if (!task) {
            await redisClient.srem(PENDING_SET_KEY, taskId);
            await redisClient.hdel(PAYLOAD_HASH_KEY, taskId);
            continue;
          }

          payload = {
            status: task.status,
            errorMessage: task.errorMessage,
            finishedAt: task.finishedAt ? new Date(task.finishedAt) : undefined,
            outputFile: task.outputFile || undefined,
            downloadStatus: task.downloadStatus || undefined,
            downloadTimeRemaining: task.downloadTimeRemaining ?? undefined,
            currentStep: task.currentStep || undefined,
            progress: task.progress ?? undefined
          };
        }

        await updateTaskStatusInternal(taskId, payload);
        await redisClient.srem(PENDING_SET_KEY, taskId);
        await redisClient.hdel(PAYLOAD_HASH_KEY, taskId);
        logger.info({ taskId }, 'Recovered task status sync from queue');
      } catch (error) {
        logger.error({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to process task status sync payload');
      }
    }
  }
}

let taskStatusSyncQueueService: TaskStatusSyncQueueService | null = null;

export const initializeTaskStatusSyncQueueService = (): TaskStatusSyncQueueService => {
  if (!taskStatusSyncQueueService) {
    taskStatusSyncQueueService = TaskStatusSyncQueueService.getInstance();
    taskStatusSyncQueueService.start();
  }
  return taskStatusSyncQueueService;
};

export const getTaskStatusSyncQueueService = (): TaskStatusSyncQueueService | null => {
  return taskStatusSyncQueueService;
};
