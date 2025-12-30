import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToolExecution, TaskStatus } from '../../hooks/useToolExecution';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, Loader2, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { ToolPageTaskHistoryButton } from '@/components/shared/TaskHistoryButton';
import { ToolDownloadButton, ToolSubmissionButton } from '@/components/common/ToolButtons';
import TaskProgressBar from '@/components/shared/TaskProgressBar';

const memoryFormSchema = z.object({
  memoryType: z.enum(['SPRAM', 'DPRAM']),
  addressWidth: z.coerce.number().int().positive("地址宽度必须是正整数"),
  dataWidth: z.coerce.number().int().positive("数据宽度必须是正整数"),
  fillPattern: z.enum(['zeros', 'ones', 'random', 'sequence', 'hex_file']),
  hexFile: z.any().optional(),
}).refine(data => {
    if (data.fillPattern === 'hex_file') {
        return data.hexFile instanceof File;
    }
    return true;
}, {
    message: "使用Hex文件填充时必须上传文件",
    path: ["hexFile"],
});

type MemoryFormValues = z.infer<typeof memoryFormSchema>;

const MemoryDataGeneratorPage: React.FC = () => {
    const { taskStatus, submitTask, resetTask, handleDownload } = useToolExecution();

    const form = useForm<MemoryFormValues>({
        resolver: zodResolver(memoryFormSchema),
        defaultValues: {
            memoryType: 'SPRAM',
            addressWidth: 8,
            dataWidth: 32,
            fillPattern: 'zeros',
        },
    });

    const fillPattern = form.watch('fillPattern');

    const onSubmit = (data: MemoryFormValues) => {
        const { memoryType, addressWidth, dataWidth, fillPattern, hexFile } = data;
        submitTask({
            toolId: 'memory-data-generator',
            parameters: { memoryType, addressWidth, dataWidth, fillPattern },
            inputFile: fillPattern === 'hex_file' ? hexFile : undefined,
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
                            <CardTitle className="text-2xl md:text-3xl font-bold">内存数据生成工具</CardTitle>
                            <CardDescription>快速配置并生成用于测试和仿真的内存初始化数据。</CardDescription>
                        </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <FormField control={form.control} name="memoryType" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>内存类型</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="SPRAM">单端口 RAM (Single-Port RAM)</SelectItem>
                                                <SelectItem value="DPRAM">双端口 RAM (Dual-Port RAM)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField control={form.control} name="addressWidth" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>地址宽度</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="dataWidth" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>数据宽度</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                                <FormField control={form.control} name="fillPattern" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>填充模式</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="zeros">全 0</SelectItem>
                                                <SelectItem value="ones">全 1</SelectItem>
                                                <SelectItem value="random">随机数</SelectItem>
                                                <SelectItem value="sequence">递增序列</SelectItem>
                                                <SelectItem value="hex_file">从Hex文件</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                {fillPattern === 'hex_file' && (
                                    <FormField control={form.control} name="hexFile" render={({ field: { onChange, value, ...rest } }) => (
                                        <FormItem>
                                            <FormLabel>上传 .hex 文件</FormLabel>
                                            <FormControl>
                                                <Label htmlFor="hex-upload" className={`flex items-center space-x-2 border-2 border-dashed rounded-lg p-4 cursor-pointer ${value ? 'border-green-500' : ''}`}>
                                                    {value ? <FileText className="h-5 w-5 text-green-500" /> : <Upload className="h-5 w-5 text-gray-500" />}
                                                    <span>{value?.name || "点击或拖拽文件上传"}</span>
                                                </Label>
                                                <Input id="hex-upload" type="file" className="hidden" accept=".hex" onChange={e => onChange(e.target.files?.[0])} {...rest} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                )}
                                <div className="flex justify-center">
                                    <ToolSubmissionButton
                                        taskStatus={taskStatus}
                                        isSubmitting={form.formState.isSubmitting}
                                    >
                                        生成数据
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
                                taskId={taskStatus.taskId}
                                variant="default"
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
                            fileName="memory_result"
                        />
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}

export default MemoryDataGeneratorPage; 