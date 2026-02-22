import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, X, RefreshCw, ShoppingCart, Receipt,
  Search, UtensilsCrossed, LayoutGrid, Settings2, ChefHat,
  CreditCard, Banknote, QrCode, Wallet, ClipboardList, XCircle,
  BarChart3
} from 'lucide-react'
import { api } from '@/utils/api'

/* ========== 类型 ========== */
interface Outlet { _id: string; outletName: string; outletCode: string; outletType: string; status: string }
interface Table { _id: string; outletId: string; tableNo: string; tableName: string; area: string; capacity: number; status: string; currentOrderId: string | null }
interface Category { _id: string; outletId: string; categoryName: string; sortOrder: number }
interface MenuItem { _id: string; categoryId: string; outletId: string; itemName: string; price: number; memberPrice: number | null; unit: string; description: string; tags: string[]; soldOut: boolean; status: string }
interface OrderItem { itemId: string; itemName: string; quantity: number; unitPrice: number; modifiers: string[]; subtotal: number; status: string }
interface DiningOrder { _id: string; orderNo: string; outletId: string; outletName: string; tableId: string | null; tableNo: string; guestName: string; cardNo: string | null; folioId: string | null; guestCount: number; items: OrderItem[]; subtotal: number; totalAmount: number; status: string; payMethod: string | null; openedAt: string; settledAt: string | null }

const PAY_OPTIONS = [
  { value: 'folio', label: '挂账', icon: Receipt },
  { value: 'cash', label: '现金', icon: Banknote },
  { value: 'wechat', label: '微信', icon: QrCode },
  { value: 'alipay', label: '支付宝', icon: Wallet },
  { value: 'member_card', label: '会员卡', icon: CreditCard },
]

const TABLE_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  available: { label: '空台', bg: 'bg-success/10', text: 'text-success' },
  occupied:  { label: '有客', bg: 'bg-red-100',     text: 'text-red-700' },
  reserved:  { label: '预留', bg: 'bg-blue-100',    text: 'text-blue-700' },
  cleaning:  { label: '清台', bg: 'bg-yellow-100',  text: 'text-yellow-700' },
}

/* ========== 主组件 ========== */
export default function Dining() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'pos' | 'tables' | 'menu' | 'orders' | 'outlets' | 'reports'>('pos')
  const [loading, setLoading] = useState(false)

  // 数据
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [selectedOutlet, setSelectedOutlet] = useState<string>('')
  const [tables, setTables] = useState<Table[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<DiningOrder[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('')
  const [menuSearch, setMenuSearch] = useState('')

  // POS 购物车
  const [cart, setCart] = useState<{ item: MenuItem; qty: number }[]>([])
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [guestName, setGuestName] = useState('')
  const [cardNo, setCardNo] = useState('')
  const [guestCount, setGuestCount] = useState('2')

  // 结账
  const [settlingOrder, setSettlingOrder] = useState<DiningOrder | null>(null)
  const [settlePayMethod, setSettlePayMethod] = useState('cash')
  const [settleFolioId, setSettleFolioId] = useState('')

  // 弹窗
  const [showAddOutlet, setShowAddOutlet] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddTable, setShowAddTable] = useState(false)

  // 报表
  const [reportData, setReportData] = useState<any>(null)
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))

  // 表单
  const [fOutletName, setFOutletName] = useState('')
  const [fOutletType, setFOutletType] = useState('restaurant')
  const [fCatName, setFCatName] = useState('')
  const [fItemName, setFItemName] = useState('')
  const [fItemPrice, setFItemPrice] = useState('0')
  const [fItemUnit, setFItemUnit] = useState('份')
  const [fItemCatId, setFItemCatId] = useState('')
  const [fTableNo, setFTableNo] = useState('')
  const [fTableArea, setFTableArea] = useState('')
  const [fTableCap, setFTableCap] = useState('4')

  /* ---------- 加载 ---------- */
  const loadOutlets = useCallback(async () => {
    try { const r: any = await api.diningOutlets.getList(); setOutlets(r.data || []) } catch { /* */ }
  }, [])

  const loadTables = useCallback(async () => {
    if (!selectedOutlet) return
    try { const r: any = await api.tables.getList({ outletId: selectedOutlet }); setTables(r.data || []) } catch { /* */ }
  }, [selectedOutlet])

  const loadMenu = useCallback(async () => {
    if (!selectedOutlet) return
    try {
      const [catRes, itemRes] = await Promise.all([
        api.menu.getCategories({ outletId: selectedOutlet }),
        api.menu.getItems({ outletId: selectedOutlet }),
      ]) as any[]
      setCategories(catRes.data || [])
      setMenuItems(itemRes.data || [])
    } catch { /* */ }
  }, [selectedOutlet])

  const loadOrders = useCallback(async () => {
    try {
      const params: any = {}
      if (selectedOutlet) params.outletId = selectedOutlet
      const r: any = await api.diningOrders.getList(params); setOrders(r.data || [])
    } catch { /* */ }
  }, [selectedOutlet])

  const loadReport = useCallback(async () => {
    try { const r: any = await api.diningOrders.getDailyReport({ date: reportDate }); setReportData(r.data || null) } catch { /* */ }
  }, [reportDate])

  useEffect(() => { loadOutlets() }, [loadOutlets])
  useEffect(() => {
    if (selectedOutlet) { loadTables(); loadMenu(); loadOrders() }
  }, [selectedOutlet, loadTables, loadMenu, loadOrders])

  // 自动选择第一个消费点
  useEffect(() => { if (outlets.length > 0 && !selectedOutlet) setSelectedOutlet(outlets[0]._id) }, [outlets, selectedOutlet])
  useEffect(() => { if (tab === 'reports') loadReport() }, [tab, loadReport])

  /* ---------- POS 操作 ---------- */
  const addToCart = (item: MenuItem) => {
    if (item.soldOut) { toast.error('已估清'); return }
    setCart(prev => {
      const idx = prev.findIndex(c => c.item._id === item._id)
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n }
      return [...prev, { item, qty: 1 }]
    })
  }

  const updateCartQty = (itemId: string, delta: number) => {
    setCart(prev => prev.map(c => c.item._id === itemId ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0))
  }

  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.qty, 0)

  const handlePlaceOrder = async () => {
    if (cart.length === 0) { toast.error('请先选菜'); return }
    setLoading(true)
    try {
      const outletObj = outlets.find(o => o._id === selectedOutlet)
      await api.diningOrders.create({
        outletId: selectedOutlet, outletName: outletObj?.outletName || '',
        tableId: selectedTable?._id || null, tableNo: selectedTable?.tableNo || '',
        guestName: guestName || '', cardNo: cardNo || null,
        guestCount: Number(guestCount),
        items: cart.map(c => ({ itemId: c.item._id, itemName: c.item.itemName, quantity: c.qty, unitPrice: c.item.price, price: c.item.price })),
      })
      toast.success('下单成功')
      setCart([]); setSelectedTable(null); setGuestName(''); setCardNo('')
      loadOrders(); loadTables()
    } catch { /* */ }
    setLoading(false)
  }

  const handleSettle = async () => {
    if (!settlingOrder) return
    try {
      await api.diningOrders.settle(settlingOrder._id, {
        payMethod: settlePayMethod,
        folioId: settlePayMethod === 'folio' ? settleFolioId : undefined,
      })
      toast.success('结账成功'); setSettlingOrder(null)
      loadOrders(); loadTables()
    } catch { /* */ }
  }

  // 菜品过滤
  const filteredItems = menuItems.filter(it => {
    if (selectedCat && it.categoryId !== selectedCat) return false
    if (menuSearch && !it.itemName.includes(menuSearch)) return false
    if (it.status !== 'active') return false
    return true
  })

  /* ---------- CRUD 操作 ---------- */
  const handleAddOutlet = async () => {
    if (!fOutletName.trim()) { toast.error('名称必填'); return }
    try { await api.diningOutlets.create({ outletName: fOutletName.trim(), outletType: fOutletType }); toast.success('创建成功'); setShowAddOutlet(false); setFOutletName(''); loadOutlets() } catch { /* */ }
  }
  const handleAddCategory = async () => {
    if (!fCatName.trim()) { toast.error('名称必填'); return }
    try { await api.menu.createCategory({ outletId: selectedOutlet, categoryName: fCatName.trim() }); toast.success('创建成功'); setShowAddCategory(false); setFCatName(''); loadMenu() } catch { /* */ }
  }
  const handleAddItem = async () => {
    if (!fItemName.trim()) { toast.error('名称必填'); return }
    try { await api.menu.createItem({ outletId: selectedOutlet, categoryId: fItemCatId || null, itemName: fItemName.trim(), price: Number(fItemPrice), unit: fItemUnit }); toast.success('创建成功'); setShowAddItem(false); setFItemName(''); loadMenu() } catch { /* */ }
  }
  const handleAddTable = async () => {
    if (!fTableNo.trim()) { toast.error('台号必填'); return }
    try { await api.tables.create({ outletId: selectedOutlet, tableNo: fTableNo.trim(), area: fTableArea, capacity: Number(fTableCap) }); toast.success('创建成功'); setShowAddTable(false); setFTableNo(''); loadTables() } catch { /* */ }
  }
  const handleSoldOut = async (item: MenuItem) => {
    try { await api.menu.soldOut(item._id, !item.soldOut); toast.success(item.soldOut ? '已恢复' : '已估清'); loadMenu() } catch { /* */ }
  }

  /* ========== 渲染 ========== */
  return (
    <div className="min-h-screen bg-page-bg">
      {/* 头部 */}
      <div className="bg-card border-b border-border px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate('/home')} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">餐饮管理</h1>
          <p className="text-xs text-muted-foreground">POS / 餐台 / 菜单 / 订单</p>
        </div>
        {/* 消费点选择 */}
        <select value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm bg-card">
          {outlets.map(o => <option key={o._id} value={o._id}>{o.outletName}</option>)}
        </select>
        <button onClick={() => { loadTables(); loadMenu(); loadOrders() }} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Tab */}
      <div className="px-4 sm:px-6 pt-4">
        <div className="flex bg-card rounded-xl p-1 shadow-sm border border-border w-fit">
          {[
            { key: 'pos' as const, label: 'POS 点餐', icon: ShoppingCart },
            { key: 'tables' as const, label: '餐台管理', icon: LayoutGrid },
            { key: 'menu' as const, label: '菜单管理', icon: UtensilsCrossed },
            { key: 'orders' as const, label: '订单列表', icon: ClipboardList },
            { key: 'reports' as const, label: '日报', icon: BarChart3 },
            { key: 'outlets' as const, label: '消费点', icon: Settings2 },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg font-medium transition-all ${tab === t.key ? 'bg-success/10 text-success shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* ======== POS 点餐 ======== */}
        {tab === 'pos' && (
          <div className="flex gap-5 h-[calc(100vh-200px)]">
            {/* 左：菜单 */}
            <div className="flex-1 flex flex-col bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              {/* 分类栏 */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border overflow-x-auto">
                <button onClick={() => setSelectedCat('')}
                  className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap font-medium transition-all ${!selectedCat ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                  全部
                </button>
                {categories.map(c => (
                  <button key={c._id} onClick={() => setSelectedCat(c._id)}
                    className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap font-medium transition-all ${selectedCat === c._id ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                    {c.categoryName}
                  </button>
                ))}
              </div>
              {/* 搜索 */}
              <div className="px-4 py-2 border-b border-border/50">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="搜索菜品..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              {/* 菜品网格 */}
              <div className="flex-1 overflow-auto p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
                {filteredItems.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-muted-foreground text-sm">暂无菜品</div>
                ) : filteredItems.map(item => (
                  <button key={item._id} onClick={() => addToCart(item)} disabled={item.soldOut}
                    className={`text-left p-3 rounded-xl border transition-all ${item.soldOut ? 'opacity-50 border-border' : 'border-border hover:border-success/30 hover:shadow-md active:scale-95'}`}>
                    <div className="text-sm font-medium text-foreground truncate">{item.itemName}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-sm font-bold text-orange-600">¥{item.price}</span>
                      {item.soldOut && <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded">估清</span>}
                    </div>
                    {item.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1">{item.tags.slice(0, 2).map(t => <span key={t} className="text-[10px] px-1 py-0.5 bg-blue-50 text-blue-600 rounded">{t}</span>)}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 右：购物车 */}
            <div className="w-80 lg:w-96 flex flex-col bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ShoppingCart size={16} /> 当前订单</h3>
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="text-[11px] text-red-400 hover:text-red-600">清空</button>
                )}
              </div>

              {/* 选台/客人 */}
              <div className="px-4 py-3 border-b border-border/50 space-y-2">
                <div className="flex gap-2">
                  <select value={selectedTable?._id || ''} onChange={e => setSelectedTable(tables.find(t => t._id === e.target.value) || null)}
                    className="flex-1 px-2 py-1.5 text-xs border border-border rounded-lg bg-card">
                    <option value="">选择餐台</option>
                    {tables.filter(t => t.status === 'available').map(t => <option key={t._id} value={t._id}>{t.tableNo} ({t.area || '-'})</option>)}
                  </select>
                  <input value={guestCount} onChange={e => setGuestCount(e.target.value)} type="number" min="1" placeholder="人数"
                    className="w-16 px-2 py-1.5 text-xs border border-border rounded-lg" />
                </div>
                <div className="flex gap-2">
                  <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="客人姓名"
                    className="flex-1 px-2 py-1.5 text-xs border border-border rounded-lg" />
                  <input value={cardNo} onChange={e => setCardNo(e.target.value)} placeholder="卡号(挂账)"
                    className="flex-1 px-2 py-1.5 text-xs border border-border rounded-lg" />
                </div>
              </div>

              {/* 购物车列表 */}
              <div className="flex-1 overflow-auto">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <ChefHat size={32} className="mb-2 opacity-50" />
                    <p className="text-sm">点击菜品加入订单</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {cart.map(c => (
                      <div key={c.item._id} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">{c.item.itemName}</div>
                          <div className="text-xs text-muted-foreground">¥{c.item.price}/{c.item.unit}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateCartQty(c.item._id, -1)} className="w-6 h-6 rounded-full bg-secondary text-muted-foreground flex items-center justify-center text-xs hover:bg-secondary">-</button>
                          <span className="text-sm font-medium w-6 text-center">{c.qty}</span>
                          <button onClick={() => updateCartQty(c.item._id, 1)} className="w-6 h-6 rounded-full bg-success/10 text-success flex items-center justify-center text-xs hover:bg-success/20">+</button>
                        </div>
                        <span className="text-sm font-medium text-foreground w-16 text-right">¥{(c.item.price * c.qty).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 合计 & 下单 */}
              <div className="border-t border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">合计 ({cart.reduce((s, c) => s + c.qty, 0)} 道)</span>
                  <span className="text-xl font-bold text-foreground">¥{cartTotal}</span>
                </div>
                <button onClick={handlePlaceOrder} disabled={loading || cart.length === 0}
                  className="w-full py-3 bg-success text-white text-sm rounded-xl hover:bg-success/90 disabled:opacity-50 font-semibold transition-colors">
                  {loading ? '提交中...' : '下单'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======== 餐台管理 ======== */}
        {tab === 'tables' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">餐台总览</h3>
              <button onClick={() => setShowAddTable(true)} className="flex items-center gap-2 px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90"><Plus size={15} /> 新增餐台</button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
              {tables.map(t => {
                const st = TABLE_STATUS[t.status] || TABLE_STATUS.available
                return (
                  <div key={t._id} className="group relative">
                    <div className={`${st.bg} rounded-xl p-3 text-center transition-all hover:shadow-md`}>
                      <div className={`text-sm font-bold ${st.text}`}>{t.tableNo}</div>
                      <div className="text-[10px] text-muted-foreground">{t.area || '-'} · {t.capacity}座</div>
                      <div className={`text-[10px] font-medium ${st.text} mt-0.5`}>{st.label}</div>
                    </div>
                    {t.status !== 'occupied' && (
                      <button onClick={() => { api.tables.remove(t._id).then(() => { toast.success('已删除'); loadTables() }) }}
                        className="absolute -top-1 -right-1 hidden group-hover:flex w-5 h-5 rounded-full bg-red-500 text-white items-center justify-center">
                        <X size={10} />
                      </button>
                    )}
                    {t.status === 'cleaning' && (
                      <button onClick={() => { api.tables.update(t._id, { status: 'available' }).then(() => { toast.success('已清台'); loadTables() }) }}
                        className="absolute -top-1 -left-1 hidden group-hover:flex w-5 h-5 rounded-full bg-success/100 text-white items-center justify-center text-[10px]">
                        ✓
                      </button>
                    )}
                  </div>
                )
              })}
              {tables.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground text-sm">暂无餐台，请先添加</div>}
            </div>
          </>
        )}

        {/* ======== 菜单管理 ======== */}
        {tab === 'menu' && (
          <>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">菜单管理</h3>
              <button onClick={() => setShowAddCategory(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs rounded-lg hover:bg-blue-100"><Plus size={12} /> 分类</button>
              <button onClick={() => { setShowAddItem(true); setFItemCatId(categories[0]?._id || '') }} className="flex items-center gap-1 px-3 py-1.5 bg-success/10 text-success text-xs rounded-lg hover:bg-success/10"><Plus size={12} /> 菜品</button>
            </div>
            {/* 分类列表 */}
            <div className="mb-4 flex gap-2 flex-wrap">
              {categories.map(c => (
                <div key={c._id} className="flex items-center gap-1 px-3 py-1.5 bg-card border border-border rounded-lg text-sm group">
                  <span>{c.categoryName}</span>
                  <button onClick={() => { api.menu.removeCategory(c._id).then(() => { toast.success('已删除'); loadMenu() }) }}
                    className="hidden group-hover:block text-red-400 hover:text-red-600 ml-1"><XCircle size={12} /></button>
                </div>
              ))}
            </div>
            {/* 菜品表格 */}
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
              <div className="divide-y divide-border/50">
                {menuItems.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground text-sm">暂无菜品</div>
                ) : menuItems.map(item => (
                  <div key={item._id} className="px-5 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{item.itemName}</span>
                        {item.soldOut && <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded">估清</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {categories.find(c => c._id === item.categoryId)?.categoryName || '未分类'} · {item.unit}
                        {item.tags?.length > 0 && ` · ${item.tags.join('、')}`}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-orange-600">¥{item.price}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleSoldOut(item)} className={`text-xs px-2 py-1 rounded ${item.soldOut ? 'bg-success/10 text-success' : 'bg-red-50 text-red-500'}`}>
                        {item.soldOut ? '恢复' : '估清'}
                      </button>
                      <button onClick={() => { api.menu.removeItem(item._id).then(() => { toast.success('已删除'); loadMenu() }) }}
                        className="text-xs text-red-400 hover:text-red-600 px-1">删除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ======== 订单列表 ======== */}
        {tab === 'orders' && (
          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">今日订单</h3>
              <button onClick={loadOrders} className="text-xs text-success">刷新</button>
            </div>
            {orders.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">暂无订单</div>
            ) : (
              <div className="divide-y divide-border/50">
                {orders.map(o => (
                  <div key={o._id} className="px-5 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">#{o.orderNo}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${o.status === 'open' ? 'bg-success/10 text-success' : o.status === 'settled' ? 'bg-secondary text-muted-foreground' : 'bg-info/10 text-info border border-info/20'}`}>
                          {o.status === 'open' ? '用餐中' : o.status === 'settled' ? '已结账' : o.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {o.tableNo && `${o.tableNo} · `}{o.guestName || '散客'} · {o.items?.length || 0}道
                        {o.openedAt && ` · ${new Date(o.openedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-foreground">¥{o.totalAmount}</span>
                    {o.status === 'open' && (
                      <button onClick={() => { setSettlingOrder(o); setSettlePayMethod('cash') }}
                        className="text-xs px-3 py-1.5 bg-success text-white rounded-lg hover:bg-success/90">
                        结账
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======== 日报 ======== */}
        {tab === 'reports' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-semibold text-foreground">餐饮日报</h3>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-lg text-sm bg-card" />
              <button onClick={loadReport} className="text-xs text-success hover:text-success">刷新</button>
            </div>
            {reportData ? (
              <div className="space-y-5">
                {/* KPI */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-card rounded-2xl shadow-sm border border-border p-5 text-center">
                    <div className="text-xs text-muted-foreground mb-1">营业额</div>
                    <div className="text-2xl font-bold text-foreground">¥{reportData.totalRevenue}</div>
                  </div>
                  <div className="bg-card rounded-2xl shadow-sm border border-border p-5 text-center">
                    <div className="text-xs text-muted-foreground mb-1">订单数</div>
                    <div className="text-2xl font-bold text-foreground">{reportData.orderCount}</div>
                  </div>
                  <div className="bg-card rounded-2xl shadow-sm border border-border p-5 text-center">
                    <div className="text-xs text-muted-foreground mb-1">平均客单价</div>
                    <div className="text-2xl font-bold text-foreground">¥{reportData.avgPerOrder}</div>
                  </div>
                </div>

                <div className="grid gap-5 grid-cols-1 xl:grid-cols-2">
                  {/* 消费点分布 */}
                  <div className="bg-card rounded-2xl shadow-sm border border-border p-5">
                    <h4 className="text-sm font-semibold text-foreground mb-3">消费点分布</h4>
                    {Object.keys(reportData.byOutlet || {}).length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">暂无数据</div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(reportData.byOutlet as Record<string, { count: number; revenue: number }>).map(([name, data]) => (
                          <div key={name} className="flex items-center justify-between">
                            <span className="text-sm text-foreground">{name}</span>
                            <div className="text-sm">
                              <span className="font-medium text-foreground">¥{Math.round(data.revenue)}</span>
                              <span className="text-muted-foreground ml-2">{data.count}单</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 菜品销量 Top */}
                  <div className="bg-card rounded-2xl shadow-sm border border-border p-5">
                    <h4 className="text-sm font-semibold text-foreground mb-3">菜品销量排行</h4>
                    {(reportData.topItems || []).length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">暂无数据</div>
                    ) : (
                      <div className="space-y-2">
                        {(reportData.topItems as { name: string; quantity: number; revenue: number }[]).slice(0, 10).map((item, i) => (
                          <div key={item.name} className="flex items-center gap-3">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i < 3 ? 'bg-orange-100 text-orange-700' : 'bg-secondary text-muted-foreground'}`}>{i + 1}</span>
                            <span className="text-sm text-foreground flex-1 truncate">{item.name}</span>
                            <span className="text-xs text-muted-foreground">{item.quantity}份</span>
                            <span className="text-sm font-medium text-foreground">¥{Math.round(item.revenue)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
            )}
          </>
        )}

        {/* ======== 消费点管理 ======== */}
        {tab === 'outlets' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">消费点设置</h3>
              <button onClick={() => setShowAddOutlet(true)} className="flex items-center gap-2 px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90"><Plus size={15} /> 新增</button>
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {outlets.map(o => (
                <div key={o._id} className="bg-card rounded-2xl shadow-sm border border-border p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-foreground">{o.outletName}</h4>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${o.status === 'active' ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground'}`}>
                      {o.status === 'active' ? '营业中' : '关闭'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{o.outletCode} · {o.outletType === 'restaurant' ? '餐厅' : o.outletType === 'bar' ? '吧台' : '中途站'}</div>
                  <button onClick={() => { api.diningOutlets.remove(o._id).then(() => { toast.success('已删除'); loadOutlets() }) }}
                    className="mt-3 text-xs text-red-400 hover:text-red-600">删除</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ======== 结账弹窗 ======== */}
      {settlingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">结账 #{settlingOrder.orderNo}</h2>
              <button onClick={() => setSettlingOrder(null)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-secondary/50 rounded-xl p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">应收金额</div>
                <div className="text-2xl font-bold text-foreground">¥{settlingOrder.totalAmount}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">结账方式</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAY_OPTIONS.map(p => (
                    <button key={p.value} onClick={() => setSettlePayMethod(p.value)}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        settlePayMethod === p.value ? 'border-success bg-success/10 text-success' : 'border-border text-muted-foreground'
                      }`}>
                      <p.icon size={16} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {settlePayMethod === 'folio' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Folio 账单号 / 卡号</label>
                  <input value={settleFolioId} onChange={e => setSettleFolioId(e.target.value)} placeholder="输入 Folio ID 或卡号查找"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setSettlingOrder(null)} className="flex-1 px-4 py-2 border border-border text-muted-foreground text-sm rounded-lg hover:bg-secondary/50">取消</button>
              <button onClick={handleSettle} className="flex-1 px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 font-semibold">确认结账</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== 各种新增弹窗 ======== */}
      {showAddOutlet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border"><h2 className="font-semibold text-foreground">新增消费点</h2><button onClick={() => setShowAddOutlet(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X size={18} /></button></div>
            <div className="px-6 py-5 space-y-4">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">名称</label><input value={fOutletName} onChange={e => setFOutletName(e.target.value)} placeholder="如：会所中餐厅" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">类型</label><select value={fOutletType} onChange={e => setFOutletType(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card"><option value="restaurant">餐厅</option><option value="bar">吧台</option><option value="halfway">中途站</option></select></div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border"><button onClick={() => setShowAddOutlet(false)} className="flex-1 px-4 py-2 border border-border text-muted-foreground text-sm rounded-lg hover:bg-secondary/50">取消</button><button onClick={handleAddOutlet} className="flex-1 px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 font-medium">确认</button></div>
          </div>
        </div>
      )}

      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border"><h2 className="font-semibold text-foreground">新增分类</h2><button onClick={() => setShowAddCategory(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X size={18} /></button></div>
            <div className="px-6 py-5"><div><label className="block text-xs font-medium text-muted-foreground mb-1">分类名称</label><input value={fCatName} onChange={e => setFCatName(e.target.value)} placeholder="如：热菜" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
            <div className="flex gap-3 px-6 py-4 border-t border-border"><button onClick={() => setShowAddCategory(false)} className="flex-1 px-4 py-2 border border-border text-muted-foreground text-sm rounded-lg hover:bg-secondary/50">取消</button><button onClick={handleAddCategory} className="flex-1 px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 font-medium">确认</button></div>
          </div>
        </div>
      )}

      {showAddItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border"><h2 className="font-semibold text-foreground">新增菜品</h2><button onClick={() => setShowAddItem(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X size={18} /></button></div>
            <div className="px-6 py-5 space-y-4">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">菜品名称</label><input value={fItemName} onChange={e => setFItemName(e.target.value)} placeholder="如：清蒸鲈鱼" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">价格</label><input type="number" value={fItemPrice} onChange={e => setFItemPrice(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">单位</label><input value={fItemUnit} onChange={e => setFItemUnit(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              </div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">所属分类</label><select value={fItemCatId} onChange={e => setFItemCatId(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card"><option value="">不分类</option>{categories.map(c => <option key={c._id} value={c._id}>{c.categoryName}</option>)}</select></div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border"><button onClick={() => setShowAddItem(false)} className="flex-1 px-4 py-2 border border-border text-muted-foreground text-sm rounded-lg hover:bg-secondary/50">取消</button><button onClick={handleAddItem} className="flex-1 px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 font-medium">确认</button></div>
          </div>
        </div>
      )}

      {showAddTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border"><h2 className="font-semibold text-foreground">新增餐台</h2><button onClick={() => setShowAddTable(false)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><X size={18} /></button></div>
            <div className="px-6 py-5 space-y-4">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">台号</label><input value={fTableNo} onChange={e => setFTableNo(e.target.value)} placeholder="如：A01" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">区域</label><input value={fTableArea} onChange={e => setFTableArea(e.target.value)} placeholder="如：大厅" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">座位数</label><input type="number" value={fTableCap} onChange={e => setFTableCap(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border"><button onClick={() => setShowAddTable(false)} className="flex-1 px-4 py-2 border border-border text-muted-foreground text-sm rounded-lg hover:bg-secondary/50">取消</button><button onClick={handleAddTable} className="flex-1 px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 font-medium">确认</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
