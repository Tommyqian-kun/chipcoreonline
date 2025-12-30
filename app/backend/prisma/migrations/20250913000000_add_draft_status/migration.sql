-- AlterEnum
-- 为多页面交互模式添加DRAFT状态，表示用户正在填写需求，不计入超时时间
ALTER TYPE "TaskStatus" ADD VALUE 'DRAFT';
