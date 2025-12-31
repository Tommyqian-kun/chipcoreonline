import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/home";
import LoginPage from "./pages/auth/login";
import RegisterPage from "./pages/auth/register";
import MembershipPage from "./pages/membership";
import ContactPage from "./pages/contact";
import NotFoundPage from "./pages/not-found";
import Navigation from "./components/navigation";
import Footer from "./components/footer";
import EmailVerificationResultPage from './pages/auth/email-verification-result';
import ForgotPasswordPage from './pages/auth/forgot-password';
import ResetPasswordPage from './pages/auth/reset-password';
import VerifyCodePage from './pages/auth/verify-code';
import ProfilePage from './pages/profile';
import DebugPage from './pages/debug';
import ProtectedRoute from './components/protected-route';

// Admin components
import AdminLoginPage from './pages/admin/login';
import AdminDashboardPage from './pages/admin/dashboard';
import UsersPage from './pages/admin/users';
import TasksPage from './pages/admin/tasks';
const OrdersPage = lazy(() => import('./pages/admin/orders'));
const PlansPage = lazy(() => import('./pages/admin/plans'));
const SubscriptionsPage = lazy(() => import('./pages/admin/subscriptions'));
const ToolsPage = lazy(() => import('./pages/admin/tools'));
const FeedbackPage = lazy(() => import('./pages/admin/feedback'));
const LogsPage = lazy(() => import('./pages/admin/logs'));
const MonitoringPage = lazy(() => import('./pages/admin/monitoring'));
import AdminLayout from './components/admin/admin-layout';
import AdminRoute from './components/admin/admin-route';

// Order and Payment pages
import OrderConfirmPage from "./pages/order/confirm";
import CheckoutPage from "./pages/order/checkout";
import PaymentResultPage from "./pages/payment/result";

const SdcGeneratorPage = lazy(() => import('./pages/tools/SdcGeneratorPage'));
const SdcGuidancePage = lazy(() => import('./pages/tools/guidance/SdcGuidancePage'));
const SdcGeneratorPageThrpages = lazy(() => import('./pages/tools/SdcGeneratorPage_thrpages'));
const SdcGeneratorInitializeThrpages = lazy(() => import('./pages/tools/SdcGeneratorInitialize_thrpages'));
const SdcGeneratorSubmitThrpages = lazy(() => import('./pages/tools/SdcGeneratorSubmit_thrpages'));
const SdcGeneratorDownloadThrpages = lazy(() => import('./pages/tools/SdcGeneratorDownload_thrpages'));
const UPFGeneratorPage = lazy(() => import('./pages/tools/UPFGeneratorPage'));
const UPFGeneratorPageThrpages = lazy(() => import('./pages/tools/UpfGeneratorPage_thrpages'));
const UPFGeneratorInitializeThrpages = lazy(() => import('./pages/tools/UpfGeneratorInitialize_thrpages'));
const UPFGeneratorSubmitThrpages = lazy(() => import('./pages/tools/UpfGeneratorSubmit_thrpages'));
const UPFGeneratorDownloadThrpages = lazy(() => import('./pages/tools/UpfGeneratorDownload_thrpages'));
const UPFGuidancePage = lazy(() => import('./pages/tools/guidance/UPFGuidancePage'));
const ClkGeneratorPage = lazy(() => import('./pages/tools/ClkGeneratorPage'));
const MemoryDataGeneratorPage = lazy(() => import('./pages/tools/MemoryDataGeneratorPage'));
const ToolsIndexPage = lazy(() => import('./pages/tools/index'));
const OrderDetailsPage = lazy(() => import('./pages/order/details'));
const OrderHistoryPage = lazy(() => import('./pages/order/history'));
const TaskHistoryPage = lazy(() => import('./pages/task-history'));
import { Toaster } from "@/components/ui/toaster";
import { TaskStatusProvider } from "@/contexts/task-status.context";
import { getToolPageMethod, getToolPageMethodSync } from './utils/toolPageMethod';

function App() {
  console.log('‍ ChipCore App组件开始渲染');
  const environment = import.meta.env.VITE_APP_ENV || 'development';

  // 在应用启动时获取工具页面模式配置
  useEffect(() => {
    getToolPageMethod().catch(console.error);
  }, []);
  console.log('[ChipCore Debug] Environment Configuration:', { environment, ...import.meta.env });

  return (
    <TaskStatusProvider>
      <Router>
        <div className="flex flex-col min-h-screen">
          <Navigation />
          <main className="flex-grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/register" element={<RegisterPage />} />
            <Route path="/membership" element={<MembershipPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/auth/email-verification-result" element={<EmailVerificationResultPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/verify-code" element={<VerifyCodePage />} />
            
            {/* Admin routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<AdminRoute />}>
              <Route element={<AdminLayout />}>
                <Route path="dashboard" element={<AdminDashboardPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route 
                  path="orders" 
                  element={
                    <Suspense fallback={<div>Loading...</div>}>
                      <OrdersPage />
                    </Suspense>
                  } 
                />
                <Route 
                  path="plans" 
                  element={
                    <Suspense fallback={<div>Loading...</div>}>
                      <PlansPage />
                    </Suspense>
                  } 
                />
                <Route 
                  path="subscriptions" 
                  element={
                    <Suspense fallback={<div>Loading...</div>}>
                      <SubscriptionsPage />
                    </Suspense>
                  } 
                />
                <Route
                  path="tools"
                  element={
                    <Suspense fallback={<div>Loading...</div>}>
                      <ToolsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="feedback"
                  element={
                    <Suspense fallback={<div>Loading...</div>}>
                      <FeedbackPage />
                    </Suspense>
                  }
                />
                <Route
                  path="logs"
                  element={
                    <Suspense fallback={<div>Loading...</div>}>
                      <LogsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="monitoring"
                  element={
                    <Suspense fallback={<div>Loading...</div>}>
                      <MonitoringPage />
                    </Suspense>
                  }
                />
                <Route index element={<AdminDashboardPage />} />
              </Route>
            </Route>
            
            {/* Payment result can be viewed without login */}
            <Route path="/payment/result" element={<PaymentResultPage />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/debug" element={<DebugPage />} />
              {/* Task History */}
              <Route
                path="/task-history"
                element={
                  <Suspense fallback={<div>Loading Task History...</div>}>
                    <TaskHistoryPage />
                  </Suspense>
                }
              />
              {/* Order Flow */}
              <Route path="/order/confirm" element={<OrderConfirmPage />} />
              <Route path="/order/checkout" element={<CheckoutPage />} />
              <Route 
                path="/order/details/:orderNo" 
                element={
                  <Suspense fallback={<div>Loading...</div>}>
                    <OrderDetailsPage />
                  </Suspense>
                } 
              />
              <Route 
                path="/user/orders" 
                element={
                  <Suspense fallback={<div>Loading...</div>}>
                    <OrderHistoryPage />
                  </Suspense>
                } 
              />
            </Route>
            
            {/* Tool pages are public, usage is restricted inside the component */}
            <Route
              path="/tools"
              element={
                <Suspense fallback={<div>Loading Tools...</div>}>
                  <ToolsIndexPage />
                </Suspense>
              }
            />
            <Route
              path="/tools/sdc-generator"
              element={
                <Suspense fallback={<div>Loading SDC Generator...</div>}>
                  {getToolPageMethodSync() === 'multi' ? <SdcGeneratorPageThrpages /> : <SdcGeneratorPage />}
                </Suspense>
              }
            />
            <Route
              path="/tools/sdc-generator/initialize"
              element={
                <Suspense fallback={<div>Loading SDC Initialize...</div>}>
                  <SdcGeneratorInitializeThrpages />
                </Suspense>
              }
            />
            <Route
              path="/tools/sdc-generator/task/:taskId"
              element={
                <Suspense fallback={<div>Loading SDC Task...</div>}>
                  <SdcGeneratorSubmitThrpages />
                </Suspense>
              }
            />
            <Route
              path="/tools/sdc-generator/task/:taskId/download"
              element={
                <Suspense fallback={<div>Loading SDC Download...</div>}>
                  <SdcGeneratorDownloadThrpages />
                </Suspense>
              }
            />
            <Route
              path="/tools/sdc-generator/task/:taskId/:sheetName"
              element={
                <Suspense fallback={<div>Loading SDC Task...</div>}>
                  <SdcGeneratorSubmitThrpages />
                </Suspense>
              }
            />
            <Route
              path="/tools/guidance/sdc-generator"
              element={
                <Suspense fallback={<div>Loading SDC Guidance...</div>}>
                  <SdcGuidancePage />
                </Suspense>
              }
            />
            <Route
              path="/tools/upf-generator"
              element={
                <Suspense fallback={<div>Loading UPF Generator...</div>}>
                  {getToolPageMethodSync() === 'multi' ? <UPFGeneratorPageThrpages /> : <UPFGeneratorPage />}
                </Suspense>
              }
            />
            <Route
              path="/tools/upf-generator/initialize"
              element={
                <Suspense fallback={<div>Loading UPF Initialize...</div>}>
                  <UPFGeneratorInitializeThrpages />
                </Suspense>
              }
            />
            <Route
              path="/tools/upf-generator/task/:taskId"
              element={
                <Suspense fallback={<div>Loading UPF Task...</div>}>
                  <UPFGeneratorSubmitThrpages />
                </Suspense>
              }
            />
            <Route
              path="/tools/upf-generator/task/:taskId/download"
              element={
                <Suspense fallback={<div>Loading UPF Download...</div>}>
                  <UPFGeneratorDownloadThrpages />
                </Suspense>
              }
            />
            <Route
              path="/tools/upf-generator/task/:taskId/:sheetName"
              element={
                <Suspense fallback={<div>Loading UPF Task...</div>}>
                  <UPFGeneratorSubmitThrpages />
                </Suspense>
              }
            />
            <Route
              path="/tools/guidance/upf-generator"
              element={
                <Suspense fallback={<div>Loading UPF Guidance...</div>}>
                  <UPFGuidancePage />
                </Suspense>
              }
            />
            <Route 
              path="/tools/clk-generator" 
              element={
                <Suspense fallback={<div>Loading Clock Generator...</div>}>
                  <ClkGeneratorPage />
                </Suspense>
              } 
            />
            <Route 
              path="/tools/memory-generator" 
              element={
                <Suspense fallback={<div>Loading Memory Generator...</div>}>
                  <MemoryDataGeneratorPage />
                </Suspense>
              } 
            />

            {/* Catch-all for 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        <Footer />
        <Toaster />
      </div>
    </Router>
    </TaskStatusProvider>
  );
}

export default App;
