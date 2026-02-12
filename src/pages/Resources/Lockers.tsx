import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, X, Wrench, Unlock } from 'lucide-react'
import { api } from '@/utils/api'

interface Locker {
  _id: string
  lockerNo: string
  area: string
  size: string
  status: string
  currentBookingId: string | null
  currentPlayerName: string | null
  dailyFee: number
}

interface Stats {
  total: number
  available: number
  occupied: number
  maintenance: number
  retired: number
}

const SIZE_MAP: Record<string, string> = {
  standard: '标准',
  large: '大号',
  vip: 'VIP',
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  available:   { bg: 'bg-emerald-50',  border: 'border-emerald-300', text: 'text-emerald-700', label: '可用' },
  occupied:    { bg: 'bg-red-50',      border: 'border-red-300',     text: 'text-red-600',     label: '占用' },
  maintenance: { bg: 'bg-gray-100',    border: 'border-gray-300',    text: 'text-gray-500',    label: '维护' },
  retired:     { bg: 'bg-gray-50',     border: 'border-gray-200',    text: 'text-gray-400',    label: '停用' },
}

export default function Lockers() {
  const [lockers, setLockers] = useState<Locker[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [filterArea, setFilterArea] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 新增表单
  const [formMode, setFormMode] = useState<'single' | 'batch'>('single')
  const [formLockerNo, setFormLockerNo] = useState('')
  const [formArea, setFormArea] = useState('')
  const [formSize, setFormSize] = useState('standard')
  const [formFee, setFormFee] = useState('0')
  const [batchPrefix, setBatchPrefix] = useState('')
  const [batchStart, setBatchStart] = useState('1')
  const [batchEnd, setBatchEnd] = useState('10')
  const [batchArea, setBatchArea] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params: any = { pageSize: 200 }
      if (filterStatus) params.status = filterStatus
      if (filterArea) params.area = filterArea

      const [listRes, statsRes] = await Promise.all([
        api.lockers.getList(params),
        api.lockers.getStats(),
      ])
      setLockers((listRes as any).data || [])
      setStats((statsRes as any).data || null)
    } catch {
      toast.error('加载更衣柜列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterArea, filterStatus])

  // 获取所有区域（去重）
  const areas = [...new Set(lockers.map(l => l.area).filter(Boolean))]

  const handleCreate = async () => {
    if (formMode === 'single') {
      if (!formLockerNo.trim()) { toast.error('编号不能为空'); return }
      try {
        await api.lockers.create({ lockerNo: formLockerNo.trim(), area: formArea, size: formSize, dailyFee: Number(formFee) })
        toast.success('更衣柜创建成功')
        setShowAdd(false)
        setFormLockerNo('')
        load()
      } catch { /* interceptor */ }
    } else {
      const start = parseInt(batchStart)
      const end = parseInt(batchEnd)
      if (isNaN(start) || isNaN(end) || end < start) { toast.error('请输入有效的起止编号'); return }
      const batch = []
      for (let i = start; i <= end; i++) {
        batch.push({
          lockerNo: `${batchPrefix}${String(i).padStart(3, '0')}`,
          area: batchArea,
          size: formSize,
          dailyFee: Number(formFee),
        })
      }
      try {
        await api.lockers.create({ batch })
        toast.success(`批量创建 ${batch.length} 个更衣柜成功`)
        setShowAdd(false)
        load()
      } catch { /* interceptor */ }
    }
  }

  const handleStatusChange = async (locker: Locker, newStatus: string) => {
    try {
      const data: any = { status: newStatus }
      if (newStatus === 'available') {
        data.currentBookingId = null
        data.currentPlayerName = null
      }
      await api.lockers.update(locker._id, data)
      toast.success(`更衣柜 ${locker.lockerNo} 已${newStatus === 'maintenance' ? '设为维护' : newStatus === 'available' ? '释放' : '更新'}`)
      load()
    } catch { /* interceptor */ }
  }

  const handleDelete = async (locker: Locker) => {
    if (locker.status === 'occupied') { toast.error('占用中的更衣柜不能删除'); return }
    if (!confirm(`确定删除更衣柜 ${locker.lockerNo}？`)) return
    try {
      await api.lockers.remove(locker._id)
      toast.success('已删除')
      load()
    } catch { /* interceptor */ }
  }

  // 按区域分组
  const grouped = lockers.reduce<Record<string, Locker[]>>((acc, l) => {
    const key = l.area || '未分区'
    if (!acc[key]) acc[key] = []
    acc[key].push(l)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: '总数', value: stats.total, color: 'text-gray-800' },
            { label: '可用', value: stats.available, color: 'text-emerald-600' },
            { label: '占用', value: stats.occupied, color: 'text-red-600' },
            { label: '维护', value: stats.maintenance, color: 'text-gray-500' },
            { label: '停用', value: stats.retired, color: 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">全部区域</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">全部状态</option>
          <option value="available">可用</option>
          <option value="occupied">占用</option>
          <option value="maintenance">维护</option>
        </select>
        <button onClick={() => setShowAdd(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
          <Plus size={15} /> 新增更衣柜
        </button>
      </div>

      {/* 可视化网格（按区域分组） */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <div className="text-4xl mb-3">🔐</div>
          <p className="text-sm">暂无更衣柜</p>
        </div>
      ) : (
        Object.entries(grouped).map(([area, items]) => (
          <div key={area}>
            <h4 className="text-sm font-medium text-gray-600 mb-2">{area} <span className="text-gray-400">({items.length})</span></h4>
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
              {items.sort((a, b) => a.lockerNo.localeCompare(b.lockerNo)).map(l => {
                const sc = STATUS_COLORS[l.status] || STATUS_COLORS.available
                return (
                  <div key={l._id} className="group relative">
                    <div className={`${sc.bg} ${sc.border} border-2 rounded-lg p-2 text-center cursor-default transition-all hover:shadow-md`}>
                      <div className={`text-xs font-bold ${sc.text}`}>{l.lockerNo}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{sc.label}</div>
                      {l.currentPlayerName && (
                        <div className="text-[10px] text-gray-500 mt-0.5 truncate">{l.currentPlayerName}</div>
                      )}
                    </div>
                    {/* 悬浮操作 */}
                    <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5 z-10">
                      {l.status === 'available' && (
                        <button onClick={() => handleStatusChange(l, 'maintenance')} title="设为维护"
                          className="w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center text-[10px] hover:bg-gray-700">
                          <Wrench size={10} />
                        </button>
                      )}
                      {(l.status === 'occupied' || l.status === 'maintenance') && (
                        <button onClick={() => handleStatusChange(l, 'available')} title="释放"
                          className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] hover:bg-emerald-700">
                          <Unlock size={10} />
                        </button>
                      )}
                      {l.status !== 'occupied' && (
                        <button onClick={() => handleDelete(l)} title="删除"
                          className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] hover:bg-red-600">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* 新增弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">新增更衣柜</h2>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* 模式切换 */}
              <div className="flex gap-2">
                <button onClick={() => setFormMode('single')}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-all ${formMode === 'single' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium' : 'border-gray-200 text-gray-500'}`}>
                  单个创建
                </button>
                <button onClick={() => setFormMode('batch')}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-all ${formMode === 'batch' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium' : 'border-gray-200 text-gray-500'}`}>
                  批量创建
                </button>
              </div>

              {formMode === 'single' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">编号</label>
                    <input value={formLockerNo} onChange={e => setFormLockerNo(e.target.value)}
                      placeholder="如：A-101" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">区域</label>
                    <input value={formArea} onChange={e => setFormArea(e.target.value)}
                      placeholder="如：A区" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">编号前缀</label>
                    <input value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)}
                      placeholder="如：A-" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">起始编号</label>
                      <input type="number" value={batchStart} onChange={e => setBatchStart(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">结束编号</label>
                      <input type="number" value={batchEnd} onChange={e => setBatchEnd(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">区域</label>
                    <input value={batchArea} onChange={e => setBatchArea(e.target.value)}
                      placeholder="如：A区" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">规格</label>
                  <select value={formSize} onChange={e => setFormSize(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    {Object.entries(SIZE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">日租金</label>
                  <input type="number" value={formFee} onChange={e => setFormFee(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">确认创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
