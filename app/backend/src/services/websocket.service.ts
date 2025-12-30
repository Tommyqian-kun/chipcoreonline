import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/database';
import logger from '../config/logger';
import { TaskStatus } from '@prisma/client';
import { getResourceManager } from './resource-manager.service';

/**
 * WebSocket服务 - 实现实时任务状态推送
 */
export class WebSocketService {
  private io: SocketIOServer;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>
  private resourceManager = getResourceManager();

  constructor(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * 设置认证中间件
   */
  private setupMiddleware(): void {
    this.io.use(async (socket, next) => {
      try {
        // 从cookie或查询参数中获取token
        const token = socket.handshake.auth.token || 
                     socket.handshake.headers.cookie?.split('access_token=')[1]?.split(';')[0];

        if (!token) {
          return next(new Error('Authentication token missing'));
        }

        // 验证JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
        
        // 验证用户是否存在
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: { id: true, email: true, role: true }
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        // 将用户信息附加到socket
        socket.data.user = user;
        next();

      } catch (error) {
        logger.error({ error }, 'WebSocket authentication failed');
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    this.io.on('connection', async (socket) => {
      const userId = socket.data.user.id;
      
      logger.info({
        socketId: socket.id,
        userId,
        userEmail: socket.data.user.email
      }, 'User connected to WebSocket');

      // 将socket添加到用户socket集合
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // 用户加入个人房间
      socket.join(`user_${userId}`);

      // 使用资源管理器管理WebSocket连接
      try {
        await this.resourceManager.createWebSocketConnection(
          socket.id,
          userId,
          () => {
            // 清理回调函数
            const userSocketSet = this.userSockets.get(userId);
            if (userSocketSet) {
              userSocketSet.delete(socket.id);
              if (userSocketSet.size === 0) {
                this.userSockets.delete(userId);
              }
            }
          }
        );
      } catch (error) {
        logger.error({ error, socketId: socket.id, userId }, 'Failed to register WebSocket resource');
      }

      // 处理客户端事件
      socket.on('subscribe_task_updates', (taskId: string) => {
        this.handleTaskSubscription(socket, taskId);
      });

      socket.on('unsubscribe_task_updates', (taskId: string) => {
        this.handleTaskUnsubscription(socket, taskId);
      });

      socket.on('get_task_status', async (taskId: string) => {
        await this.handleTaskStatusRequest(socket, taskId);
      });

      // 处理断开连接
      socket.on('disconnect', async (reason) => {
        logger.info({
          socketId: socket.id,
          userId,
          reason
        }, 'User disconnected from WebSocket');

        // 使用资源管理器释放WebSocket连接资源
        await this.resourceManager.releaseResource(socket.id);
      });
    });
  }

  /**
   * 处理任务订阅
   */
  private async handleTaskSubscription(socket: any, taskId: string): Promise<void> {
    try {
      const userId = socket.data.user.id;

      // 验证taskId是否有效
      if (!taskId || taskId === 'undefined' || taskId === 'null') {
        logger.warn({
          socketId: socket.id,
          userId,
          taskId
        }, 'Invalid taskId for subscription');
        socket.emit('error', {
          message: 'Invalid task ID',
          code: 'INVALID_TASK_ID'
        });
        return;
      }

      // 验证用户是否有权限访问该任务
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          userId: userId
        },
        select: { id: true, status: true, createdAt: true, updatedAt: true }
      });

      if (!task) {
        socket.emit('error', {
          message: 'Task not found or access denied',
          code: 'TASK_ACCESS_DENIED'
        });
        return;
      }

      // 加入任务特定房间
      socket.join(`task_${taskId}`);
      
      // 发送当前任务状态
      socket.emit('task_status_update', {
        taskId,
        status: task.status,
        updatedAt: task.updatedAt.toISOString()
      });

      logger.info({
        socketId: socket.id,
        userId,
        taskId
      }, 'User subscribed to task updates');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        userId: socket.data.user.id
      }, 'Error handling task subscription');

      socket.emit('error', {
        message: 'Failed to subscribe to task updates',
        code: 'SUBSCRIPTION_ERROR'
      });
    }
  }

  /**
   * 处理任务取消订阅
   */
  private handleTaskUnsubscription(socket: any, taskId: string): void {
    socket.leave(`task_${taskId}`);
    
    logger.info({
      socketId: socket.id,
      userId: socket.data.user.id,
      taskId
    }, 'User unsubscribed from task updates');
  }

  /**
   * 处理任务状态请求
   */
  private async handleTaskStatusRequest(socket: any, taskId: string): Promise<void> {
    try {
      const userId = socket.data.user.id;

      // 验证taskId是否有效
      if (!taskId || taskId === 'undefined' || taskId === 'null') {
        logger.warn({
          socketId: socket.id,
          userId,
          taskId
        }, 'Invalid taskId for status request');
        socket.emit('error', {
          message: 'Invalid task ID',
          code: 'INVALID_TASK_ID'
        });
        return;
      }

      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          userId: userId
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          outputFile: true,
          logFile: true
        }
      });

      if (!task) {
        socket.emit('error', {
          message: 'Task not found or access denied',
          code: 'TASK_ACCESS_DENIED'
        });
        return;
      }

      socket.emit('task_status_response', {
        taskId,
        status: task.status,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        hasOutput: !!task.outputFile,
        hasLog: !!task.logFile
      });

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        userId: socket.data.user.id
      }, 'Error handling task status request');

      socket.emit('error', {
        message: 'Failed to get task status',
        code: 'STATUS_REQUEST_ERROR'
      });
    }
  }

  /**
   * 通知任务状态更新
   */
  public notifyTaskStatusUpdate(
    userId: string,
    taskId: string,
    status: TaskStatus,
    additionalData?: any
  ): void {
    const updateData = {
      taskId,
      status,
      timestamp: new Date().toISOString(),
      ...additionalData
    };

    // 发送给特定用户
    this.io.to(`user_${userId}`).emit('task_status_update', updateData);
    
    // 发送给订阅该任务的所有socket
    this.io.to(`task_${taskId}`).emit('task_status_update', updateData);

    logger.info({
      userId,
      taskId,
      status,
      additionalData
    }, 'Task status update notification sent');
  }

  /**
   * 通知队列状态更新
   */
  public notifyQueueUpdate(userId: string, queueData: any): void {
    this.io.to(`user_${userId}`).emit('queue_update', {
      ...queueData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 广播系统通知
   */
  public broadcastSystemNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    this.io.emit('system_notification', {
      message,
      type,
      timestamp: new Date().toISOString()
    });

    logger.info({
      message,
      type,
      connectedUsers: this.userSockets.size
    }, 'System notification broadcasted');
  }

  /**
   * 获取在线用户统计
   */
  public getOnlineStats(): {
    totalConnections: number;
    uniqueUsers: number;
    userConnections: Record<string, number>;
  } {
    const userConnections: Record<string, number> = {};
    
    for (const [userId, sockets] of this.userSockets.entries()) {
      userConnections[userId] = sockets.size;
    }

    return {
      totalConnections: this.io.sockets.sockets.size,
      uniqueUsers: this.userSockets.size,
      userConnections
    };
  }
}

// 单例实例
let webSocketService: WebSocketService | null = null;

export const initializeWebSocket = (server: HttpServer): WebSocketService => {
  if (!webSocketService) {
    webSocketService = new WebSocketService(server);
    logger.info('WebSocket service initialized');
  }
  return webSocketService;
};

export const getWebSocketService = (): WebSocketService | null => {
  return webSocketService;
};
