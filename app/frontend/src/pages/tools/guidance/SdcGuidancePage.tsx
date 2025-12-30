import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getSdcToolPath } from '@/utils/toolPageMethod';

const SdcGuidancePage: React.FC = () => {
    const navigate = useNavigate();

    const handleBackClick = () => {
        navigate(getSdcToolPath());
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8"
        >


            <Card className="border-2 border-orange-400 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-3xl font-bold text-orange-600 text-center">
                        SDC Generation Guidance
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
                        <div className="space-y-4 text-gray-800">
                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">ModName填入harden模块名称，要求使用字母、数字和下划线；</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">IsFlat选项，False表示harden block level only，True表示flatten集成模块下面harden block sdc，目前只支持设置False值；</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">本地需要求上传三个文件，文件名为hier.yaml、vlog.v、dcont.xlsx，具体填写方式参考各自template，主页也有更详细的工具指南；</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">上面是需求信息，务必结合格式要求填写正确清晰，文件大小不超过5MB；</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">如果您是首次使用，建议先下载template文件作为参考；</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">提交任务后，等待任务完成提示，<span className="text-orange-600 font-bold">Download Zip Data</span>按钮变为绿色，可供下载；</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">结果数据包括完整的sdc约束文件和log/rpt数据。</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="text-center">
                                <div className="bg-yellow-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-yellow-800 text-lg">hier.yaml</h4>
                                    <p className="text-yellow-700 mt-2 text-base">层次结构配置文件</p>
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="bg-green-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-green-800 text-lg">vlog.v</h4>
                                    <p className="text-green-700 mt-2 text-base">Empty Verilog文件</p>
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="bg-purple-100 p-4 rounded-lg">
                                    <h4 className="font-bold text-purple-800 text-lg">dcont.xlsx</h4>
                                    <p className="text-purple-700 mt-2 text-base">设计约束表格</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <Button
                            onClick={handleBackClick}
                            className="bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 text-white font-bold text-lg px-8 py-3 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105"
                        >
                            开始使用SDC生成器
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default SdcGuidancePage;
