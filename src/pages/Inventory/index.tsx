/**
 * 库存管理 / Pro Shop 页面
 *
 * Tabs：商品管理 | 库存管理 | 采购管理 | 供应商 | 销售记录 | 统计报表
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Package, ShoppingCart, Truck, Users2, BarChart3,
  Plus, Search, Filter, RefreshCw, Edit2, Trash2,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle,
  ChevronLeft, ChevronRight, Eye, CheckCircle,
  XCircle, Clock, Tags, DollarSign, TrendingUp,
  PackageCheck, PackageX, Boxes, Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../utils/api';

/* ═══════════════════════════════════════════════════════════════════ */
/*                           主组件                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function Inventory() {
  const [activeTab, setActiveTab] = useState<'products' | 'stock' | 'purchase' | 'suppliers' | 'sales' | 'stats'>('products');

  const tabs = [
    { id: 'products' as const, label: '商品管理', icon: Package },
    { id: 'stock' as const,    label: '库存管理', icon: Boxes },
    { id: 'purchase' as const, label: '采购管理', icon: Truck },
    { id: 'suppliers' as const,label: '供应商',   icon: Users2 },
    { id: 'sales' as const,    label: '销售记录', icon: ShoppingCart },
    { id: 'stats' as const,    label: '统计报表', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/50 to-orange-50/30">
      {/* Header */}
      <div className="bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center text-white">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">库存管理 / Pro Shop</h1>
              <p className="text-sm text-muted-foreground">商品、库存、采购、供应商、销售一站式管理</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'products' && <ProductsTab />}
        {activeTab === 'stock' && <StockTab />}
        {activeTab === 'purchase' && <PurchaseTab />}
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'sales' && <SalesTab />}
        {activeTab === 'stats' && <StatsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*                       商 品 管 理 Tab                              */
/* ═══════════════════════════════════════════════════════════════════ */
function ProductsTab() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterCategory, setFilterCategory] = useState('');
  const [keyword, setKeyword] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({
    name: '', categoryId: '', categoryName: '', brand: '', description: '',
    barcode: '', price: '', costPrice: '', memberPrice: '', unit: '件',
    minStock: '5', maxStock: '999', location: '',
  });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize: 15 };
      if (filterCategory) params.categoryId = filterCategory;
      if (keyword) params.keyword = keyword;
      const res: any = await api.inventory.getProducts(params);
      if (res.success) { setProducts(res.data || []); setTotal(res.total || 0); }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [page, filterCategory, keyword]);

  const fetchCategories = useCallback(async () => {
    try {
      const res: any = await api.inventory.getCategories();
      if (res.success) setCategories(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('商品名称必填'); return; }
    try {
      const data = {
        ...form,
        price: Number(form.price) || 0,
        costPrice: Number(form.costPrice) || 0,
        memberPrice: form.memberPrice ? Number(form.memberPrice) : null,
        minStock: Number(form.minStock) || 5,
        maxStock: Number(form.maxStock) || 999,
      };
      if (editItem) {
        await api.inventory.updateProduct(editItem._id, data);
        toast.success('商品更新成功');
      } else {
        await api.inventory.createProduct(data);
        toast.success('商品创建成功');
      }
      setShowForm(false); setEditItem(null);
      setForm({ name: '', categoryId: '', categoryName: '', brand: '', description: '', barcode: '', price: '', costPrice: '', memberPrice: '', unit: '件', minStock: '5', maxStock: '999', location: '' });
      fetchProducts();
    } catch { toast.error('操作失败'); }
  };

  const handleEdit = (p: any) => {
    setEditItem(p);
    setForm({
      name: p.name || '', categoryId: p.categoryId || '', categoryName: p.categoryName || '',
      brand: p.brand || '', description: p.description || '', barcode: p.barcode || '',
      price: String(p.price || ''), costPrice: String(p.costPrice || ''),
      memberPrice: p.memberPrice != null ? String(p.memberPrice) : '',
      unit: p.unit || '件', minStock: String(p.minStock || 5), maxStock: String(p.maxStock || 999),
      location: p.location || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定下架此商品？')) return;
    try { await api.inventory.deleteProduct(id); toast.success('已下架'); fetchProducts(); }
    catch { toast.error('操作失败'); }
  };

  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="bg-card rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
              placeholder="搜索商品名称/SKU/品牌..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
            className="text-sm border rounded-lg px-3 py-2">
            <option value="">全部分类</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <div className="flex-1" />
          <button onClick={() => { setEditItem(null); setForm({ name: '', categoryId: '', categoryName: '', brand: '', description: '', barcode: '', price: '', costPrice: '', memberPrice: '', unit: '件', minStock: '5', maxStock: '999', location: '' }); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 shadow-sm">
            <Plus className="w-4 h-4" /> 新增商品
          </button>
          <button onClick={fetchProducts} className="p-2 rounded-lg hover:bg-secondary">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 新增/编辑表单 */}
      {showForm && (
        <div className="bg-card rounded-xl shadow-sm border p-6">
          <h3 className="font-bold text-foreground mb-4">{editItem ? '编辑商品' : '新增商品'}</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">商品名称 *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如: Titleist Pro V1 高尔夫球" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">分类</label>
              <select value={form.categoryId} onChange={e => {
                const cat = categories.find(c => c._id === e.target.value);
                setForm(f => ({ ...f, categoryId: e.target.value, categoryName: cat?.name || '' }));
              }} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">选择分类</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">品牌</label>
              <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Titleist" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">零售价 (¥)</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">成本价 (¥)</label>
              <input type="number" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">会员价 (¥)</label>
              <input type="number" value={form.memberPrice} onChange={e => setForm(f => ({ ...f, memberPrice: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="留空=无会员价" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">条码</label>
              <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="EAN/UPC" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">单位</label>
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">最低库存</label>
              <input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">库位</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="A-01-03" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">描述</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="简要描述" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
            <button onClick={handleSubmit} className="px-5 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 shadow-sm">
              {editItem ? '保存修改' : '创建商品'}
            </button>
          </div>
        </div>
      )}

      {/* 商品列表 */}
      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        {loading && products.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />加载中...</div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center"><Package className="w-10 h-10 text-muted-foreground mx-auto mb-2" /><p className="text-muted-foreground">暂无商品</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">商品名称</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">分类</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">品牌</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">零售价</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">成本价</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">库存</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">已售</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">状态</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {products.map(p => (
                <tr key={p._id} className="hover:bg-secondary/50/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.categoryName || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.brand || '-'}</td>
                  <td className="px-4 py-3 text-right font-medium">¥{(p.price || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">¥{(p.costPrice || 0).toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${(p.stock || 0) <= (p.minStock || 5) ? 'text-red-600' : 'text-foreground'}`}>
                    {p.stock || 0}
                    {(p.stock || 0) <= (p.minStock || 5) && <AlertTriangle className="inline w-3.5 h-3.5 ml-1 text-red-500" />}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{p.totalSold || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-secondary text-muted-foreground'
                    }`}>{p.status === 'active' ? '在售' : '已下架'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(p)} className="p-1.5 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(p._id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-secondary/50/50">
            <span className="text-sm text-muted-foreground">共 {total} 条</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="px-2 py-1 text-sm">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*                       库 存 管 理 Tab                              */
/* ═══════════════════════════════════════════════════════════════════ */
function StockTab() {
  const [movements, setMovements] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMovForm, setShowMovForm] = useState(false);
  const [movForm, setMovForm] = useState({ productId: '', type: 'in', quantity: '', reason: '' });
  const [products, setProducts] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [movRes, lowRes, prodRes]: any[] = await Promise.all([
        api.inventory.getMovements({ pageSize: 30 }),
        api.inventory.getLowStock(),
        api.inventory.getProducts({ pageSize: 200 }),
      ]);
      if (movRes.success) setMovements(movRes.data || []);
      if (lowRes.success) setLowStock(lowRes.data || []);
      if (prodRes.success) setProducts(prodRes.data || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMovement = async () => {
    if (!movForm.productId || !movForm.quantity) { toast.error('请选择商品并填写数量'); return; }
    try {
      const res: any = await api.inventory.createMovement({
        productId: movForm.productId,
        type: movForm.type,
        quantity: Number(movForm.quantity),
        reason: movForm.reason,
        operatorName: '管理员',
      });
      if (res.success) {
        toast.success(`库存变动成功，当前库存: ${res.data?.newStock}`);
        setShowMovForm(false);
        setMovForm({ productId: '', type: 'in', quantity: '', reason: '' });
        fetchData();
      }
    } catch { toast.error('操作失败'); }
  };

  const typeLabels: Record<string, { label: string; color: string; icon: any }> = {
    in:        { label: '入库', color: 'text-green-600 bg-green-50', icon: ArrowDownCircle },
    out:       { label: '出库', color: 'text-red-600 bg-red-50', icon: ArrowUpCircle },
    adjust:    { label: '调整', color: 'text-blue-600 bg-blue-50', icon: Edit2 },
    stocktake: { label: '盘点', color: 'text-purple-600 bg-purple-50', icon: Eye },
  };

  return (
    <div className="space-y-4">
      {/* 低库存预警 */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="font-bold text-red-700">低库存预警 ({lowStock.length})</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {lowStock.slice(0, 8).map(p => (
              <div key={p._id} className="bg-card rounded-lg p-3 border border-red-100">
                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.sku}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-bold text-red-600">{p.stock || 0}</span>
                  <span className="text-xs text-muted-foreground">最低: {p.minStock || 5}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 操作 */}
      <div className="flex items-center gap-3">
        <button onClick={() => setShowMovForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 shadow-sm">
          <Plus className="w-4 h-4" /> 库存变动
        </button>
        <button onClick={fetchData} className="p-2 rounded-lg hover:bg-secondary">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 变动表单 */}
      {showMovForm && (
        <div className="bg-card rounded-xl shadow-sm border p-5">
          <h3 className="font-bold text-foreground mb-4">库存变动</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">商品</label>
              <select value={movForm.productId} onChange={e => setMovForm(f => ({ ...f, productId: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">选择商品</option>
                {products.filter(p => p.status === 'active').map(p =>
                  <option key={p._id} value={p._id}>{p.name} ({p.sku}) 库存:{p.stock || 0}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">类型</label>
              <select value={movForm.type} onChange={e => setMovForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="in">入库</option>
                <option value="out">出库</option>
                <option value="adjust">调整 (+/-)</option>
                <option value="stocktake">盘点（设置绝对值）</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">数量</label>
              <input type="number" value={movForm.quantity} onChange={e => setMovForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="数量" />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-muted-foreground mb-1">原因</label>
            <input value={movForm.reason} onChange={e => setMovForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="入库原因/出库原因" />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowMovForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
            <button onClick={handleMovement} className="px-5 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700">提交</button>
          </div>
        </div>
      )}

      {/* 流水 */}
      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 border-b bg-secondary/50/50 font-semibold text-foreground">库存变动流水</div>
        {movements.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">暂无记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">时间</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">商品</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">类型</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">数量</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">变动前</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">变动后</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">原因</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作人</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {movements.map((m, i) => {
                const t = typeLabels[m.type] || typeLabels.adjust;
                return (
                  <tr key={m._id || i} className="hover:bg-secondary/50/50">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{(m.createdAt || '').replace('T', ' ').slice(0, 16)}</td>
                    <td className="px-4 py-2.5">{m.productName} <span className="text-xs text-muted-foreground">({m.productSku})</span></td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${m.type === 'in' ? 'text-green-600' : m.type === 'out' ? 'text-red-600' : 'text-blue-600'}`}>
                      {m.type === 'in' ? '+' : m.type === 'out' ? '-' : ''}{Math.abs(m.quantity)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{m.beforeStock}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{m.afterStock}</td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[160px]">{m.reason || '-'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.operatorName || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*                       采 购 管 理 Tab                              */
/* ═══════════════════════════════════════════════════════════════════ */
function PurchaseTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ supplierId: '', supplierName: '', notes: '', items: [{ productId: '', productName: '', sku: '', quantity: '', unitCost: '' }] });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.inventory.getPurchaseOrders({ pageSize: 50 });
      if (res.success) setOrders(res.data || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [sRes, pRes]: any[] = await Promise.all([
        api.inventory.getSuppliers(),
        api.inventory.getProducts({ pageSize: 200 }),
      ]);
      if (sRes.success) setSuppliers(sRes.data || []);
      if (pRes.success) setProducts(pRes.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchOrders(); fetchMeta(); }, [fetchOrders, fetchMeta]);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { productId: '', productName: '', sku: '', quantity: '', unitCost: '' }] }));
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const updateItem = (idx: number, field: string, value: string) => {
    setForm(f => {
      const items = [...f.items];
      (items[idx] as any)[field] = value;
      if (field === 'productId') {
        const p = products.find(pp => pp._id === value);
        if (p) { items[idx].productName = p.name; items[idx].sku = p.sku; items[idx].unitCost = String(p.costPrice || ''); }
      }
      return { ...f, items };
    });
  };

  const handleCreate = async () => {
    const validItems = form.items.filter(i => i.productId && Number(i.quantity) > 0);
    if (validItems.length === 0) { toast.error('请至少添加一个采购项'); return; }
    try {
      const res: any = await api.inventory.createPurchaseOrder({
        supplierId: form.supplierId, supplierName: form.supplierName,
        items: validItems.map(i => ({ ...i, quantity: Number(i.quantity), unitCost: Number(i.unitCost) || 0 })),
        notes: form.notes,
      });
      if (res.success) {
        toast.success(`采购单 ${res.data?.poNo} 创建成功`);
        setShowForm(false);
        setForm({ supplierId: '', supplierName: '', notes: '', items: [{ productId: '', productName: '', sku: '', quantity: '', unitCost: '' }] });
        fetchOrders();
      }
    } catch { toast.error('创建失败'); }
  };

  const changeStatus = async (id: string, status: string) => {
    try {
      const res: any = await api.inventory.updatePOStatus(id, { status, operatorName: '管理员' });
      if (res.success) { toast.success('状态已更新'); fetchOrders(); }
    } catch { toast.error('操作失败'); }
  };

  const receivePO = async (po: any) => {
    const items = (po.items || []).map((i: any) => ({
      productId: i.productId,
      receivedQty: i.quantity - (i.receivedQty || 0),
    }));
    try {
      const res: any = await api.inventory.receivePO(po._id, { items, operatorName: '管理员' });
      if (res.success) { toast.success(res.message); fetchOrders(); }
    } catch { toast.error('收货失败'); }
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    draft: { label: '草稿', color: 'bg-secondary text-muted-foreground' },
    submitted: { label: '已提交', color: 'bg-blue-50 text-blue-600' },
    approved: { label: '已审批', color: 'bg-indigo-50 text-indigo-600' },
    ordered: { label: '已下单', color: 'bg-purple-50 text-purple-600' },
    partial_received: { label: '部分收货', color: 'bg-amber-50 text-amber-600' },
    received: { label: '已收货', color: 'bg-green-50 text-green-600' },
    cancelled: { label: '已取消', color: 'bg-red-50 text-red-600' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 shadow-sm">
          <Plus className="w-4 h-4" /> 新建采购单
        </button>
        <button onClick={fetchOrders} className="p-2 rounded-lg hover:bg-secondary">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 新建表单 */}
      {showForm && (
        <div className="bg-card rounded-xl shadow-sm border p-6">
          <h3 className="font-bold text-foreground mb-4">新建采购单</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">供应商</label>
              <select value={form.supplierId} onChange={e => {
                const s = suppliers.find(ss => ss._id === e.target.value);
                setForm(f => ({ ...f, supplierId: e.target.value, supplierName: s?.name || '' }));
              }} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">选择供应商</option>
                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">备注</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="采购备注" />
            </div>
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <span className="flex-1">商品</span><span className="w-20">数量</span><span className="w-24">单价</span><span className="w-24">小计</span><span className="w-8"></span>
            </div>
            {form.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={item.productId} onChange={e => updateItem(idx, 'productId', e.target.value)}
                  className="flex-1 border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">选择商品</option>
                  {products.filter(p => p.status === 'active').map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
                </select>
                <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                  className="w-20 border rounded-lg px-2 py-1.5 text-sm text-center" placeholder="0" />
                <input type="number" value={item.unitCost} onChange={e => updateItem(idx, 'unitCost', e.target.value)}
                  className="w-24 border rounded-lg px-2 py-1.5 text-sm text-right" placeholder="¥0" />
                <span className="w-24 text-right text-sm font-medium">¥{((Number(item.quantity) || 0) * (Number(item.unitCost) || 0)).toFixed(2)}</span>
                <button onClick={() => removeItem(idx)} className="w-8 p-1 text-red-400 hover:text-red-600"><XCircle className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={addItem} className="text-sm text-orange-600 hover:text-orange-800">+ 添加采购项</button>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold">合计: ¥{form.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0).toFixed(2)}</span>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
              <button onClick={handleCreate} className="px-5 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700">创建采购单</button>
            </div>
          </div>
        </div>
      )}

      {/* 采购单列表 */}
      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        {orders.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground"><Truck className="w-10 h-10 text-muted-foreground mx-auto mb-2" />暂无采购单</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">采购单号</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">供应商</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">项数</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">金额</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">状态</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">创建时间</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {orders.map(po => {
                const st = statusLabels[po.status] || statusLabels.draft;
                return (
                  <tr key={po._id} className="hover:bg-secondary/50/50">
                    <td className="px-4 py-3 font-mono text-xs">{po.poNo}</td>
                    <td className="px-4 py-3">{po.supplierName || '-'}</td>
                    <td className="px-4 py-3 text-right">{po.totalItems || 0}</td>
                    <td className="px-4 py-3 text-right font-medium">¥{(po.totalAmount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{(po.createdAt || '').replace('T', ' ').slice(0, 16)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {po.status === 'draft' && <button onClick={() => changeStatus(po._id, 'submitted')} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">提交</button>}
                        {po.status === 'submitted' && <button onClick={() => changeStatus(po._id, 'approved')} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100">审批</button>}
                        {po.status === 'approved' && <button onClick={() => changeStatus(po._id, 'ordered')} className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100">下单</button>}
                        {(po.status === 'ordered' || po.status === 'partial_received') && <button onClick={() => receivePO(po)} className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100">收货</button>}
                        {!['received', 'cancelled'].includes(po.status) && <button onClick={() => changeStatus(po._id, 'cancelled')} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">取消</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*                        供 应 商 Tab                                */
/* ═══════════════════════════════════════════════════════════════════ */
function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', paymentTerms: '', notes: '' });

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try { const res: any = await api.inventory.getSuppliers(); if (res.success) setSuppliers(res.data || []); }
    catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('供应商名称必填'); return; }
    try {
      if (editItem) { await api.inventory.updateSupplier(editItem._id, form); toast.success('更新成功'); }
      else { await api.inventory.createSupplier(form); toast.success('创建成功'); }
      setShowForm(false); setEditItem(null);
      setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', paymentTerms: '', notes: '' });
      fetchSuppliers();
    } catch { toast.error('操作失败'); }
  };

  const handleEdit = (s: any) => {
    setEditItem(s);
    setForm({ name: s.name || '', contactPerson: s.contactPerson || '', phone: s.phone || '', email: s.email || '', address: s.address || '', paymentTerms: s.paymentTerms || '', notes: s.notes || '' });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此供应商？')) return;
    try { await api.inventory.deleteSupplier(id); toast.success('已删除'); fetchSuppliers(); }
    catch { toast.error('删除失败'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { setEditItem(null); setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', paymentTerms: '', notes: '' }); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 shadow-sm">
          <Plus className="w-4 h-4" /> 新增供应商
        </button>
        <button onClick={fetchSuppliers} className="p-2 rounded-lg hover:bg-secondary">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl shadow-sm border p-6">
          <h3 className="font-bold text-foreground mb-4">{editItem ? '编辑供应商' : '新增供应商'}</h3>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-xs text-muted-foreground mb-1">名称 *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">联系人</label>
              <input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">电话</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">邮箱</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">付款条件</label>
              <input value={form.paymentTerms} onChange={e => setForm(f => ({ ...f, paymentTerms: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如: 月结30天" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">地址</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
            <button onClick={handleSubmit} className="px-5 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700">{editItem ? '保存' : '创建'}</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground"><Users2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />暂无供应商</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">名称</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">联系人</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">电话</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">邮箱</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">付款条件</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">订单数</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">累计金额</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {suppliers.map(s => (
                <tr key={s._id} className="hover:bg-secondary/50/50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.contactPerson || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.phone || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.email || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.paymentTerms || '-'}</td>
                  <td className="px-4 py-3 text-right">{s.totalOrders || 0}</td>
                  <td className="px-4 py-3 text-right font-medium">¥{(s.totalAmount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(s)} className="p-1.5 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(s._id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*                       销 售 记 录 Tab                              */
/* ═══════════════════════════════════════════════════════════════════ */
function SalesTab() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [saleItems, setSaleItems] = useState([{ productId: '', productName: '', sku: '', quantity: '1', unitPrice: '', discount: '0' }]);
  const [payMethod, setPayMethod] = useState('cash');

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try { const res: any = await api.inventory.getSales({ pageSize: 50 }); if (res.success) setSales(res.data || []); }
    catch { /* silent */ } finally { setLoading(false); }
  }, []);

  const fetchProducts = useCallback(async () => {
    try { const res: any = await api.inventory.getProducts({ pageSize: 200 }); if (res.success) setProducts(res.data || []); }
    catch { /* silent */ }
  }, []);

  useEffect(() => { fetchSales(); fetchProducts(); }, [fetchSales, fetchProducts]);

  const addSaleItem = () => setSaleItems(prev => [...prev, { productId: '', productName: '', sku: '', quantity: '1', unitPrice: '', discount: '0' }]);
  const removeSaleItem = (idx: number) => setSaleItems(prev => prev.filter((_, i) => i !== idx));

  const updateSaleItem = (idx: number, field: string, value: string) => {
    setSaleItems(prev => {
      const items = [...prev];
      (items[idx] as any)[field] = value;
      if (field === 'productId') {
        const p = products.find(pp => pp._id === value);
        if (p) { items[idx].productName = p.name; items[idx].sku = p.sku; items[idx].unitPrice = String(p.price || ''); }
      }
      return items;
    });
  };

  const handleSale = async () => {
    const valid = saleItems.filter(i => i.productId && Number(i.quantity) > 0);
    if (valid.length === 0) { toast.error('请添加商品'); return; }
    try {
      const res: any = await api.inventory.createSale({
        items: valid.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) || 0, discount: Number(i.discount) || 0 })),
        payMethod, operatorName: '管理员',
      });
      if (res.success) {
        toast.success(`销售单 ${res.data?.saleNo} 完成, ¥${res.data?.totalAmount}`);
        setShowForm(false);
        setSaleItems([{ productId: '', productName: '', sku: '', quantity: '1', unitPrice: '', discount: '0' }]);
        fetchSales();
      }
    } catch { toast.error('销售失败'); }
  };

  const handleRefund = async (id: string) => {
    if (!confirm('确定退货？库存将自动回退。')) return;
    try {
      const res: any = await api.inventory.refundSale(id);
      if (res.success) { toast.success('退货成功'); fetchSales(); }
    } catch { toast.error('退货失败'); }
  };

  const saleTotal = saleItems.reduce((s, i) => s + ((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) - (Number(i.discount) || 0)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 shadow-sm">
          <ShoppingCart className="w-4 h-4" /> 新建销售单
        </button>
        <button onClick={fetchSales} className="p-2 rounded-lg hover:bg-secondary">
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl shadow-sm border p-6">
          <h3 className="font-bold text-foreground mb-4">新建销售单 (POS)</h3>
          <div className="space-y-2 mb-4">
            {saleItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={item.productId} onChange={e => updateSaleItem(idx, 'productId', e.target.value)}
                  className="flex-1 border rounded-lg px-2 py-1.5 text-sm">
                  <option value="">选择商品</option>
                  {products.filter(p => p.status === 'active' && (p.stock || 0) > 0).map(p =>
                    <option key={p._id} value={p._id}>{p.name} (¥{p.price} 库存:{p.stock})</option>
                  )}
                </select>
                <input type="number" value={item.quantity} onChange={e => updateSaleItem(idx, 'quantity', e.target.value)}
                  className="w-16 border rounded-lg px-2 py-1.5 text-sm text-center" placeholder="1" />
                <input type="number" value={item.unitPrice} onChange={e => updateSaleItem(idx, 'unitPrice', e.target.value)}
                  className="w-24 border rounded-lg px-2 py-1.5 text-sm text-right" placeholder="¥" />
                <input type="number" value={item.discount} onChange={e => updateSaleItem(idx, 'discount', e.target.value)}
                  className="w-20 border rounded-lg px-2 py-1.5 text-sm text-right" placeholder="折扣" />
                <span className="w-24 text-right text-sm font-medium">¥{((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0)).toFixed(2)}</span>
                <button onClick={() => removeSaleItem(idx)} className="text-red-400 hover:text-red-600"><XCircle className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={addSaleItem} className="text-sm text-orange-600">+ 添加商品</button>
          </div>
          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">支付方式:</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="cash">现金</option>
                <option value="wechat">微信</option>
                <option value="alipay">支付宝</option>
                <option value="card">银行卡</option>
                <option value="member_card">会员卡</option>
                <option value="folio">挂房账</option>
              </select>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold">合计: ¥{saleTotal.toFixed(2)}</span>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
              <button onClick={handleSale} className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 shadow-sm">
                <CheckCircle className="w-4 h-4 inline mr-1" /> 完成销售
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        {sales.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground"><ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-2" />暂无销售记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">单号</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">商品</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">金额</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">支付</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">客户</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">状态</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">时间</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sales.map(s => (
                <tr key={s._id} className="hover:bg-secondary/50/50">
                  <td className="px-4 py-3 font-mono text-xs">{s.saleNo}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                    {(s.items || []).map((i: any) => `${i.productName}x${i.quantity}`).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">¥{(s.totalAmount || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center text-xs">{s.payMethod}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.customerName || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {s.status === 'completed' ? '已完成' : '已退货'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{(s.createdAt || '').replace('T', ' ').slice(0, 16)}</td>
                  <td className="px-4 py-3 text-center">
                    {s.status === 'completed' && (
                      <button onClick={() => handleRefund(s._id)} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">退货</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*                       统 计 报 表 Tab                              */
/* ═══════════════════════════════════════════════════════════════════ */
function StatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const res: any = await api.inventory.getStats(); if (res.success) setStats(res.data); }
      catch { /* silent */ } finally { setLoading(false); }
    })();
  }, []);

  if (loading || !stats) return <div className="py-20 text-center text-muted-foreground"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />加载中...</div>;

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '在售商品', value: stats.products?.total || 0, icon: Package, color: 'orange' },
          { label: '库存成本', value: `¥${(stats.products?.totalStockValue || 0).toLocaleString()}`, icon: DollarSign, color: 'blue' },
          { label: '低库存预警', value: stats.products?.lowStockCount || 0, icon: AlertTriangle, color: 'red' },
          { label: '库存零售值', value: `¥${(stats.products?.totalRetailValue || 0).toLocaleString()}`, icon: Tags, color: 'green' },
        ].map((c, i) => (
          <div key={i} className="bg-card rounded-xl shadow-sm border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{c.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${c.color}-50 text-${c.color}-600`}>
                <c.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 销售统计 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl shadow-sm border p-5">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-orange-500" />销售概况</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-lg p-4"><p className="text-xs text-green-600">总销售额</p><p className="text-xl font-bold text-green-700 mt-1">¥{(stats.sales?.totalRevenue || 0).toLocaleString()}</p></div>
            <div className="bg-blue-50 rounded-lg p-4"><p className="text-xs text-blue-600">总订单数</p><p className="text-xl font-bold text-blue-700 mt-1">{stats.sales?.totalCount || 0}</p></div>
            <div className="bg-amber-50 rounded-lg p-4"><p className="text-xs text-amber-600">今日销售额</p><p className="text-xl font-bold text-amber-700 mt-1">¥{(stats.sales?.todayRevenue || 0).toLocaleString()}</p></div>
            <div className="bg-purple-50 rounded-lg p-4"><p className="text-xs text-purple-600">今日订单</p><p className="text-xl font-bold text-purple-700 mt-1">{stats.sales?.todayCount || 0}</p></div>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-sm border p-5">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Truck className="w-4 h-4 text-orange-500" />采购概况</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 rounded-lg p-4"><p className="text-xs text-orange-600">待处理采购单</p><p className="text-xl font-bold text-orange-700 mt-1">{stats.purchases?.pendingCount || 0}</p></div>
            <div className="bg-indigo-50 rounded-lg p-4"><p className="text-xs text-indigo-600">累计采购额</p><p className="text-xl font-bold text-indigo-700 mt-1">¥{(stats.purchases?.totalAmount || 0).toLocaleString()}</p></div>
          </div>
        </div>
      </div>

      {/* 畅销 TOP 10 */}
      <div className="bg-card rounded-xl shadow-sm border p-5">
        <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-orange-500" />畅销商品 TOP 10</h3>
        {(stats.topSellers || []).length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">暂无销售数据</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-4 py-2 text-muted-foreground">#</th>
                <th className="text-left px-4 py-2 text-muted-foreground">商品</th>
                <th className="text-left px-4 py-2 text-muted-foreground">SKU</th>
                <th className="text-right px-4 py-2 text-muted-foreground">售出数量</th>
                <th className="text-right px-4 py-2 text-muted-foreground">销售收入</th>
              </tr>
            </thead>
            <tbody>
              {stats.topSellers.map((p: any, i: number) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="px-4 py-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-secondary text-white' : i === 2 ? 'bg-orange-300 text-white' : 'bg-secondary text-muted-foreground'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{p.sku}</td>
                  <td className="px-4 py-2 text-right">{p.totalSold}</td>
                  <td className="px-4 py-2 text-right font-medium">¥{(p.revenue || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分类统计 */}
      <div className="bg-card rounded-xl shadow-sm border p-5">
        <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><Tags className="w-4 h-4 text-orange-500" />按分类统计</h3>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(stats.byCategory || {}).map(([cat, data]: [string, any]) => (
            <div key={cat} className="bg-secondary/50 rounded-lg p-4 border">
              <p className="text-sm font-medium text-foreground">{cat}</p>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-lg font-bold text-foreground">{data.count} <span className="text-xs font-normal text-muted-foreground">件</span></span>
                <span className="text-sm text-muted-foreground">售出 {data.totalSold}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">库存成本: ¥{(data.stockValue || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
