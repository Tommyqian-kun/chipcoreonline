import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToolExecution, TaskStatus } from '../../hooks/useToolExecution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { ToolPageTaskHistoryButton } from '@/components/shared/TaskHistoryButton';
import { ToolDownloadButton, ToolSubmissionButton } from '@/components/common/ToolButtons';
import TaskProgressBar from '@/components/shared/TaskProgressBar';

const clkFormSchema = z.object({
  sourceSpec: z.string().min(1, "时钟源规格不能为空"),
  targetDomains: z.coerce.number().int().min(1, "至少需要1个目标时钟域").max(16, "最多支持16个目标时钟域"),
  bufferType: z.enum(['BUFGMUX', 'BUFGCE', 'BUFG']),
});

type ClkFormValues = z.infer<typeof clkFormSchema>;

const ClkGeneratorPage: React.FC = () => {
    const { taskStatus, submitTask, resetTask, handleDownload } = useToolExecution();

    const form = useForm<ClkFormValues>({
        resolver: zodResolver(clkFormSchema),
        defaultValues: {
            sourceSpec: '200MHz crystal oscillator',
            targetDomains: 3,
            bufferType: 'BUFGMUX',
        },
    });

    const onSubmit = (data: ClkFormValues) => {
        submitTask({
            toolId: 'clk-generator',
            parameters: data,
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="container mx-auto max-w-2xl p-4 sm:p-6 lg:p-8"
        >
            {taskStatus.status !== 'IDLE' ? (
                <TaskResultDisplay taskStatus={taskStatus} resetTask={resetTask} handleDownload={handleDownload} />
            ) : (
                <div className="relative">
                    <Card className="shadow-lg">
                        <CardHeader>
                            <CardTitle className="text-2xl md:text-3xl font-bold">时钟电路自动生成工具</CardTitle>
                            <CardDescription>根据您的需求，自动生成优化的时钟缓冲和分配网络。</CardDescription>
                        </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <FormField control={form.control} name="sourceSpec" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>时钟源规格</FormLabel>
                                        <FormControl><Input placeholder="例如: 200MHz crystal oscillator" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="targetDomains" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>目标时钟域数量</FormLabel>
                                        <FormControl><Input type="number" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="bufferType" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>缓冲器类型</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="BUFGMUX">BUFGMUX</SelectItem>
                                                <SelectItem value="BUFGCE">BUFGCE</SelectItem>
                                                <SelectItem value="BUFG">BUFG</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <div className="flex justify-center">
                                    <ToolSubmissionButton
                                        taskStatus={taskStatus}
                                        isSubmitting={form.formState.isSubmitting}
                                    >
                                        生成电路
                                    </ToolSubmissionButton>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
                    {/* 任务历史按钮和开始新任务按钮 - 绝对定位在Card外面的右侧 */}
                    <div className="absolute top-[1.25rem] -right-4 transform translate-x-full">
                        <div className="flex flex-col space-y-3">
                            <ToolPageTaskHistoryButton taskStatus={taskStatus} />
                            <Button
                                onClick={() => window.open('/tools', '_blank')}
                                className="bg-gradient-to-r from-blue-600 to-orange-500 hover:from-blue-700 hover:to-orange-600 text-white font-bold px-6 py-2 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105"
                            >
                                开始新任务
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

// Re-using the TaskResultDisplay component from MemoryDataGeneratorPage.
// For a real app, this would be in a shared components directory.
const TaskResultDisplay = ({ taskStatus, resetTask, handleDownload }: { taskStatus: TaskStatus, resetTask: () => void, handleDownload: (type: 'result' | 'log') => void }) => {
    return (
         <div className="container mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
            <Card>
                <CardHeader>
                    <CardTitle>任务状态 (ID: {taskStatus.taskId})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* 任务进度条显示 */}
                    {taskStatus.status !== 'IDLE' && (
                        <div className="mb-6">
                            <TaskProgressBar
                                status={taskStatus.status}
                                currentStep={taskStatus.currentStep}
                                taskId={taskStatus.taskId}
                                variant="default"
                                progress={taskStatus.progress}
                            />
                        </div>
                    )}

                    {taskStatus.status === 'POLLING' && (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                            <p className="mt-2 text-lg">正在执行任务...</p>
                        </div>
                    )}
                     {taskStatus.errorMessage && (
                        <Alert variant="destructive">
                            <AlertTitle>任务失败</AlertTitle>
                            <AlertDescription>{taskStatus.errorMessage}</AlertDescription>
                        </Alert>
                    )}
                    {taskStatus.status === 'COMPLETED' && (
                        <Alert variant="default" className="border-green-500 text-green-700">
                             <AlertTitle>任务成功完成！</AlertTitle>
                            <AlertDescription>您可以下载结果文件和日志。</AlertDescription>
                        </Alert>
                    )}
                     <div className="flex justify-center pt-4">
                        <ToolDownloadButton
                            taskStatus={taskStatus}
                            onClick={() => handleDownload('result')}
                            fileName="clk_result"
                        />
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}

export default ClkGeneratorPage; 