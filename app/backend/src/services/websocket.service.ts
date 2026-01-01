import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/database';
import logger from '../config/logger';
import { TaskStatus } from '@prisma/client';
import { getResourceManager } from './resource-manager.service';

/**
 * WebSocket速率限制配置（基于实际生产场景优化）
 *
 * 场景分析：
 * - 芯片设计工程师可能同时打开多个浏览器标签查看不同任务
 * - 用户可能频繁刷新页面（每次刷新会断开旧连接，建立新连接）
 * - 一个任务可能被多个页面同时订阅
 * - 实时状态更新是核心功能，限制不能影响正常使用
 *
 * 配置原则：
 * - 不限制连接数（受浏览器和用户并发限制保护）
 * - 防止客户端代码bug（事件速率限制）
 * - 防止内存溢出（订阅数量限制）
 */
const WS_RATE_LIMIT_CONFIG = {
  // 事件速率限制：防止客户端代码bug导致无限循环
  // 正常使用：用户主动操作（订阅、查询）频率很低
  MAX_EVENTS_PER_SECOND: 60,  // 每秒60个事件（足够正常使用）
  EVENT_WINDOW_MS: 1000,

  // 订阅限制：基于实际任务数量
  // 正常使用：一个工程师可能同时监控10-20个任务
  // 多页面场景：每个任务可能被多个页面订阅
  MAX_SUBSCRIPTIONS_PER_SOCKET: 100,  // 每个socket最多100个任务订阅
};

/**
 * 速率限制跟踪器（仅限制事件频率，不限制连接）
 */
class RateLimitTracker {
  private eventCounts: Map<string, { count: number; resetTime: number }> = new Map(); // socketId -> {count, resetTime}

  /**
   * 检查事件速率限制
   */
  canEmitEvent(socketId: string): boolean {
    const now = Date.now();
    const tracking = this.eventCounts.get(socketId);

    if (!tracking || now >= tracking.resetTime) {
      // 重置计数器
      this.eventCounts.set(socketId, {
        count: 1,
        resetTime: now + WS_RATE_LIMIT_CONFIG.EVENT_WINDOW_MS
      });
      return true;
    }

    if (tracking.count >= WS_RATE_LIMIT_CONFIG.MAX_EVENTS_PER_SECOND) {
      logger.warn({
        socketId,
        count: tracking.count
      }, 'WebSocket event rate limit exceeded');
      return false;
    }

    tracking.count++;
    return true;
  }

  /**
   * 清理socket相关数据
   */
  cleanupSocket(socketId: string): void {
    this.eventCounts.delete(socketId);
  }
}

/**
 * WebSocket服务 - 实现实时任务状态推送
 *
 * 安全机制：
 * - JWT认证验证用户身份
 * - 用户并发限制（已有其他服务实现）
 * - 事件速率限制防止客户端bug
 * - 订阅数量限制防止内存溢出
 */
export class WebSocketService {
  private io: SocketIOServer;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>
  private resourceManager = getResourceManager();
  private rateLimitTracker = new RateLimitTracker();
  private socketSubscriptions: Map<string, Set<string>> = new Map(); // socketId -> Set<taskId>

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
   * 设置事件处理器（包含事件速率限制）
   */
  private setupEventHandlers(): void {
    this.io.on('connection', async (socket) => {
      const userId = socket.data.user.id;

      logger.info({
        socketId: socket.id,
        userId,
        userEmail: socket.data.user.email
      }, 'User connected to WebSocket');

      // 初始化该socket的订阅集合
      this.socketSubscriptions.set(socket.id, new Set());

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
            // 清理订阅和速率限制跟踪
            this.socketSubscriptions.delete(socket.id);
            this.rateLimitTracker.cleanupSocket(socket.id);
          }
        );
      } catch (error) {
        logger.error({ error, socketId: socket.id, userId }, 'Failed to register WebSocket resource');
      }

      // 包装事件处理器以检查速率限制
      const withRateLimit = (eventName: string, handler: (...args: any[]) => void) => {
        socket.on(eventName, (...args: any[]) => {
          if (!this.rateLimitTracker.canEmitEvent(socket.id)) {
            socket.emit('error', {
              message: 'Event rate limit exceeded. Please slow down.',
              code: 'RATE_LIMIT_EXCEEDED'
            });
            return;
          }
          handler(...args);
        });
      };

      // 处理客户端事件（带事件速率限制）
      withRateLimit('subscribe_task_updates', (taskId: string) => {
        this.handleTaskSubscription(socket, taskId);
      });

      withRateLimit('unsubscribe_task_updates', (taskId: string) => {
        this.handleTaskUnsubscription(socket, taskId);
      });

      withRateLimit('get_task_status', async (taskId: string) => {
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

        // 清理订阅
        const subscriptions = this.socketSubscriptions.get(socket.id);
        if (subscriptions) {
          for (const taskId of subscriptions) {
            socket.leave(`task_${taskId}`);
          }
          this.socketSubscriptions.delete(socket.id);
        }

        // 清理速率限制跟踪
        this.rateLimitTracker.cleanupSocket(socket.id);
      });
    });
  }

  /**
   * 处理任务订阅（包含订阅限制）
   */
  private async handleTaskSubscription(socket: any, taskId: string): Promise<void> {
    try {
      const userId = socket.data.user.id;
      const socketId = socket.id;

      // 验证taskId是否有效
      if (!taskId || taskId === 'undefined' || taskId === 'null') {
        logger.warn({
          socketId,
          userId,
          taskId
        }, 'Invalid taskId for subscription');
        socket.emit('error', {
          message: 'Invalid task ID',
          code: 'INVALID_TASK_ID'
        });
        return;
      }

      // 检查订阅限制
      const subscriptions = this.socketSubscriptions.get(socketId) || new Set();
      if (subscriptions.size >= WS_RATE_LIMIT_CONFIG.MAX_SUBSCRIPTIONS_PER_SOCKET) {
        logger.warn({
          socketId,
          userId,
          currentSubscriptions: subscriptions.size,
          maxSubscriptions: WS_RATE_LIMIT_CONFIG.MAX_SUBSCRIPTIONS_PER_SOCKET
        }, 'WebSocket subscription limit exceeded');
        socket.emit('error', {
          message: `Maximum subscription limit reached (${WS_RATE_LIMIT_CONFIG.MAX_SUBSCRIPTIONS_PER_SOCKET} tasks)`,
          code: 'SUBSCRIPTION_LIMIT_EXCEEDED'
        });
        return;
      }

      // 检查是否已订阅
      if (subscriptions.has(taskId)) {
        logger.debug({
          socketId,
          userId,
          taskId
        }, 'Already subscribed to task');
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

      // 记录订阅
      subscriptions.add(taskId);
      this.socketSubscriptions.set(socketId, subscriptions);

      // 发送当前任务状态
      socket.emit('task_status_update', {
        taskId,
        status: task.status,
        updatedAt: task.updatedAt.toISOString()
      });

      logger.info({
        socketId,
        userId,
        taskId,
        totalSubscriptions: subscriptions.size
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
   * 处理任务取消订阅（包含订阅跟踪清理）
   */
  private handleTaskUnsubscription(socket: any, taskId: string): void {
    const socketId = socket.id;
    const userId = socket.data.user.id;

    socket.leave(`task_${taskId}`);

    // 清理订阅跟踪
    const subscriptions = this.socketSubscriptions.get(socketId);
    if (subscriptions) {
      subscriptions.delete(taskId);
      if (subscriptions.size === 0) {
        this.socketSubscriptions.delete(socketId);
      } else {
        this.socketSubscriptions.set(socketId, subscriptions);
      }
    }

    logger.info({
      socketId,
      userId,
      taskId,
      remainingSubscriptions: subscriptions?.size || 0
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
