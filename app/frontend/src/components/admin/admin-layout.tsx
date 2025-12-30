import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './sidebar';
import { Toaster } from '@/components/ui/toaster';

const AdminLayout: React.FC = () => {
  return (
    <div className="h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0">
        <Sidebar />
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="container mx-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
      
      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
};

export default AdminLayout; 