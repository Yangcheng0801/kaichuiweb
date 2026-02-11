import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Car, BarChart2, Wrench, History, Plus, Pencil, Trash2, X, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/utils/api'

type TabKey = 'overview' | 'carts' | 'maintenance' | 'usage'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: '数据总览', icon: <BarChart2 size={16} /> },
  { key: 'carts', label: '球车管理', icon: <Car size={16} /> },
  { key: 'maintenance', label: '维修管理', icon: <Wrench size={16} /> },
  { key: 'usage', label: '使用记录', icon: <History size={16} /> },
]

const STATUS_LIST = [
  { value: 'all', label: '全部' },
  { value: 'notCheckedOut', label: '未出库' },
  { value: 'checkedOut', label: '已出库' },
  { value: 'inUse', label: '使用中' },
  { value: 'notCheckedIn', label: '未入库' },
  { value: 'maintenance', label: '维修中' },
  { value: 'disabled', label: '停用' },
]

const getStatusLabel = (v: string) => STATUS_LIST.find(s => s.value === v)?.label || v

function formatDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default function CartManagement() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  // 数据总览
  const [stats, setStats] = useState<Record<string, number | string>>({})
  const [statsLoading, setStatsLoading] = useState(false)

  // 球车管理
  const [cartList, setCartList] = useState<any[]>([])
  const [cartPage, setCartPage] = useState(1)
  const [cartTotal, setCartTotal] = useState(0)
  const [cartFilters, setCartFilters] = useState({ brand: 'all', status: 'all', searchText: '' })
  const [brandList, setBrandList] = useState<string[]>(['全部'])
  const [cartLoading, setCartLoading] = useState(false)
  const [selectedCarts, setSelectedCarts] = useState<string[]>([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [editCart, setEditCart] = useState<any>(null)
  const [form, setForm] = useState({ brand: '', cartNumber: '' })
  const [createMode, setCreateMode] = useState<'single' | 'bulk'>('single')
  const [bulkNumbers, setBulkNumbers] = useState<string[]>([])
  const [bulkRule, setBulkRule] = useState({ prefix: '', suffix: '', start: '', end: '', pad: '' })

  // 维修管理
  const [maintenanceList, setMaintenanceList] = useState<any[]>([])
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)
  const [faultAnalysis, setFaultAnalysis] = useState<{ name: string; count: number; percent: number }[]>([])

  // 使用记录
  const [usageList, setUsageList] = useState<any[]>([])
  const [usagePage, setUsagePage] = useState(1)
  const [usageTotal, setUsageTotal] = useState(0)
  const [usageFilters, setUsageFilters] = useState({ date: formatDate(new Date()), brand: 'all' })
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageDetail, setUsageDetail] = useState<any>(null)

  const loadStats = () => {
    setStatsLoading(true)
    api.cartManagement.getStatistics().then((res: any) => {
      setStats(res.data || {})
    }).catch(() => {}).finally(() => setStatsLoading(false))
  }

  const loadBrands = () => {
    api.cartManagement.getBrands().then((res: any) => {
      setBrandList(['全部', ...(res.data || [])])
    }).catch(() => {})
  }

  const loadCartList = (append = false) => {
    setCartLoading(true)
    api.cartManagement.getList({
      page: cartPage,
      limit: 20,
      brand: cartFilters.brand,
      status: cartFilters.status,
      searchText: cartFilters.searchText,
    }).then((res: any) => {
      const list = append ? [...cartList, ...(res.data || [])] : (res.data || [])
      setCartList(list)
      setCartTotal(res.total || 0)
    }).catch(() => {}).finally(() => setCartLoading(false))
  }

  const loadMaintenance = () => {
    setMaintenanceLoading(true)
    api.maintenance.getList({ date: usageFilters.date }).then((res: any) => {
      setMaintenanceList(res.data || [])
    }).catch(() => {}).finally(() => setMaintenanceLoading(false))
    api.maintenance.getFaultAnalysis({ date: usageFilters.date }).then((res: any) => {
      setFaultAnalysis(res.data || [])
    }).catch(() => {})
  }

  const loadUsage = (append = false) => {
    setUsageLoading(true)
    api.cartManagement.getUsageList({
      page: usagePage,
      limit: 20,
      date: usageFilters.date,
      brand: usageFilters.brand,
    }).then((res: any) => {
      const list = append ? [...usageList, ...(res.data || [])] : (res.data || [])
      setUsageList(list)
      setUsageTotal(res.total || 0)
    }).catch(() => {}).finally(() => setUsageLoading(false))
  }

  useEffect(() => { loadStats(); loadBrands() }, [])
  useEffect(() => {
    if (activeTab === 'overview') loadStats()
    if (activeTab === 'carts') loadCartList()
    if (activeTab === 'maintenance') loadMaintenance()
    if (activeTab === 'usage') loadUsage()
  }, [activeTab, usageFilters.date])

  useEffect(() => {
    if (activeTab === 'carts') loadCartList()
  }, [cartPage, cartFilters.brand, cartFilters.status, cartFilters.searchText])

  useEffect(() => {
    if (activeTab === 'usage') loadUsage()
  }, [usageFilters.date, usageFilters.brand])

  const handleBatchStatus = (status: string) => {
    if (selectedCarts.length === 0) { toast.error('请先选择球车'); return }
    api.cartManagement.batchUpdateStatus({ cartIds: selectedCarts, status }).then(() => {
      toast.success('更新成功')
      setSelectedCarts([])
      loadCartList()
      loadStats()
    })
  }

  const handleBatchDelete = () => {
    if (selectedCarts.length === 0) { toast.error('请先选择球车'); return }
    api.cartManagement.delete({ cartIds: selectedCarts }).then(() => {
      toast.success('已删除')
      setSelectedCarts([])
      loadCartList()
      loadStats()
    })
  }

  const handleCompleteMaintenance = (id: string) => {
    api.maintenance.complete(id).then(() => {
      toast.success('维修已完成')
      loadMaintenance()
      loadStats()
    })
  }

  const generateBulkNumbers = () => {
    const start = parseInt(bulkRule.start, 10)
    const end = parseInt(bulkRule.end, 10)
    const pad = parseInt(bulkRule.pad, 10) || 0
    if (!start || !end) { toast.error('请输入起止数字'); return }
    const a = Math.min(start, end)
    const b = Math.max(start, end)
    const w = pad > 0 ? pad : Math.max(String(a).length, String(b).length)
    const nums: string[] = []
    for (let n = a; n <= b; n++) {
      const s = w > 0 ? String(n).padStart(w, '0') : String(n)
      nums.push(`${bulkRule.prefix}${s}${bulkRule.suffix}`)
    }
    setBulkNumbers([...new Set(nums)])
  }

  const handleSubmitCreate = () => {
    if (createMode === 'single') {
      if (!form.brand || !form.cartNumber) { toast.error('请填写品牌和车号'); return }
      api.cartManagement.create({ brand: form.brand, cartNumber: form.cartNumber.trim() }).then(() => {
        toast.success('创建成功')
        setShowEditModal(false)
        setForm({ brand: '', cartNumber: '' })
        loadCartList()
        loadStats()
      })
    } else {
      if (!form.brand || bulkNumbers.length === 0) { toast.error('请选择品牌并生成车号'); return }
      api.cartManagement.batchCreate({ brand: form.brand, numbers: bulkNumbers }).then((res: any) => {
        toast.success(`成功 ${res.successCount || 0} 条`)
        setShowEditModal(false)
        setBulkNumbers([])
        loadCartList()
        loadStats()
      })
    }
  }

  const handleEditCart = (cart: any) => {
    setEditCart(cart)
    setForm({ brand: cart.brand || '', cartNumber: cart.cartNumber || '' })
    setShowEditModal(true)
  }

  const handleSaveEdit = () => {
    if (!editCart?._id) return
    api.cartManagement.update(editCart._id, form).then(() => {
      toast.success('已保存')
      setShowEditModal(false)
      setEditCart(null)
      loadCartList()
    })
  }

  const handleDeleteCart = (id: string) => {
    api.cartManagement.delete({ cartId: id }).then(() => {
      toast.success('已删除')
      loadCartList()
      loadStats()
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedCarts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (selectedCarts.length === cartList.length) setSelectedCarts([])
    else setSelectedCarts(cartList.map(c => c._id))
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 h-[60px] flex items-center gap-4 shadow-sm flex-shrink-0">
        <button onClick={() => navigate('/home')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft size={16} /> 返回
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <h1 className="text-base font-semibold text-gray-900">球车管理</h1>
      </header>

      <div className="flex-1 flex flex-col px-6 py-6 gap-4">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 overflow-auto">
          {/* 数据总览 */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {statsLoading ? (
                <div className="text-center py-12 text-gray-400">加载中...</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { key: 'totalCarts', label: '球车总数' },
                    { key: 'availableCarts', label: '可用' },
                    { key: 'notCheckedOut', label: '未出库' },
                    { key: 'checkedOut', label: '已出库' },
                    { key: 'inUseCarts', label: '使用中' },
                    { key: 'notCheckedIn', label: '未入库' },
                    { key: 'maintenanceCarts', label: '维修中' },
                    { key: 'disabledCarts', label: '停用' },
                    { key: 'avgUseTime', label: '平均使用时长' },
                  ].map(({ key, label }) => (
                    <div key={key} className="rounded-xl border border-gray-100 p-4 bg-gray-50/50">
                      <div className="text-2xl font-bold text-gray-900">{stats[key] ?? '--'}</div>
                      <div className="text-xs text-gray-500 mt-1">{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 球车管理 */}
          {activeTab === 'carts' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => { setEditCart(null); setForm({ brand: '', cartNumber: '' }); setShowEditModal(true) }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
                  <Plus size={16} /> 新增球车
                </button>
                <select value={cartFilters.brand} onChange={e => setCartFilters(f => ({ ...f, brand: e.target.value }))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {brandList.map(b => <option key={b} value={b === '全部' ? 'all' : b}>{b}</option>)}
                </select>
                <select value={cartFilters.status} onChange={e => setCartFilters(f => ({ ...f, status: e.target.value }))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {STATUS_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <input placeholder="搜索车号/品牌" value={cartFilters.searchText}
                  onChange={e => setCartFilters(f => ({ ...f, searchText: e.target.value }))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-40"
                  onKeyDown={e => e.key === 'Enter' && loadCartList()}
                />
                {selectedCarts.length > 0 && (
                  <>
                    <button onClick={() => handleBatchStatus('notCheckedOut')} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">标记可用</button>
                    <button onClick={() => handleBatchStatus('maintenance')} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">标记维修</button>
                    <button onClick={() => handleBatchStatus('disabled')} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">标记停用</button>
                    <button onClick={handleBatchDelete} className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm">批量删除</button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={toggleSelectAll} className="text-sm text-gray-500">
                  {selectedCarts.length === cartList.length ? '取消全选' : '全选'}
                </button>
                <span className="text-sm text-gray-400">已选 {selectedCarts.length} 辆</span>
              </div>
              {cartLoading ? (
                <div className="text-center py-12 text-gray-400">加载中...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cartList.map(item => (
                    <div key={item._id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={selectedCarts.includes(item._id)} onChange={() => toggleSelect(item._id)} />
                        <div>
                          <div className="font-medium text-gray-900">{item.cartNumber}</div>
                          <div className="text-xs text-gray-500">{item.brand}</div>
                          <span className={`text-xs px-2 py-0.5 rounded ${item.status === 'maintenance' ? 'bg-yellow-100 text-yellow-700' : item.status === 'disabled' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditCart(item)} className="p-1.5 text-gray-400 hover:text-emerald-600"><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteCart(item._id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {cartList.length === 0 && !cartLoading && <div className="text-center py-12 text-gray-400">暂无球车</div>}
            </div>
          )}

          {/* 维修管理 */}
          {activeTab === 'maintenance' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">日期</span>
                <input type="date" value={usageFilters.date} onChange={e => setUsageFilters(f => ({ ...f, date: e.target.value }))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-3">维修记录</h3>
                {maintenanceLoading ? <div className="text-center py-8 text-gray-400">加载中...</div> : (
                  <div className="space-y-2">
                    {maintenanceList.map(m => (
                      <div key={m._id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100">
                        <div>
                          <div className="font-medium">球车 {m.cartNumber} - {m.faultType}</div>
                          <div className="text-xs text-gray-500">{m.reportTime}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${m.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {m.status === 'completed' ? '已完成' : '维修中'}
                          </span>
                          {m.status !== 'completed' && (
                            <button onClick={() => handleCompleteMaintenance(m._id)} className="px-3 py-1 bg-emerald-600 text-white text-xs rounded">完成维修</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-3">故障类型分析</h3>
                <div className="space-y-2">
                  {faultAnalysis.map((f, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-24 text-sm text-gray-600">{f.name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${f.percent}%` }} />
                      </div>
                      <span className="text-sm font-medium">{f.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 使用记录 */}
          {activeTab === 'usage' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <input type="date" value={usageFilters.date} onChange={e => setUsageFilters(f => ({ ...f, date: e.target.value }))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <select value={usageFilters.brand} onChange={e => setUsageFilters(f => ({ ...f, brand: e.target.value }))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  {brandList.map(b => <option key={b} value={b === '全部' ? 'all' : b}>{b}</option>)}
                </select>
              </div>
              {usageLoading ? <div className="text-center py-12 text-gray-400">加载中...</div> : (
                <div className="space-y-2">
                  {usageList.map(u => (
                    <div key={u._id} onClick={() => api.cartManagement.getUsageDetail(u._id).then((r: any) => setUsageDetail(r.data))}
                      className="p-4 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50">
                      <div className="flex justify-between">
                        <span className="font-medium">{u.cartNumber}</span>
                        <span className="text-xs text-gray-500">{u.brand}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">出库 {u.checkoutTime ? new Date(u.checkoutTime).toLocaleString() : '--'}</div>
                      <div className="text-xs text-gray-500">负责人 {u.checkoutByDisplay || u.checkoutBy || '--'}</div>
                    </div>
                  ))}
                </div>
              )}
              {usageList.length === 0 && !usageLoading && <div className="text-center py-12 text-gray-400">暂无使用记录</div>}
            </div>
          )}
        </div>
      </div>

      {/* 新增/编辑弹窗 */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">{editCart ? '编辑球车' : '新增球车'}</h2>
              <button onClick={() => setShowEditModal(false)}><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {!editCart && (
                <div className="flex gap-2">
                  <button onClick={() => setCreateMode('single')} className={`flex-1 py-2 rounded-lg text-sm ${createMode === 'single' ? 'bg-emerald-600 text-white' : 'bg-gray-100'}`}>单个</button>
                  <button onClick={() => setCreateMode('bulk')} className={`flex-1 py-2 rounded-lg text-sm ${createMode === 'bulk' ? 'bg-emerald-600 text-white' : 'bg-gray-100'}`}>批量</button>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">品牌</label>
                <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg" placeholder="选择或输入品牌" list="brands" />
                <datalist id="brands">{brandList.filter(b => b !== '全部').map(b => <option key={b} value={b} />)}</datalist>
              </div>
              {createMode === 'single' || editCart ? (
                <div>
                  <label className="block text-sm font-medium mb-1">车号</label>
                  <input value={form.cartNumber} onChange={e => setForm(f => ({ ...f, cartNumber: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg" placeholder="如 001" disabled={!!editCart} />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="前缀" value={bulkRule.prefix} onChange={e => setBulkRule(r => ({ ...r, prefix: e.target.value }))} className="px-3 py-2 border rounded-lg" />
                    <input placeholder="后缀" value={bulkRule.suffix} onChange={e => setBulkRule(r => ({ ...r, suffix: e.target.value }))} className="px-3 py-2 border rounded-lg" />
                    <input type="number" placeholder="起" value={bulkRule.start} onChange={e => setBulkRule(r => ({ ...r, start: e.target.value }))} className="px-3 py-2 border rounded-lg" />
                    <input type="number" placeholder="止" value={bulkRule.end} onChange={e => setBulkRule(r => ({ ...r, end: e.target.value }))} className="px-3 py-2 border rounded-lg" />
                    <input type="number" placeholder="补齐位数" value={bulkRule.pad} onChange={e => setBulkRule(r => ({ ...r, pad: e.target.value }))} className="px-3 py-2 border rounded-lg" />
                  </div>
                  <button onClick={generateBulkNumbers} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">生成预览</button>
                  <div className="text-xs text-gray-500">预览 ({bulkNumbers.length}) 条</div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded-lg">取消</button>
              <button onClick={editCart ? handleSaveEdit : handleSubmitCreate} className="px-4 py-2 bg-emerald-600 text-white rounded-lg">
                {editCart ? '保存' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 使用记录详情 */}
      {usageDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">球车 {usageDetail.cartNumber} - 使用详情</h2>
              <button onClick={() => setUsageDetail(null)}><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>出库: {usageDetail.checkoutTime ? new Date(usageDetail.checkoutTime).toLocaleString() : '--'} ({usageDetail.checkoutByDisplay || usageDetail.checkoutBy || ''})</div>
              {(usageDetail.laps || []).map((lap: any, i: number) => (
                <div key={i} className="pl-4 border-l-2 border-gray-200">
                  <div>下场: {lap.departTime ? new Date(lap.departTime).toLocaleString() : '--'} ({lap.departByDisplay || lap.departBy || ''})</div>
                  <div>回场: {lap.returnTime ? new Date(lap.returnTime).toLocaleString() : '--'} ({lap.returnByDisplay || lap.returnBy || ''})</div>
                </div>
              ))}
              <div>入库: {usageDetail.checkinTime ? new Date(usageDetail.checkinTime).toLocaleString() : '--'} ({usageDetail.checkinByDisplay || usageDetail.checkinBy || ''})</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
