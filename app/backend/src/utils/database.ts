import { PrismaClient } from '@prisma/client';
import logger from '../config/logger';

// 数据库连接池配置
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
  // 恢复基本的连接池配置
  // 使用简单的配置，避免复杂的__internal设置
});

// 数据库查询日志记录
prisma.$on('query', (e) => {
  if (e.duration > 1000) { // 记录超过1秒的慢查询
    logger.warn({
      query: e.query,
      params: e.params,
      duration: e.duration,
      target: e.target
    }, 'Slow database query detected');
  }
});

prisma.$on('error', (e) => {
  logger.error({
    target: e.target,
    message: e.message
  }, 'Database error occurred');
});

// 数据库连接健康检查
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return false;
  }
};

// 获取数据库连接统计信息
export const getDatabaseStats = async () => {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to get database stats');
    return null;
  }
};

// 强制清理空闲连接
export const cleanupIdleConnections = async () => {
  try {
    // 终止空闲超过5分钟的连接
    await prisma.$queryRaw`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'idle'
        AND state_change < NOW() - INTERVAL '5 minutes'
        AND pid != pg_backend_pid()
    `;
    logger.info('Cleaned up idle database connections');
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup idle connections');
  }
};

export { prisma };

// 启动连接监控 (基于实际应用场景优化)
const startConnectionMonitoring = () => {
  // 每10分钟检查一次连接状态 (降低监控频率)
  setInterval(async () => {
    try {
      const stats = await getDatabaseStats();
      if (stats && Array.isArray(stats) && stats.length > 0) {
        const { total_connections, active_connections, idle_connections } = stats[0] as any;

        const totalConn = Number(total_connections);
        const activeConn = Number(active_connections);
        const idleConn = Number(idle_connections);

        logger.info({
          totalConnections: totalConn,
          activeConnections: activeConn,
          idleConnections: idleConn,
          connectionUtilization: `${Math.round((totalConn / 50) * 100)}%` // 基于50个最大连接
        }, 'Database connection stats');

        // 连接数告警阈值
        if (totalConn > 40) { // 80%阈值告警
          logger.warn({
            totalConnections: totalConn,
            maxConnections: 50,
            utilizationPercent: Math.round((totalConn / 50) * 100)
          }, 'Database connection pool near capacity');
        }

        // 如果空闲连接过多，清理它们 (调整阈值)
        if (idleConn > 5) { // 降低清理阈值
          await cleanupIdleConnections();
        }
      }
    } catch (error) {
      logger.error({ error }, 'Connection monitoring failed');
    }
  }, 10 * 60 * 1000); // 10分钟 (降低监控频率)
};

// 启动监控
if (process.env.NODE_ENV === 'production') {
  startConnectionMonitoring();
}

// 优雅关闭数据库连接
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});