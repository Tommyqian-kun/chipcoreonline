"use client";

import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  Menu, 
  X,
  User,
  LogOut,
  LayoutDashboard
} from "lucide-react";
import useOnClickOutside from "@/hooks/use-on-click-outside";
import { useAuth } from "@/contexts/auth.context";
import { useGlobalTaskStatus } from "@/contexts/task-status.context";
import { useToolPageNavigation } from "@/hooks/useToolPageNavigation";

import { getSdcToolPath, getUpfToolPath } from '@/utils/toolPageMethod';

const tools = [
  { name: "SDC高效生成", icon: "fas fa-microchip", href: getSdcToolPath() },
  { name: "UPF高效生成", icon: "fas fa-bolt", href: getUpfToolPath() },
  { name: "CLK电路自动生成", icon: "fas fa-project-diagram", href: "/tools/clk-generator" },
  { name: "Memory数据生成", icon: "fas fa-memory", href: "/tools/memory-generator" }
];

export default function Navigation() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const { globalTaskStatus } = useGlobalTaskStatus();
  const { handleNavigation, handleProfileClick } = useToolPageNavigation(globalTaskStatus);

  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(toolsMenuRef, () => setIsToolsOpen(false));
  useOnClickOutside(userMenuRef, () => setIsUserMenuOpen(false));

  const handleLogout = () => {
    logout();
    setIsUserMenuOpen(false);
    setIsMobileMenuOpen(false);
    navigate('/');
  };

  const UserMenu = () => {
    // 对于管理员，显示更谨慎的用户名
    const displayName = user?.role === 'ADMIN'
      ? (user?.name || '管理员')
      : (user?.name || user?.email);

    return (
      <div className="relative" ref={userMenuRef}>
        <Button variant="ghost" size="sm" onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center">
          <User className="h-5 w-5 mr-2" />
          <span>{displayName}</span>
          <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
        </Button>
        {isUserMenuOpen && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-100 z-50">
            <div className="py-2">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold">您好, {user?.name || '用户'}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <Link to="/profile" onClick={() => setIsUserMenuOpen(false)} className="flex items-center w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors">
                <LayoutDashboard className="mr-3 h-4 w-4" /> 个人中心
              </Link>
              <button onClick={handleLogout} className="flex items-center w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors">
                <LogOut className="mr-3 h-4 w-4" /> 退出登录
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const AuthButtons = () => (
    <div className="hidden md:flex items-center space-x-2">
      <Button variant="ghost" size="sm" onClick={() => handleNavigation('/auth/login')}>
        登录
      </Button>
      <Button size="sm" className="gradient-bg-orange text-white hover:opacity-90" onClick={() => handleNavigation('/auth/register')}>
        注册
      </Button>
    </div>
  );

  return (
    <nav className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-8xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <button onClick={() => handleNavigation('/')} className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold gradient-text-orange">ChipCore</h1>
            </div>
          </button>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <button onClick={() => handleNavigation('/')} className="text-gray-600 hover:text-blue-600 px-3 py-2 text-sm font-medium transition-colors">
              首页
            </button>
            
            {/* Tools Dropdown */}
            <div className="relative" ref={toolsMenuRef}>
              <button 
                className="text-gray-600 hover:text-blue-600 px-3 py-2 text-sm font-medium transition-colors flex items-center"
                onClick={() => setIsToolsOpen(!isToolsOpen)}
              >
                工具
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isToolsOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isToolsOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-100">
                  <div className="py-2">
                    {tools.map((tool, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setIsToolsOpen(false);
                          handleNavigation(tool.href);
                        }}
                        className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                      >
                        <i className={`${tool.icon} mr-3 text-blue-500`}></i>
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <button onClick={() => handleNavigation('/membership')} className="text-gray-600 hover:text-blue-600 px-3 py-2 text-sm font-medium transition-colors">
              会员
            </button>
            <button onClick={() => handleNavigation('/contact')} className="text-gray-600 hover:text-blue-600 px-3 py-2 text-sm font-medium transition-colors">
              联系
            </button>
          </div>
          
          {/* Auth Buttons */}
          <div className="flex items-center">
            <div className="hidden md:flex items-center space-x-4">
              {isAuthenticated ? <UserMenu /> : <AuthButtons />}
            </div>
            <div className="md:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 bg-white border-t border-gray-200">
              <button onClick={() => { setIsMobileMenuOpen(false); handleNavigation('/'); }} className="block w-full text-left px-3 py-2 text-gray-600 hover:text-blue-600">首页</button>
              <div className="px-3 py-2">
                <p className="text-gray-500 font-medium mb-2">工具</p>
                {tools.map((tool, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleNavigation(tool.href);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-blue-600"
                  >
                    <i className={`${tool.icon} mr-2 text-blue-500`}></i>
                    {tool.name}
                  </button>
                ))}
              </div>
              <button onClick={() => { setIsMobileMenuOpen(false); handleNavigation('/membership'); }} className="block w-full text-left px-3 py-2 text-gray-600 hover:text-blue-600">会员</button>
              <button onClick={() => { setIsMobileMenuOpen(false); handleNavigation('/contact'); }} className="block w-full text-left px-3 py-2 text-gray-600 hover:text-blue-600">联系</button>
              <div className="px-3 py-2 space-y-2 border-t mt-2 pt-2">
                {isAuthenticated ? (
                  <>
                    <button onClick={() => { setIsMobileMenuOpen(false); handleProfileClick(); }} className="flex items-center w-full text-left px-3 py-2 text-gray-600 hover:text-blue-600">
                      <LayoutDashboard className="mr-3 h-4 w-4" /> 个人中心
                    </button>
                    <Button variant="ghost" size="sm" className="w-full justify-start text-red-600" onClick={handleLogout}>
                      <LogOut className="mr-3 h-4 w-4" /> 退出登录
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setIsMobileMenuOpen(false); handleNavigation('/auth/login'); }}>
                      登录
                    </Button>
                    <Button size="sm" className="w-full gradient-bg-orange text-white" onClick={() => { setIsMobileMenuOpen(false); handleNavigation('/auth/register'); }}>
                      注册
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
