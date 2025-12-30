import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/auth.context';
import { useToast } from '@/hooks/use-toast';

interface WebSocketHookOptions {
  onTaskStatusUpdate?: (data: any) => void;
  onQueueUpdate?: (data: any) => void;
  onError?: (error: any) => void;
}

/**
 * WebSocket Hook - 实现实时任务状态更新
 */
export const useWebSocket = (options: WebSocketHookOptions = {}) => {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { onTaskStatusUpdate, onQueueUpdate, onError } = options;

  // 连接WebSocket
  const connect = useCallback(() => {
    console.log('🔗 Attempting WebSocket connection...', { user: !!user });

    if (!user) {
      console.log('❌ WebSocket connection skipped: missing user');
      return;
    }

    // 如果已经连接，先断开
    if (socketRef.current?.connected) {
      console.log('🔌 Disconnecting existing WebSocket connection');
      socketRef.current.disconnect();
    }

    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
    console.log('🌐 WebSocket connecting to:', API_BASE);

    socketRef.current = io(API_BASE, {
      withCredentials: true, // 重要：允许发送Cookie
      auth: {
        token: token // 传递认证token
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      forceNew: true
    });

    const socket = socketRef.current;

    // 连接成功
    socket.on('connect', () => {
      console.log('🔗 WebSocket connected successfully:', socket.id);

      // 清除重连定时器
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    // 连接错误
    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      
      if (onError) {
        onError(error);
      } else {
        toast({
          title: "连接错误",
          description: "WebSocket连接失败，将使用轮询模式",
          variant: "destructive",
        });
      }
    });

    // 任务状态更新
    socket.on('task_status_update', (data) => {
      console.log('📊 Task status update received:', data);
      
      if (onTaskStatusUpdate) {
        onTaskStatusUpdate(data);
      }
    });

    // 队列状态更新
    socket.on('queue_update', (data) => {
      console.log('📋 Queue update received:', data);
      
      if (onQueueUpdate) {
        onQueueUpdate(data);
      }
    });

    // 错误处理
    socket.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      
      if (onError) {
        onError(error);
      }
    });

    // 断开连接
    socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      
      // 如果是非正常断开，尝试重连
      if (reason === 'io server disconnect' || reason === 'transport close') {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Attempting to reconnect WebSocket...');
          connect();
        }, 1000); // 减少重连延迟从3秒到1秒
      }
    });

  }, [user, token, onTaskStatusUpdate, onQueueUpdate, onError, toast]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // 订阅任务更新
  const subscribeToTask = useCallback((taskId: string) => {
    console.log('📡 Attempting to subscribe to task updates:', taskId, 'Connected:', socketRef.current?.connected);
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_task_updates', taskId);
      console.log('📡 Subscribed to task updates:', taskId);
    } else {
      console.log('❌ Cannot subscribe: WebSocket not connected');
      // 如果WebSocket未连接，尝试重新连接
      if (user) {
        console.log('🔄 Attempting to reconnect WebSocket for task subscription');
        connect();
        // 延迟订阅，等待连接建立
        setTimeout(() => {
          if (socketRef.current?.connected) {
            socketRef.current.emit('subscribe_task_updates', taskId);
            console.log('📡 Subscribed to task updates after reconnection:', taskId);
          }
        }, 1000);
      }
    }
  }, [user, connect]);

  // 取消订阅任务更新
  const unsubscribeFromTask = useCallback((taskId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe_task_updates', taskId);
      console.log('📡 Unsubscribed from task updates:', taskId);
    }
  }, []);

  // 获取任务状态
  const getTaskStatus = useCallback((taskId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('get_task_status', taskId);
      console.log('📊 Requested task status:', taskId);
    }
  }, []);

  // 检查连接状态
  const isConnected = useCallback(() => {
    return socketRef.current?.connected || false;
  }, []);

  // 组件挂载时连接
  useEffect(() => {
    if (user) {
      connect();
    }

    // 组件卸载时断开连接
    return () => {
      disconnect();
    };
  }, [user, connect, disconnect]);

  return {
    connect,
    disconnect,
    subscribeToTask,
    unsubscribeFromTask,
    getTaskStatus,
    isConnected,
    socket: socketRef.current
  };
};

export default useWebSocket;
