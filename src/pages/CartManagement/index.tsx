import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Car, BarChart2, Wrench, History, Plus, Pencil, Trash2, X,
  ChevronLeft, ChevronRight, Search, RefreshCw, CheckSquare, Square,
  AlertTriangle, CheckCircle2, Clock, Ban, ArrowUpDown
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/utils/api'

// ─── 类型 ────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'carts' | 'maintenance' | 'usage'

interface Cart {
  _id: string
  cartNumber: string
  brand: string
  status: string
  remark?: string
  createdAt?: string
  updatedAt?: string
}

interface MaintenanceRecord {
  _id: string
  cartNumber: string
  cartBrand?: string
  faultType: string
  faultDescription?: string
  reportTime: string
  reportPerson?: string
  status: 'ongoing' | 'completed'
  completedTime?: string
  totalCost?: number
  duration?: string
}

interface UsageRecord {
  _id: string
  cartNumber: string
  brand: string
  checkoutTime?: string
  checkinTime?: string
  checkoutByDisplay?: string
  laps?: { departTime?: string; returnTime?: string; departByDisplay?: string; returnByDisplay?: string }[]
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string; rowBg: string }> = {
  notCheckedOut: { label: '未出库', color: 'text-emerald-700', bg: 'bg-emerald-50',  dot: 'bg-emerald-500', rowBg: '' },
  available:     { label: '未出库', color: 'text-emerald-700', bg: 'bg-emerald-50',  dot: 'bg-emerald-500', rowBg: '' },
  checkedOut:    { label: '已出库', color: 'text-blue-700',    bg: 'bg-blue-50',     dot: 'bg-blue-500',    rowBg: 'bg-blue-50/30' },
  inUse:         { label: '使用中', color: 'text-violet-700',  bg: 'bg-violet-50',   dot: 'bg-violet-500',  rowBg: 'bg-violet-50/30' },
  notCheckedIn:  { label: '未入库', color: 'text-orange-700',  bg: 'bg-orange-50',   dot: 'bg-orange-500',  rowBg: 'bg-orange-50/30' },
  maintenance:   { label: '维修中', color: 'text-yellow-700',  bg: 'bg-yellow-50',   dot: 'bg-yellow-500',  rowBg: 'bg-yellow-50/40' },
  disabled:      { label: '已停用', color: 'text-gray-500',    bg: 'bg-gray-100',    dot: 'bg-gray-400',    rowBg: 'bg-gray-50/60' },
}

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview',    label: '数据总览', icon: <BarChart2 size={15} /> },
  { key: 'carts',       label: '球车管理', icon: <Car size={15} /> },
  { key: 'maintenance', label: '维修管理', icon: <Wrench size={15} /> },
  { key: 'usage',       label: '使用记录', icon: <History size={15} /> },
]

const STATUS_SIDEBAR = [
  { value: 'all',           label: '全部',   statKey: 'totalCarts' },
  { value: 'notCheckedOut', label: '未出库', statKey: 'notCheckedOut' },
  { value: 'checkedOut',    label: '已出库', statKey: 'checkedOut' },
  { value: 'inUse',         label: '使用中', statKey: 'inUseCarts' },
  { value: 'notCheckedIn',  label: '未入库', statKey: 'notCheckedIn' },
  { value: 'maintenance',   label: '维修中', statKey: 'maintenanceCarts' },
  { value: 'disabled',      label: '已停用', statKey: 'disabledCarts' },
]

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// 兼容 TCB 各种时间格式：string / number(ms) / { $date: ms } / { toDate() } / Date
function toDate(v: any): Date | null {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === 'number') return new Date(v < 1e11 ? v * 1000 : v)
  if (typeof v === 'object') {
    if (typeof v.toDate === 'function') { try { return v.toDate() } catch { return null } }
    if (typeof v.$date === 'number') return new Date(v.$date)
    if (typeof v.$date === 'string') return new Date(v.$date)
  }
  if (typeof v === 'string') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}
function formatTime(v?: any) {
  const d = toDate(v)
  if (!d) return '--'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function formatDateTime(v?: any) {
  const d = toDate(v)
  if (!d) return '--'
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── 通用组件 ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'text-gray-500', bg: 'bg-gray-100', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── 数据总览 Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  stats, loading, date, onDateChange, onStatClick
}: {
  stats: Record<string, number | string>
  loading: boolean
  date: string
  onDateChange: (d: string) => void
  onStatClick: (status: string) => void
}) {
  const kpiCards = [
    { key: 'totalCarts',       label: '球车总数',    icon: <Car size={18} />,           color: 'text-gray-700',    bg: 'bg-white',        status: 'all' },
    { key: 'notCheckedOut',    label: '未出库',      icon: <CheckCircle2 size={18} />,  color: 'text-emerald-700', bg: 'bg-emerald-50',   status: 'notCheckedOut' },
    { key: 'checkedOut',       label: '已出库',      icon: <CheckCircle2 size={18} />,  color: 'text-blue-700',    bg: 'bg-blue-50',      status: 'checkedOut' },
    { key: 'inUseCarts',       label: '使用中',      icon: <Clock size={18} />,         color: 'text-violet-700',  bg: 'bg-violet-50',    status: 'inUse' },
    { key: 'notCheckedIn',     label: '未入库',      icon: <AlertTriangle size={18} />, color: 'text-orange-700',  bg: 'bg-orange-50',    status: 'notCheckedIn' },
    { key: 'maintenanceCarts', label: '维修中',      icon: <Wrench size={18} />,        color: 'text-yellow-700',  bg: 'bg-yellow-50',    status: 'maintenance' },
    { key: 'disabledCarts',    label: '已停用',      icon: <Ban size={18} />,           color: 'text-gray-500',    bg: 'bg-gray-100',     status: 'disabled' },
    { key: 'avgUseTime',       label: '平均使用时长', icon: <Clock size={18} />,        color: 'text-indigo-700',  bg: 'bg-indigo-50',    status: null },
  ]

  const total = Number(stats.totalCarts) || 0
  const barData = [
    { label: '未出库', value: Number(stats.notCheckedOut) || 0,    color: 'bg-emerald-400' },
    { label: '已出库', value: Number(stats.checkedOut) || 0,       color: 'bg-blue-400' },
    { label: '使用中', value: Number(stats.inUseCarts) || 0,       color: 'bg-violet-400' },
    { label: '未入库', value: Number(stats.notCheckedIn) || 0,     color: 'bg-orange-400' },
    { label: '维修中', value: Number(stats.maintenanceCarts) || 0, color: 'bg-yellow-400' },
    { label: '已停用', value: Number(stats.disabledCarts) || 0,    color: 'bg-gray-300' },
  ]

  const activeCount = (Number(stats.checkedOut) || 0) + (Number(stats.inUseCarts) || 0) + (Number(stats.notCheckedIn) || 0)
  const utilRate = total > 0 ? Math.round((activeCount / total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">运营数据概览</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">日期</label>
          <input type="date" value={date} onChange={e => onDateChange(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <RefreshCw size={20} className="animate-spin mr-2" /> 加载中...
        </div>
      ) : (
        <>
          {/* KPI 卡片行 */}
          <div className="grid grid-cols-4 xl:grid-cols-8 gap-3">
            {kpiCards.map(card => (
              <div key={card.key}
                onClick={() => card.status && onStatClick(card.status)}
                className={`rounded-xl border border-gray-100 p-4 ${card.bg} ${card.status ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''}`}>
                <div className={`${card.color} mb-2`}>{card.icon}</div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">{stats[card.key] ?? '--'}</div>
                <div className="text-xs text-gray-500 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {/* 状态分布 + 利用率 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">今日车辆状态分布</h3>
                <span className="text-xs text-gray-400">共 {total} 辆</span>
              </div>
              <div className="flex h-8 rounded-lg overflow-hidden mb-4 bg-gray-100">
                {barData.map((b, i) => {
                  const pct = total > 0 ? (b.value / total) * 100 : 0
                  if (pct === 0) return null
                  return (
                    <div key={i} className={`${b.color} flex items-center justify-center text-xs text-white font-medium transition-all`}
                      style={{ width: `${pct}%` }} title={`${b.label}: ${b.value}辆`}>
                      {pct > 8 ? b.value : ''}
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {barData.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-sm ${b.color} flex-shrink-0`} />
                    <span className="text-xs text-gray-600">{b.label}</span>
                    <span className="text-xs font-semibold text-gray-800 ml-auto">{b.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 圆形利用率 */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col items-center justify-center">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 self-start">今日利用率</h3>
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#f3f4f6" strokeWidth="12" />
                  <circle cx="60" cy="60" r="50" fill="none"
                    stroke={utilRate >= 70 ? '#10b981' : utilRate >= 40 ? '#8b5cf6' : '#f59e0b'}
                    strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - utilRate / 100)}`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">{utilRate}%</span>
                  <span className="text-xs text-gray-400">出勤率</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">{activeCount} 辆在外 / {total} 辆总数</p>
            </div>
          </div>

          {/* 操作指引 */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">操作指引</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '点击卡片', desc: '跳转到对应状态的球车列表' },
                { label: '球车管理', desc: '新增、编辑、批量状态操作' },
                { label: '维修管理', desc: '看板式跟踪维修进度与成本' },
                { label: '使用记录', desc: '时间轴甘特图查看出入库流水' },
              ].map((tip, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs font-semibold text-emerald-700 mb-1">{tip.label}</div>
                  <div className="text-xs text-gray-500">{tip.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── 球车管理 Tab（表格 + 右侧详情面板）──────────────────────────────────────

function CartsTab({
  statusFilter, brandList, stats, onRefreshStats
}: {
  statusFilter: string
  brandList: string[]
  stats: Record<string, number | string>
  onRefreshStats: () => void
}) {
  const [list, setList]             = useState<Cart[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(false)
  const [brandFilter, setBrandFilter] = useState('all')
  const [search, setSearch]         = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selected, setSelected]     = useState<string[]>([])
  const [detail, setDetail]         = useState<Cart | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [editCart, setEditCart]     = useState<Cart | null>(null)
  const [form, setForm]             = useState({ brand: '', cartNumber: '', remark: '' })
  const [createMode, setCreateMode] = useState<'single' | 'bulk'>('single')
  const [bulkRule, setBulkRule]     = useState({ prefix: '', suffix: '', start: '', end: '', pad: '' })
  const [bulkNumbers, setBulkNumbers] = useState<string[]>([])
  const [sortField, setSortField]   = useState<'cartNumber' | 'brand' | 'status'>('cartNumber')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc')
  const PAGE_SIZE = 20

  const load = useCallback(() => {
    setLoading(true)
    api.cartManagement.getList({ page, limit: PAGE_SIZE, brand: brandFilter, status: statusFilter, searchText: search })
      .then((res: any) => { setList(res.data || []); setTotal(res.total || 0) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [page, brandFilter, statusFilter, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [brandFilter, statusFilter, search])
  useEffect(() => {
    if (detail) {
      const fresh = list.find(c => c._id === detail._id)
      if (fresh) setDetail(fresh)
    }
  }, [list])

  const sortedList = [...list].sort((a, b) => {
    const av = a[sortField] || '', bv = b[sortField] || ''
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleAll = () =>
    setSelected(selected.length === list.length ? [] : list.map(c => c._id))

  const handleBatchStatus = (status: string) => {
    if (!selected.length) return
    api.cartManagement.batchUpdateStatus({ cartIds: selected, status }).then(() => {
      toast.success(`已更新 ${selected.length} 辆`)
      setSelected([]); load(); onRefreshStats()
    })
  }
  const handleDelete = (ids: string[]) => {
    api.cartManagement.delete({ cartIds: ids }).then(() => {
      toast.success('已删除')
      setSelected([])
      if (detail && ids.includes(detail._id)) setDetail(null)
      load(); onRefreshStats()
    })
  }
  const handleSubmit = () => {
    if (createMode === 'single') {
      if (!form.brand || !form.cartNumber) { toast.error('请填写品牌和车号'); return }
      api.cartManagement.create({ brand: form.brand, cartNumber: form.cartNumber.trim() }).then(() => {
        toast.success('创建成功'); setShowModal(false); setForm({ brand: '', cartNumber: '', remark: '' }); load(); onRefreshStats()
      })
    } else {
      if (!form.brand || !bulkNumbers.length) { toast.error('请选择品牌并生成车号'); return }
      api.cartManagement.batchCreate({ brand: form.brand, numbers: bulkNumbers }).then((r: any) => {
        toast.success(`成功 ${r.successCount || 0} 条`); setShowModal(false); setBulkNumbers([]); load(); onRefreshStats()
      })
    }
  }
  const handleSaveEdit = () => {
    if (!editCart) return
    api.cartManagement.update(editCart._id, { brand: form.brand, remark: form.remark }).then(() => {
      toast.success('已保存'); setShowModal(false); setEditCart(null); load()
    })
  }
  const openEdit = (cart: Cart) => {
    setEditCart(cart); setForm({ brand: cart.brand, cartNumber: cart.cartNumber, remark: cart.remark || '' }); setShowModal(true)
  }
  const openCreate = () => {
    setEditCart(null); setForm({ brand: '', cartNumber: '', remark: '' }); setCreateMode('single'); setBulkNumbers([]); setShowModal(true)
  }
  const generateBulk = () => {
    const s = parseInt(bulkRule.start, 10), e = parseInt(bulkRule.end, 10)
    if (!s || !e) { toast.error('请输入起止数字'); return }
    const a = Math.min(s, e), b = Math.max(s, e)
    const pad = parseInt(bulkRule.pad, 10) || Math.max(String(a).length, String(b).length)
    const nums: string[] = []
    for (let n = a; n <= b; n++) nums.push(`${bulkRule.prefix}${String(n).padStart(pad, '0')}${bulkRule.suffix}`)
    setBulkNumbers([...new Set(nums)])
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex gap-4 h-full min-h-0 overflow-hidden">
      {/* 左：表格 */}
      <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2 mb-3 flex-shrink-0">
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
            <Plus size={15} /> 新增球车
          </button>
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
            {brandList.map(b => <option key={b} value={b === '全部' ? 'all' : b}>{b}</option>)}
          </select>
          <div className="flex items-center border border-gray-200 rounded-lg bg-white px-2 gap-1">
            <Search size={14} className="text-gray-400" />
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
              placeholder="搜索车号/品牌" className="py-2 text-sm outline-none w-32" />
          </div>
          <button onClick={() => setSearch(searchInput)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:bg-gray-50">搜索</button>
          <button onClick={load} className="p-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
          </button>
          {selected.length > 0 && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-gray-200">
              <span className="text-xs text-gray-500">已选 {selected.length}</span>
              <button onClick={() => handleBatchStatus('notCheckedOut')}
                className="px-2 py-1 text-xs border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50">可用</button>
              <button onClick={() => handleBatchStatus('maintenance')}
                className="px-2 py-1 text-xs border border-yellow-200 text-yellow-700 rounded-lg hover:bg-yellow-50">维修</button>
              <button onClick={() => handleBatchStatus('disabled')}
                className="px-2 py-1 text-xs border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50">停用</button>
              <button onClick={() => handleDelete(selected)}
                className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50">删除</button>
            </div>
          )}
          <div className="ml-auto text-xs text-gray-400">共 {total} 辆</div>
        </div>

        {/* 表格 */}
        <div className="flex-1 overflow-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-600">
                    {selected.length > 0 && selected.length === list.length
                      ? <CheckSquare size={16} className="text-emerald-600" />
                      : <Square size={16} />}
                  </button>
                </th>
                {([['cartNumber', '车号'], ['brand', '品牌'], ['status', '状态']] as const).map(([f, label]) => (
                  <th key={f} className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort(f)}>
                    {label}
                    <ArrowUpDown size={13} className={`ml-1 inline ${sortField === f ? 'text-emerald-600' : 'text-gray-300'}`} />
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-gray-600">备注</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && list.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16 text-gray-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2" />加载中...
                </td></tr>
              ) : sortedList.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16 text-gray-300">
                  <Car size={32} className="mx-auto mb-2 opacity-40" />暂无球车
                </td></tr>
              ) : sortedList.map(cart => {
                const cfg = STATUS_CONFIG[cart.status] || STATUS_CONFIG['notCheckedOut']
                const isSelected = selected.includes(cart._id)
                const isActive = detail?._id === cart._id
                return (
                  <tr key={cart._id}
                    className={`cursor-pointer transition-colors ${isActive ? 'bg-emerald-50 border-l-[3px] border-emerald-500' : cfg.rowBg} ${isSelected ? '!bg-emerald-50/60' : ''} hover:bg-gray-50/80`}
                    onClick={() => setDetail(isActive ? null : cart)}>
                    <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(cart._id) }}>
                      {isSelected
                        ? <CheckSquare size={16} className="text-emerald-600" />
                        : <Square size={16} className="text-gray-300" />}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{cart.cartNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{cart.brand}</td>
                    <td className="px-4 py-3"><StatusBadge status={cart.status} /></td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[140px] truncate">{cart.remark || '--'}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(cart)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete([cart._id])} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm text-gray-500 flex-shrink-0">
            <span className="text-xs">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / 共{total}条</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span className="px-2 text-xs">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {/* 右：详情面板 */}
      {detail && (
        <div className="w-64 xl:w-72 flex-shrink-0 bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <h3 className="font-semibold text-gray-800 text-sm">球车详情</h3>
            <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="p-4 flex-1 overflow-auto space-y-4">
            <div className="text-center py-2">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Car size={26} className="text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-gray-900">{detail.cartNumber}</div>
              <div className="text-sm text-gray-500 mt-0.5">{detail.brand}</div>
              <div className="mt-2"><StatusBadge status={detail.status} /></div>
            </div>

            {detail.remark && (
              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs text-gray-400 mb-1">备注</div>
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{detail.remark}</div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-400 mb-2">快捷操作</div>
              <div className="grid grid-cols-2 gap-2">
                {detail.status !== 'notCheckedOut' && detail.status !== 'available' && (
                  <button onClick={() => { api.cartManagement.update(detail._id, { status: 'notCheckedOut' }).then(() => { toast.success('已标记可用'); load(); onRefreshStats() }) }}
                    className="py-2 text-xs border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50">标记可用</button>
                )}
                {detail.status !== 'maintenance' && (
                  <button onClick={() => { api.cartManagement.update(detail._id, { status: 'maintenance' }).then(() => { toast.success('已标记维修'); load(); onRefreshStats() }) }}
                    className="py-2 text-xs border border-yellow-200 text-yellow-700 rounded-lg hover:bg-yellow-50">标记维修</button>
                )}
                {detail.status !== 'disabled' && (
                  <button onClick={() => { api.cartManagement.update(detail._id, { status: 'disabled' }).then(() => { toast.success('已停用'); load(); onRefreshStats() }) }}
                    className="py-2 text-xs border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50">标记停用</button>
                )}
                <button onClick={() => openEdit(detail)}
                  className="py-2 text-xs border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50">编辑信息</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto">
            <div className="flex justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">{editCart ? '编辑球车' : '新增球车'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {!editCart && (
                <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                  {(['single', 'bulk'] as const).map(m => (
                    <button key={m} onClick={() => setCreateMode(m)}
                      className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${createMode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                      {m === 'single' ? '单个' : '批量'}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">品牌</label>
                <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  list="brand-list-modal"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="输入或选择品牌" />
                <datalist id="brand-list-modal">
                  {brandList.filter(b => b !== '全部').map(b => <option key={b} value={b} />)}
                </datalist>
              </div>
              {(createMode === 'single' || editCart) ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">车号</label>
                    <input value={form.cartNumber} onChange={e => setForm(f => ({ ...f, cartNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="如 001" disabled={!!editCart} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">备注（可选）</label>
                    <input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="备注信息" />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="前缀（可选）" value={bulkRule.prefix} onChange={e => setBulkRule(r => ({ ...r, prefix: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input placeholder="后缀（可选）" value={bulkRule.suffix} onChange={e => setBulkRule(r => ({ ...r, suffix: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input type="number" placeholder="起始数字" value={bulkRule.start} onChange={e => setBulkRule(r => ({ ...r, start: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input type="number" placeholder="结束数字" value={bulkRule.end} onChange={e => setBulkRule(r => ({ ...r, end: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input type="number" placeholder="补齐位数（如3→001）" value={bulkRule.pad} onChange={e => setBulkRule(r => ({ ...r, pad: e.target.value }))}
                      className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <button onClick={generateBulk} className="w-full py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">生成预览</button>
                  {bulkNumbers.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 max-h-28 overflow-auto">
                      <div className="text-xs text-gray-500 mb-2">预览 {bulkNumbers.length} 条</div>
                      <div className="flex flex-wrap gap-1">
                        {bulkNumbers.slice(0, 24).map(n => (
                          <span key={n} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs">{n}</span>
                        ))}
                        {bulkNumbers.length > 24 && <span className="text-xs text-gray-400">+{bulkNumbers.length - 24}条</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm">取消</button>
              <button onClick={editCart ? handleSaveEdit : handleSubmit}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                {editCart ? '保存' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 维修管理 Tab（看板视图）──────────────────────────────────────────────────

function MaintenanceTab() {
  const [records, setRecords]       = useState<MaintenanceRecord[]>([])
  const [loading, setLoading]       = useState(false)
  const [faultAnalysis, setFaultAnalysis] = useState<{ name: string; count: number; percent: number }[]>([])
  const [date, setDate]             = useState(formatDate(new Date()))

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.maintenance.getList({ date, status: 'all' }),
      api.maintenance.getFaultAnalysis({ date }),
    ]).then(([res1, res2]: any[]) => {
      setRecords(res1.data || [])
      setFaultAnalysis(res2.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [date])

  useEffect(() => { load() }, [load])

  const handleComplete = (id: string) => {
    api.maintenance.complete(id).then(() => { toast.success('维修已完成'); load() })
  }

  const ongoing   = records.filter(r => r.status !== 'completed')
  const completed = records.filter(r => r.status === 'completed')
  const totalCost = completed.reduce((s, r) => s + (r.totalCost || 0), 0)

  const KanbanCard = ({ r }: { r: MaintenanceRecord }) => (
    <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-semibold text-gray-900 text-sm">{r.cartNumber}</span>
          {r.cartBrand && <span className="text-xs text-gray-400 ml-1.5">{r.cartBrand}</span>}
        </div>
        {!!r.totalCost && <span className="text-xs text-gray-500">¥{r.totalCost}</span>}
      </div>
      <div className="mb-2">
        <span className="inline-block px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded text-xs font-medium">{r.faultType}</span>
        {r.faultDescription && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.faultDescription}</p>}
      </div>
      <div className="text-xs text-gray-400 space-y-0.5">
        <div>报修：{r.reportTime}{r.reportPerson ? ` · ${r.reportPerson}` : ''}</div>
        {r.completedTime && <div>完成：{r.completedTime}</div>}
        {r.duration && r.duration !== '--' && <div>耗时：{r.duration}</div>}
      </div>
      {r.status !== 'completed' && (
        <button onClick={() => handleComplete(r._id)}
          className="mt-2.5 w-full py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700">
          完成维修
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4 text-sm">
          <h2 className="text-base font-semibold text-gray-800">维修看板</h2>
          <span className="text-gray-500">维修中 <b className="text-yellow-600">{ongoing.length}</b></span>
          <span className="text-gray-500">已完成 <b className="text-emerald-600">{completed.length}</b></span>
          {totalCost > 0 && <span className="text-gray-500">合计费用 <b className="text-gray-700">¥{totalCost}</b></span>}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
          <button onClick={load} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
          </button>
        </div>
      </div>

      {/* 看板 + 故障分析 */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* 看板列 */}
        {[
          { label: '维修中', data: ongoing,   color: 'text-yellow-700',  headerBg: 'bg-yellow-50 border-yellow-200' },
          { label: '已完成', data: completed, color: 'text-emerald-700', headerBg: 'bg-emerald-50 border-emerald-200' },
        ].map(col => (
          <div key={col.label} className="flex flex-col min-h-0 flex-1">
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border ${col.headerBg}`}>
              <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white ${col.color}`}>{col.data.length}</span>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50/50 rounded-b-xl border border-t-0 border-gray-100 p-2 space-y-2 min-h-[120px]">
              {loading && col.data.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">加载中...</div>
              ) : col.data.length === 0 ? (
                <div className="text-center text-gray-300 py-10 text-sm">暂无记录</div>
              ) : col.data.map(r => <KanbanCard key={r._id} r={r} />)}
            </div>
          </div>
        ))}

        {/* 故障分析侧栏 */}
        {faultAnalysis.length > 0 && (
          <div className="w-52 flex-shrink-0 bg-white rounded-xl border border-gray-100 p-4 overflow-auto">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">故障类型分析</h3>
            <div className="space-y-3">
              {faultAnalysis.map((f, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{f.name}</span>
                    <span className="font-medium">{f.count}次 {f.percent}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${f.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 使用记录 Tab（甘特时间轴 + 列表切换）──────────────────────────────────────

function UsageTab({ brandList }: { brandList: string[] }) {
  const [list, setList]             = useState<UsageRecord[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(false)
  const [date, setDate]             = useState(formatDate(new Date()))
  const [brand, setBrand]           = useState('all')
  const [searchText, setSearchText] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [detail, setDetail]         = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [viewMode, setViewMode]     = useState<'gantt' | 'list'>('gantt')
  const PAGE_SIZE = 60

  const load = useCallback(() => {
    setLoading(true)
    api.cartManagement.getUsageList({ page, limit: PAGE_SIZE, date, brand, searchText })
      .then((res: any) => { setList(res.data || []); setTotal(res.total || 0) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [date, brand, page, searchText])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [date, brand, searchText])

  const handleSearch = () => { setSearchText(searchInput.trim()); setPage(1) }
  const handleSearchKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch() }
  const clearSearch = () => { setSearchInput(''); setSearchText(''); setPage(1) }

  const loadDetail = (id: string) => {
    setDetailLoading(true)
    setDetail(null)
    api.cartManagement.getUsageDetail(id)
      .then((r: any) => { setDetail(r.data || r) })
      .catch((err: any) => { toast.error('加载详情失败：' + (err?.message || '未知错误')) })
      .finally(() => setDetailLoading(false))
  }

  // 甘特轴：06:00 ~ 22:00
  const GANTT_START = 6, GANTT_END = 22, GANTT_HOURS = GANTT_END - GANTT_START
  const toPct = (v?: any) => {
    const d = toDate(v)
    if (!d) return null
    const h = Math.max(GANTT_START, Math.min(GANTT_END, d.getHours() + d.getMinutes() / 60))
    return ((h - GANTT_START) / GANTT_HOURS) * 100
  }
  const hours = Array.from({ length: GANTT_HOURS + 1 }, (_, i) => GANTT_START + i)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full min-h-0 space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
        <select value={brand} onChange={e => setBrand(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          {brandList.map(b => <option key={b} value={b === '全部' ? 'all' : b}>{b}</option>)}
        </select>
        {/* 搜索框：支持车号 / 球童工号 / 球童姓名 */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
          <Search size={13} className="ml-2.5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="车号 / 球童工号 / 姓名"
            className="px-2 py-1.5 text-sm outline-none w-40"
          />
          {searchInput && (
            <button onClick={clearSearch} className="mr-1 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
          <button onClick={handleSearch}
            className="px-2.5 py-1.5 bg-emerald-600 text-white text-xs hover:bg-emerald-700 transition-colors">
            搜索
          </button>
        </div>
        {searchText && (
          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
            搜索: {searchText}
          </span>
        )}
        <button onClick={load} className="p-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
          <RefreshCw size={14} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden ml-auto">
          {(['gantt', 'list'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-sm transition-colors ${viewMode === m ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {m === 'gantt' ? '时间轴' : '列表'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">共 {total} 条</span>
      </div>

      {loading && list.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <RefreshCw size={20} className="animate-spin mr-2" />加载中...
        </div>
      ) : list.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
          <History size={40} className="mb-2 opacity-40" /><span>暂无使用记录</span>
        </div>
      ) : viewMode === 'gantt' ? (
        // 甘特视图
        <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-100">
          <div className="min-w-[640px]">
            {/* 时间轴表头 */}
            <div className="flex border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="w-24 flex-shrink-0 px-3 py-2 text-xs text-gray-400 font-medium border-r border-gray-100">车号</div>
              <div className="flex-1 relative h-9">
                {hours.map(h => (
                  <div key={h} className="absolute top-0 flex flex-col items-center"
                    style={{ left: `${((h - GANTT_START) / GANTT_HOURS) * 100}%`, transform: 'translateX(-50%)' }}>
                    <div className="w-px h-2 bg-gray-200 mt-1" />
                    <span className="text-[10px] text-gray-400 mt-0.5">{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>
            </div>
            {list.map(u => {
              const cp = toPct(u.checkoutTime), dp = toPct(u.checkinTime)
              return (
                <div key={u._id} className="flex border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer"
                  onClick={() => loadDetail(u._id)}>
                  <div className="w-24 flex-shrink-0 px-3 py-2 border-r border-gray-100">
                    <div className="text-sm font-medium text-gray-800 leading-tight">{u.cartNumber}</div>
                    <div className="text-[10px] text-gray-400">{u.brand}</div>
                  </div>
                  <div className="flex-1 relative h-10 flex items-center">
                    {hours.map(h => (
                      <div key={h} className="absolute top-0 bottom-0 w-px bg-gray-50"
                        style={{ left: `${((h - GANTT_START) / GANTT_HOURS) * 100}%` }} />
                    ))}
                    {cp !== null && (
                      <div className="absolute h-5 rounded-full flex items-center overflow-hidden px-2 text-[11px] text-white font-medium shadow-sm"
                        style={{
                          left: `${cp}%`,
                          width: dp !== null ? `${Math.max(1, dp - cp)}%` : '4%',
                          background: u.checkinTime ? 'linear-gradient(90deg,#10b981,#059669)' : 'linear-gradient(90deg,#8b5cf6,#7c3aed)',
                        }}
                        title={`${u.cartNumber} ${formatTime(u.checkoutTime)}–${formatTime(u.checkinTime)}`}>
                        {u.cartNumber}
                      </div>
                    )}
                    {(u.laps || []).map((lap, i) => {
                      const lp = toPct(lap.departTime), rp = toPct(lap.returnTime)
                      if (lp === null) return null
                      return (
                        <div key={i} className="absolute h-1.5 rounded-full opacity-70 bg-amber-400"
                          style={{ left: `${lp}%`, width: rp !== null ? `${Math.max(0.5, rp - lp)}%` : '1%', top: '72%' }}
                          title={`下场 ${formatTime(lap.departTime)}–回场 ${formatTime(lap.returnTime)}`} />
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
              <div className="flex items-center gap-1.5"><div className="w-5 h-2.5 rounded-full bg-emerald-500" />已入库</div>
              <div className="flex items-center gap-1.5"><div className="w-5 h-2.5 rounded-full bg-violet-500" />进行中</div>
              <div className="flex items-center gap-1.5"><div className="w-5 h-1.5 rounded-full bg-amber-400" />下场/回场</div>
            </div>
          </div>
        </div>
      ) : (
        // 列表视图
        <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                {['车号', '品牌', '出库时间', '入库时间', '出库人', '圈数'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {list.map(u => (
                <tr key={u._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => loadDetail(u._id)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.cartNumber}</td>
                  <td className="px-4 py-3 text-gray-500">{u.brand}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDateTime(u.checkoutTime)}</td>
                  <td className="px-4 py-3">
                    {u.checkinTime
                      ? <span className="text-gray-600">{formatDateTime(u.checkinTime)}</span>
                      : <span className="text-violet-500 text-xs font-medium">进行中</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.checkoutByDisplay || '--'}</td>
                  <td className="px-4 py-3 text-gray-500">{(u.laps || []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页（列表模式） */}
      {viewMode === 'list' && totalPages > 1 && (
        <div className="flex items-center justify-end gap-1 flex-shrink-0 text-sm">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="px-2 text-xs text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}

      {/* 使用记录详情弹窗（loading 中 or 有数据时都显示） */}
      {(detailLoading || detail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={e => { if (e.target === e.currentTarget) { setDetail(null); setDetailLoading(false) } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {detail ? `球车 ${detail.cartNumber} · 使用详情` : '加载中...'}
                </h2>
                {detail && (
                  <p className="text-xs text-gray-400 mt-0.5">{detail.brand}  ·  {formatDateTime(detail.checkoutTime)} 出库</p>
                )}
              </div>
              <button onClick={() => { setDetail(null); setDetailLoading(false) }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center py-12 text-gray-400">
                <RefreshCw size={22} className="animate-spin mr-2" />加载中...
              </div>
            ) : detail && (
              <div className="overflow-auto flex-1">
                {/* 基础信息卡 */}
                <div className="mx-6 mt-5 grid grid-cols-3 gap-3">
                  {[
                    { label: '车号', value: detail.cartNumber },
                    { label: '品牌', value: detail.brand || '--' },
                    { label: '圈数', value: `${(detail.laps || []).length} 圈` },
                    {
                      label: '使用时长',
                      value: (() => {
                        const s = toDate(detail.checkoutTime), e = toDate(detail.checkinTime)
                        if (!s || !e) return detail.checkinTime ? '--' : '进行中'
                        const m = Math.floor((e.getTime() - s.getTime()) / 60000)
                        return m > 0 ? `${Math.floor(m / 60)}h${m % 60}m` : '--'
                      })()
                    },
                    { label: '出库时间', value: formatDateTime(detail.checkoutTime) },
                    { label: '入库时间', value: formatDateTime(detail.checkinTime) },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <div className="text-[10px] text-gray-400 mb-0.5">{item.label}</div>
                      <div className="text-sm font-medium text-gray-800">{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* 操作时间轴 */}
                <div className="px-6 pt-5 pb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">操作时间轴</div>
                  <div className="relative">
                    {/* 竖线 */}
                    <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gray-200" />
                    <div className="space-y-0">

                      {/* 出库 */}
                      <div className="flex items-start gap-3 pb-4">
                        <div className="relative z-10 w-6 h-6 rounded-full bg-blue-100 border-2 border-blue-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                        </div>
                        <div className="flex-1 bg-blue-50 rounded-xl px-3 py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-blue-800">出库</span>
                            <span className="text-xs text-blue-600">{formatDateTime(detail.checkoutTime)}</span>
                          </div>
                          {detail.checkoutByDisplay && (
                            <div className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <span className="opacity-60">操作人</span> {detail.checkoutByDisplay}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 圈次 */}
                      {(detail.laps || []).map((lap: any, i: number) => (
                        <div key={i} className="space-y-0">
                          {/* 下场 */}
                          <div className="flex items-start gap-3 pb-3">
                            <div className="relative z-10 w-6 h-6 rounded-full bg-amber-100 border-2 border-amber-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-[9px] font-bold text-amber-600">{i + 1}</span>
                            </div>
                            <div className="flex-1 bg-amber-50 rounded-xl px-3 py-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-amber-800">第 {i + 1} 圈 · 下场</span>
                                <span className="text-xs text-amber-600">{formatDateTime(lap.departTime)}</span>
                              </div>
                              {lap.departByDisplay && (
                                <div className="text-xs text-amber-600 mt-0.5">
                                  <span className="opacity-60">操作人</span> {lap.departByDisplay}
                                </div>
                              )}
                              {lap.returnTime && (
                                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-amber-100">
                                  <span className="text-xs text-amber-700">↩ 回场</span>
                                  <span className="text-xs text-amber-600">{formatDateTime(lap.returnTime)}</span>
                                </div>
                              )}
                              {lap.returnByDisplay && (
                                <div className="text-xs text-amber-600 mt-0.5">
                                  <span className="opacity-60">操作人</span> {lap.returnByDisplay}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* 入库 */}
                      <div className="flex items-start gap-3">
                        <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border-2
                          ${detail.checkinTime ? 'bg-emerald-100 border-emerald-300' : 'bg-gray-100 border-gray-300'}`}>
                          <div className={`w-2 h-2 rounded-full ${detail.checkinTime ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        </div>
                        <div className={`flex-1 rounded-xl px-3 py-2.5 ${detail.checkinTime ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${detail.checkinTime ? 'text-emerald-800' : 'text-gray-400'}`}>
                              {detail.checkinTime ? '入库' : '尚未入库'}
                            </span>
                            {detail.checkinTime && (
                              <span className="text-xs text-emerald-600">{formatDateTime(detail.checkinTime)}</span>
                            )}
                          </div>
                          {detail.checkinByDisplay && (
                            <div className="text-xs text-emerald-600 mt-0.5">
                              <span className="opacity-60">操作人</span> {detail.checkinByDisplay}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                {/* 责任人摘要 */}
                {(() => {
                  const people = new Set<string>()
                  if (detail.checkoutByDisplay) people.add(detail.checkoutByDisplay)
                  if (detail.checkinByDisplay) people.add(detail.checkinByDisplay)
                  ;(detail.laps || []).forEach((l: any) => {
                    if (l.departByDisplay) people.add(l.departByDisplay)
                    if (l.returnByDisplay) people.add(l.returnByDisplay)
                  })
                  if (people.size === 0) return null
                  return (
                    <div className="mx-6 mb-5 mt-1 bg-gray-50 rounded-xl px-4 py-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">责任人摘要</div>
                      <div className="flex flex-wrap gap-1.5">
                        {[...people].map(p => (
                          <span key={p} className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2.5 py-1 rounded-full text-xs text-gray-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />{p}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-400 mt-2">共涉及 {people.size} 名操作人员</div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 主页面 ──────────────────────────────────────────────────────────────────

export default function CartManagement() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab]     = useState<TabKey>('overview')
  const [stats, setStats]             = useState<Record<string, number | string>>({})
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsDate, setStatsDate]     = useState(formatDate(new Date()))
  const [brandList, setBrandList]     = useState<string[]>(['全部'])
  const [sidebarStatus, setSidebarStatus] = useState('all')

  const loadStats = useCallback((date = statsDate) => {
    setStatsLoading(true)
    api.cartManagement.getStatistics({ date })
      .then((res: any) => setStats(res.data || {}))
      .catch(() => {}).finally(() => setStatsLoading(false))
  }, [statsDate])

  useEffect(() => {
    loadStats()
    api.cartManagement.getBrands()
      .then((r: any) => setBrandList(['全部', ...(r.data || [])]))
      .catch(() => {})
  }, [])

  useEffect(() => { loadStats(statsDate) }, [statsDate])

  const handleStatClick = (status: string) => {
    setSidebarStatus(status)
    setActiveTab('carts')
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-6 h-[60px] flex items-center gap-4 shadow-sm flex-shrink-0">
        <button onClick={() => navigate('/home')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft size={16} /> 返回
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <h1 className="text-base font-semibold text-gray-900">球车管理</h1>
        <div className="flex gap-0.5 ml-6 bg-gray-100 rounded-xl p-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-gray-400">
          共 <b className="text-gray-700">{stats.totalCarts ?? '--'}</b> 辆
        </div>
      </header>

      {/* 主体 */}
      <div className="flex flex-1 min-h-0 p-4 gap-4">
        {/* 左侧状态导航（仅球车管理 Tab） */}
        {activeTab === 'carts' && (
          <div className="w-44 flex-shrink-0 bg-white rounded-xl border border-gray-100 shadow-sm p-3 self-start sticky top-[76px] space-y-0.5">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-2 pb-1.5 border-b border-gray-100 mb-1">状态筛选</div>
            {STATUS_SIDEBAR.map(s => {
              const cfg = s.value !== 'all' ? STATUS_CONFIG[s.value] : null
              const isActive = sidebarStatus === s.value
              return (
                <button key={s.value} onClick={() => setSidebarStatus(s.value)}
                  className={`w-full flex items-center justify-between px-2 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    {cfg && <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />}
                    {s.label}
                  </div>
                  <span className={`text-xs font-semibold tabular-nums ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {stats[s.statKey] ?? '--'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className={`flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 min-h-0
            ${activeTab === 'overview' ? 'overflow-auto p-6' : 'overflow-hidden p-6 flex flex-col'}`}>
            {activeTab === 'overview' && (
              <OverviewTab stats={stats} loading={statsLoading}
                date={statsDate} onDateChange={setStatsDate} onStatClick={handleStatClick} />
            )}
            {activeTab === 'carts' && (
              <CartsTab statusFilter={sidebarStatus} brandList={brandList} stats={stats} onRefreshStats={loadStats} />
            )}
            {activeTab === 'maintenance' && <MaintenanceTab />}
            {activeTab === 'usage' && <UsageTab brandList={brandList} />}
          </div>
        </div>
      </div>
    </div>
  )
}
