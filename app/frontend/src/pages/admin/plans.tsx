import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Package, 
  Plus, 
  Edit, 
  DollarSign
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPlans, createPlan, updatePlan } from '@/services/admin.service';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  priceMonth: number;
  priceYear: number;
  features: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface PlanFormData {
  name: string;
  description: string;
  priceMonth: number;
  priceYear: number;
  features: Record<string, any>;
}

const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>({
    name: '',
    description: '',
    priceMonth: 0,
    priceYear: 0,
    features: {}
  });
  const [formLoading, setFormLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await getPlans();
      setPlans(response.data);
    } catch (error) {
      console.error('Error fetching plans:', error);
      toast({
        title: "错误",
        description: "获取计划列表失败",
        variant: "destructive",
      });
    }
  };

  const handleCreatePlan = async () => {
    if (!formData.name || formData.priceMonth <= 0) {
      toast({
        title: "错误",
        description: "请填写计划名称和月价格",
        variant: "destructive",
      });
      return;
    }

    try {
      setFormLoading(true);
      await createPlan(formData);
      
      toast({
        title: "成功",
        description: "计划创建成功",
      });
      
      setIsCreateDialogOpen(false);
      resetForm();
      fetchPlans();
    } catch (error) {
      console.error('Error creating plan:', error);
      toast({
        title: "错误",
        description: "创建计划失败",
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdatePlan = async () => {
    if (!editingPlan || !formData.name) {
      return;
    }

    try {
      setFormLoading(true);
      await updatePlan(editingPlan.id, formData);
      
      toast({
        title: "成功",
        description: "计划更新成功",
      });
      
      setIsEditDialogOpen(false);
      setEditingPlan(null);
      resetForm();
      fetchPlans();
    } catch (error) {
      console.error('Error updating plan:', error);
      toast({
        title: "错误",
        description: "更新计划失败",
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      priceMonth: 0,
      priceYear: 0,
      features: {}
    });
  };

  const openEditDialog = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      priceMonth: plan.priceMonth / 100,
      priceYear: plan.priceYear / 100,
      features: plan.features
    });
    setIsEditDialogOpen(true);
  };

  const formatPrice = (price: number) => {
    return `¥${(price / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Package className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">计划管理</h1>
            <p className="text-gray-600">管理会员计划和定价</p>
          </div>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="w-4 h-4 mr-2" />
              新建计划
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>创建新计划</DialogTitle>
              <DialogDescription>
                设置计划的基本信息和定价
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="create-name">计划名称</Label>
                <Input
                  id="create-name"
                  placeholder="例如：基础版、专业版"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="create-description">描述</Label>
                <Textarea
                  id="create-description"
                  placeholder="计划描述（可选）"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="create-price-month">月价格（元）</Label>
                  <Input
                    id="create-price-month"
                    type="number"
                    placeholder="0"
                    value={formData.priceMonth}
                    onChange={(e) => setFormData({ ...formData, priceMonth: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="create-price-year">年价格（元）</Label>
                  <Input
                    id="create-price-year"
                    type="number"
                    placeholder="0"
                    value={formData.priceYear}
                    onChange={(e) => setFormData({ ...formData, priceYear: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreatePlan} disabled={formLoading}>
                {formLoading ? "创建中..." : "创建计划"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 计划列表 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(plan)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
              {plan.description && (
                <p className="text-sm text-gray-600">{plan.description}</p>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">月付价格</span>
                  <div className="flex items-center">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <span className="text-lg font-bold text-green-600">
                      {formatPrice(plan.priceMonth)}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">/月</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">年付价格</span>
                  <div className="flex items-center">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <span className="text-lg font-bold text-green-600">
                      {formatPrice(plan.priceYear)}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">/年</span>
                  </div>
                </div>
                {plan.priceYear > 0 && plan.priceMonth > 0 && (
                  <div className="pt-2 border-t">
                    <Badge variant="secondary" className="text-xs">
                      年付优惠 {Math.round((1 - (plan.priceYear / 12) / plan.priceMonth) * 100)}%
                    </Badge>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <p className="text-xs text-gray-500">
                    创建时间: {new Date(plan.createdAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 编辑计划对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑计划</DialogTitle>
            <DialogDescription>
              修改计划的基本信息和定价
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">计划名称</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">描述</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-price-month">月价格（元）</Label>
                <Input
                  id="edit-price-month"
                  type="number"
                  value={formData.priceMonth}
                  onChange={(e) => setFormData({ ...formData, priceMonth: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="edit-price-year">年价格（元）</Label>
                <Input
                  id="edit-price-year"
                  type="number"
                  value={formData.priceYear}
                  onChange={(e) => setFormData({ ...formData, priceYear: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdatePlan} disabled={formLoading}>
              {formLoading ? "更新中..." : "更新计划"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlansPage; 