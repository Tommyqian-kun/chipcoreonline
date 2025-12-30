"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const news = [
  {
    title: "SDC工具2.0版本发布",
    description: "全新的SDC生成算法，提升30%的处理效率，支持更复杂的约束条件设置",
    date: "2024年1月15日",
    category: "功能更新",
    categoryColor: "gradient-bg-blue",
    image: "https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400"
  },
  {
    title: "AI驱动的设计优化",
    description: "正在开发基于机器学习的电路优化功能，预计下季度上线",
    date: "2024年1月10日",
    category: "开发进展",
    categoryColor: "gradient-bg-orange",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400"
  },
  {
    title: "隐私政策更新",
    description: "更新了用户数据保护政策，加强数据安全防护措施",
    date: "2024年1月5日",
    category: "网站声明",
    categoryColor: "bg-gray-700",
    image: "https://images.unsplash.com/photo-1560472355-536de3962603?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400"
  }
];

export default function LatestNews() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-8xl mx-auto px-6 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">最新动态</h2>
          <p className="text-xl text-gray-600">了解ChipCore的最新功能更新和行业资讯</p>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {news.map((item, index) => (
            <motion.article
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              whileHover={{ y: -8 }}
            >
              <Card className="bg-gray-50 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer">
                <div className="aspect-video overflow-hidden">
                  <img 
                    src={item.image} 
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardContent className="p-6">
                  <div className="flex items-center mb-3">
                    <Badge className={`${item.categoryColor} text-white px-3 py-1 text-xs`}>
                      {item.category}
                    </Badge>
                    <span className="text-gray-500 text-sm ml-3">{item.date}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600 mb-4 line-clamp-3">{item.description}</p>
                  <div className="flex items-center text-blue-600 hover:text-blue-800 font-medium group">
                    <span>阅读更多</span>
                    <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
