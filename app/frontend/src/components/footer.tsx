"use client";

import { motion } from "framer-motion";

const footerSections = [
  {
    title: "产品服务",
    links: [
      { name: "SDC生成工具", href: "#" },
      { name: "CLK电路设计", href: "#" },
      { name: "Memory数据处理", href: "#" },
      { name: "API接口服务", href: "#" }
    ]
  },
  {
    title: "资源中心",
    links: [
      { name: "技术文档", href: "#" },
      { name: "使用教程", href: "#" },
      { name: "行业报告", href: "#" },
      { name: "常见问题", href: "#" }
    ]
  },
  {
    title: "联系我们",
    links: [
      { name: "support@chipcore.com", href: "mailto:support@chipcore.com", icon: "fas fa-envelope" },
      { name: "+86 400-123-4567", href: "tel:+8640012334567", icon: "fas fa-phone" },
      { name: "北京市海淀区中关村", href: "#", icon: "fas fa-map-marker-alt" }
    ]
  }
];

const socialLinks = [
  { icon: "fab fa-twitter", href: "#", label: "Twitter" },
  { icon: "fab fa-linkedin", href: "#", label: "LinkedIn" },
  { icon: "fab fa-github", href: "#", label: "GitHub" }
];

const bottomLinks = [
  { name: "隐私政策", href: "#" },
  { name: "服务条款", href: "#" },
  { name: "Cookie政策", href: "#" }
];

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-16">
      <div className="max-w-8xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="col-span-1"
          >
            <h3 className="text-2xl font-bold gradient-text-orange mb-4">ChipCore</h3>
            <p className="text-gray-300 mb-6">
              专注于芯片设计方法学工具的创新平台，为半导体行业提供专业高效的解决方案。
            </p>
            <div className="flex space-x-4">
              {socialLinks.map((social, index) => (
                <motion.a
                  key={index}
                  href={social.href}
                  whileHover={{ scale: 1.1 }}
                  className="text-gray-400 hover:text-blue-400 transition-colors"
                  aria-label={social.label}
                >
                  <i className={`${social.icon} text-xl`}></i>
                </motion.a>
              ))}
            </div>
          </motion.div>
          
          {/* Footer Sections */}
          {footerSections.map((section, sectionIndex) => (
            <motion.div
              key={sectionIndex}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: sectionIndex * 0.1 }}
              className="col-span-1"
            >
              <h4 className="text-lg font-semibold mb-4">{section.title}</h4>
              <ul className="space-y-3">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <a
                      href={link.href}
                      className="text-gray-300 hover:text-white transition-colors flex items-center"
                    >
                      {'icon' in link && link.icon && (
                        <i className={`${link.icon} mr-3 text-blue-400`}></i>
                      )}
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
        
        {/* Bottom Section */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="border-t border-gray-700 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center"
        >
          <p className="text-gray-400 text-sm">
            &copy; 2024 ChipCore. 保留所有权利。
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            {bottomLinks.map((link, index) => (
              <a
                key={index}
                href={link.href}
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
