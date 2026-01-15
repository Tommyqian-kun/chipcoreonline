import os
import redis
import docker
import logging
from sqlalchemy import create_engine, Column, String, Text, DateTime, Enum, JSON, Boolean, Integer
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timezone
from dotenv import load_dotenv

# --- Load Environment Variables ---
# Load from backend/.env and .env.local (with .env.local taking precedence)
backend_dir = os.path.join(os.path.dirname(__file__), '..', '..', '..')
env_path = os.path.join(backend_dir, '.env')
env_local_path = os.path.join(backend_dir, '.env.local')

# Load .env first, then .env.local (which will override .env values)
load_dotenv(dotenv_path=env_path)
if os.path.exists(env_local_path):
    load_dotenv(dotenv_path=env_local_path, override=True)
    print(f"[OK] Loaded environment from {env_local_path}")
else:
    print(f"[WARN] .env.local not found at {env_local_path}")

print(f"[OK] Loaded environment from {env_path}")
print(f"[CONFIG] Deployment mode: {os.environ.get('DEPLOYMENT_MODE', 'not set')}")
print(f"[CONFIG] Database URL: {os.environ.get('DATABASE_URL', 'not set')[:50]}...")
print(f"[CONFIG] Redis URL: {os.environ.get('REDIS_URL', 'not set')}")

# --- SDK Imports (conditional based on deployment mode) ---
# Only import Aliyun SDKs if not in ECS Only mode
deployment_mode = os.environ.get('DEPLOYMENT_MODE', 'ecs_only')
AcsClient = None
AssumeRoleRequest = None
GetAuthorizationTokenRequest = None
oss2 = None
if deployment_mode != 'ecs_only':
    try:
        from aliyunsdkcore.client import AcsClient
        from aliyunsdksts.request.v20150401 import AssumeRoleRequest
        from aliyunsdkcr.request.v20170324 import GetAuthorizationTokenRequest
        import oss2
        print("[OK] Aliyun SDKs imported for ECS+OSS+ACR mode")
    except ImportError as e:
        print(f"[WARN] Aliyun SDKs not available: {e}")
        print("   This is expected in ECS Only mode")
else:
    print("[OK] ECS Only mode - Aliyun SDKs not required")

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Deployment Mode Detection ---
def get_deployment_mode():
    """获取部署模式"""
    return os.environ.get('DEPLOYMENT_MODE', 'ecs_only')

def is_ecs_only_mode():
    """检查是否为ECS Only模式"""
    return get_deployment_mode() == 'ecs_only'

def is_ecs_oss_acr_mode():
    """检查是否为ECS+OSS+ACR模式"""
    return get_deployment_mode() == 'ecs_oss_acr'

# --- Configuration ---
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:password@localhost:5432/mydb')
TASK_QUEUE_NAME = os.getenv('TASK_QUEUE_NAME', 'task_queue')
ECS_TOTAL_CPU = int(os.getenv('ECS_TOTAL_CPU', 8))
ECS_TOTAL_MEMORY_GB = int(os.getenv('ECS_TOTAL_MEMORY_GB', 64))
JOB_CPU_REQUEST = int(os.getenv('JOB_CPU_REQUEST', 2))
JOB_MEMORY_REQUEST_GB = int(os.getenv('JOB_MEMORY_REQUEST_GB', 16))

OSS_REGION = os.getenv('OSS_REGION')
OSS_BUCKET_USER_INPUT = os.getenv('OSS_BUCKET_USER_INPUT')
OSS_BUCKET_JOB_RESULTS = os.getenv('OSS_BUCKET_JOB_RESULTS')
OSS_BUCKET_JOB_LOGS = os.getenv('OSS_BUCKET_JOB_LOGS')

ALIYUN_RAM_ROLE_ARN = os.getenv('ALIYUN_RAM_ROLE_ARN')
ALIYUN_STS_REGION = os.getenv('ALIYUN_STS_REGION')
# Credentials for the worker itself to call STS and other services
ALIYUN_ACCESS_KEY_ID = os.getenv('ALIYUN_ACCESS_KEY_ID')
ALIYUN_ACCESS_KEY_SECRET = os.getenv('ALIYUN_ACCESS_KEY_SECRET')
ACR_REGION = os.getenv('ACR_REGION', os.getenv('OSS_REGION')) # Default ACR region to OSS region

# --- Redis连接池管理 ---
class RedisConnectionPool:
    """Redis连接池管理器"""

    def __init__(self, redis_url: str, max_connections: int = 10):
        self.redis_url = redis_url
        self.max_connections = max_connections
        self._pool = None
        self._client = None

    def get_pool(self):
        """获取Redis连接池"""
        if self._pool is None:
            self._pool = redis.ConnectionPool.from_url(
                self.redis_url,
                max_connections=self.max_connections,
                retry_on_timeout=True,
                socket_keepalive=True,
                socket_keepalive_options={},
                health_check_interval=30
            )
        return self._pool

    def get_client(self):
        """获取Redis客户端"""
        if self._client is None:
            self._client = redis.Redis(
                connection_pool=self.get_pool(),
                decode_responses=False
            )
        return self._client

    def close(self):
        """关闭连接池"""
        if self._client:
            self._client.close()
            self._client = None
        if self._pool:
            self._pool.disconnect()
            self._pool = None

# 全局Redis连接池实例
_redis_pool = RedisConnectionPool(REDIS_URL)

def get_redis_client():
    """获取Redis客户端实例"""
    return _redis_pool.get_client()

# --- Clients Initialization ---
try:
    # 使用连接池初始化Redis客户端
    redis_client = get_redis_client()
    docker_client = docker.from_env()

    # Only initialize Aliyun client if not in ECS Only mode
    if deployment_mode != 'ecs_only':
        core_client = AcsClient(ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ALIYUN_STS_REGION)
        logging.info("Redis (with connection pool), Docker, and Aliyun clients initialized successfully.")
    else:
        core_client = None
        logging.info("Redis (with connection pool) and Docker clients initialized successfully (ECS Only mode).")
except Exception as e:
    logging.critical(f"Failed to initialize clients: {e}")
    exit(1)

# --- Database Model Setup (SQLAlchemy) ---
Base = declarative_base()
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

class Task(Base):
    __tablename__ = 'Task'
    id = Column(String, primary_key=True)
    status = Column(Enum('DRAFT', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'QUEUE_TIMEOUT', 'EXECUTION_TIMEOUT', name='TaskStatus'), nullable=False)
    createdAt = Column('createdAt', DateTime, default=lambda: datetime.now(timezone.utc))
    startedAt = Column('startedAt', DateTime)
    containerStartedAt = Column('containerStartedAt', DateTime)  # 容器真正开始执行的时间
    finishedAt = Column('finishedAt', DateTime)
    inputFile = Column('inputFile', String)
    outputFile = Column('outputFile', String)
    logFile = Column('logFile', String)
    deploymentMode = Column('deploymentMode', String, default='ecs_only')  # 新增部署模式字段
    localStoragePath = Column('localStoragePath', String)  # 新增本地存储路径字段
    parameters = Column(JSON)
    errorMessage = Column('errorMessage', Text)
    workerId = Column('workerId', String)
    retryCount = Column('retryCount', Integer, default=0)  # 当前重试次数
    maxRetries = Column('maxRetries', Integer, default=3)  # 最大重试次数
    originalTaskId = Column('originalTaskId', String)  # 原始任务ID（重试任务）
    ecsInstanceId = Column('ecsInstanceId', String)
    userId = Column('userId', String, nullable=False)
    toolId = Column('toolId', String, nullable=False)
    progress = Column('progress', Integer, default=0)  # 任务进度百分比 (0-100)
    currentStep = Column('currentStep', String)  # 当前执行步骤
    stepStartedAt = Column('stepStartedAt', DateTime)  # 当前步骤开始时间
    downloadTimeRemaining = Column('downloadTimeRemaining', Integer)  # ECS Only模式下载倒计时（秒）
    updatedAt = Column('updatedAt', DateTime)  # 最后更新时间

class Tool(Base):
    __tablename__ = 'Tool'
    id = Column('id', String, primary_key=True)
    name = Column('name', String, nullable=False)
    description = Column('description', String, nullable=False)
    toolType = Column('toolType', String, nullable=False)
    inputSchema = Column('inputSchema', JSON, nullable=False)
    dockerImage = Column('dockerImage', String, nullable=False)
    version = Column('version', String, nullable=False)
    configTemplate = Column('configTemplate', JSON, nullable=True)
    isPublic = Column('isPublic', Boolean, nullable=False, default=True)
    createdAt = Column('createdAt', DateTime, nullable=False)
    updatedAt = Column('updatedAt', DateTime, nullable=False)

__all__ = [
    # 配置常量
    'REDIS_URL', 'DATABASE_URL', 'TASK_QUEUE_NAME',
    'ECS_TOTAL_CPU', 'ECS_TOTAL_MEMORY_GB',
    'JOB_CPU_REQUEST', 'JOB_MEMORY_REQUEST_GB',
    'OSS_REGION', 'OSS_BUCKET_USER_INPUT', 'OSS_BUCKET_JOB_RESULTS', 'OSS_BUCKET_JOB_LOGS',
    'ALIYUN_RAM_ROLE_ARN', 'ALIYUN_STS_REGION',
    'ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'ACR_REGION',
    # 类
    'RedisConnectionPool', 'Task', 'Tool', 'Base',
    # 函数
    'get_redis_client', 'get_deployment_mode', 'is_ecs_only_mode', 'is_ecs_oss_acr_mode',
    # 实例
    'redis_client', 'docker_client', 'core_client', 'engine', 'Session',
    'deployment_mode',
]
