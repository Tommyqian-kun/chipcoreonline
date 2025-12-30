import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const UPFGuidancePage: React.FC = () => {
    const navigate = useNavigate();

    const handleBackClick = () => {
        navigate('/tools/upf-generator');
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
                        UPF Generation Guidance
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
                                    <p className="font-medium text-orange-800 text-lg">Version填入UPF协议标准，下拉有2.0、2.1、3.0，默认值为2.1，然后选择框变灰色，表示目前只支持2.1；</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">IsFlat后面是选择，True和False，默认是False；</p>
                                </div>
                            </div>

                            <div className="flex items-start space-x-3">
                                <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-3"></span>
                                <div>
                                    <p className="font-medium text-orange-800 text-lg">本地需要求上传四个文件，文件名为hier.yaml、pvlog.v、pobj.tcl、pcont.xlsx，具体填写方式参考各自template，主页也有更详细的工具指南；</p>
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
                                    <p className="font-medium text-orange-800 text-lg">如果您是首次使用，建议先下载Template文件作为参考；</p>
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
                                    <p className="font-medium text-orange-800 text-lg">结果数据包括完整的upf文件和log/rpt数据。</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="bg-yellow-100 p-4 rounded-lg h-24 flex flex-col justify-center">
                                    <h4 className="font-bold text-yellow-800 text-lg">hier.yaml</h4>
                                    <p className="text-yellow-700 mt-1 text-sm">层次结构配置文件</p>
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="bg-green-100 p-4 rounded-lg h-24 flex flex-col justify-center">
                                    <h4 className="font-bold text-green-800 text-lg">pvlog.v</h4>
                                    <p className="text-green-700 mt-1 text-sm">empty verilog with supply</p>
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="bg-purple-100 p-4 rounded-lg h-24 flex flex-col justify-center">
                                    <h4 className="font-bold text-purple-800 text-lg">pobj.tcl</h4>
                                    <p className="text-purple-700 mt-1 text-sm">instance信息</p>
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="bg-blue-100 p-4 rounded-lg h-24 flex flex-col justify-center">
                                    <h4 className="font-bold text-blue-800 text-lg">pcont.xlsx</h4>
                                    <p className="text-blue-700 mt-1 text-sm">power约束表格</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <Button
                            onClick={handleBackClick}
                            className="bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 text-white font-bold text-lg px-8 py-3 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105"
                        >
                            开始使用UPF生成器
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default UPFGuidancePage;