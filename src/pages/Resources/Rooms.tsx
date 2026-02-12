import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, X, Wrench, Unlock, Sparkles } from 'lucide-react'
import { api } from '@/utils/api'

interface Room {
  _id: string
  roomNo: string
  roomType: string
  floor: string
  status: string
  currentBookingId: string | null
  currentGuestName: string | null
  pricePerNight: number
  amenities: string[]
}

interface Stats {
  total: number
  available: number
  occupied: number
  cleaning: number
  maintenance: number
  retired: number
}

const TYPE_MAP: Record<string, string> = { standard: '标间', deluxe: '豪华', suite: '套房' }

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string; icon?: string }> = {
  available:   { bg: 'bg-emerald-50',  border: 'border-emerald-300', text: 'text-emerald-700', label: '空闲' },
  occupied:    { bg: 'bg-red-50',      border: 'border-red-300',     text: 'text-red-600',     label: '入住' },
  cleaning:    { bg: 'bg-yellow-50',   border: 'border-yellow-300',  text: 'text-yellow-700',  label: '清洁' },
  maintenance: { bg: 'bg-gray-100',    border: 'border-gray-300',    text: 'text-gray-500',    label: '维护' },
  retired:     { bg: 'bg-gray-50',     border: 'border-gray-200',    text: 'text-gray-400',    label: '停用' },
}

export default function Rooms() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [filterFloor, setFilterFloor] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 新增表单
  const [formRoomNo, setFormRoomNo] = useState('')
  const [formType, setFormType] = useState('standard')
  const [formFloor, setFormFloor] = useState('')
  const [formPrice, setFormPrice] = useState('580')

  const load = async () => {
    setLoading(true)
    try {
      const params: any = { pageSize: 200 }
      if (filterStatus) params.status = filterStatus
      if (filterFloor) params.floor = filterFloor
      if (filterType) params.roomType = filterType

      const [listRes, statsRes] = await Promise.all([
        api.rooms.getList(params),
        api.rooms.getStats(),
      ])
      setRooms((listRes as any).data || [])
      setStats((statsRes as any).data || null)
    } catch {
      toast.error('加载客房列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterFloor, filterType, filterStatus])

  const floors = [...new Set(rooms.map(r => r.floor).filter(Boolean))].sort()

  const handleCreate = async () => {
    if (!formRoomNo.trim()) { toast.error('房间号不能为空'); return }
    try {
      await api.rooms.create({ roomNo: formRoomNo.trim(), roomType: formType, floor: formFloor, pricePerNight: Number(formPrice) })
      toast.success('客房创建成功')
      setShowAdd(false)
      setFormRoomNo('')
      load()
    } catch { /* interceptor */ }
  }

  const handleStatusChange = async (room: Room, newStatus: string) => {
    try {
      const data: any = { status: newStatus }
      if (newStatus === 'available' || newStatus === 'cleaning') {
        data.currentBookingId = null
        data.currentGuestName = null
      }
      await api.rooms.update(room._id, data)
      toast.success(`房间 ${room.roomNo} 状态已更新`)
      load()
    } catch { /* interceptor */ }
  }

  const handleDelete = async (room: Room) => {
    if (room.status === 'occupied') { toast.error('入住中的客房不能删除'); return }
    if (!confirm(`确定删除客房 ${room.roomNo}？`)) return
    try {
      await api.rooms.remove(room._id)
      toast.success('已删除')
      load()
    } catch { /* interceptor */ }
  }

  // 按楼层分组
  const grouped = rooms.reduce<Record<string, Room[]>>((acc, r) => {
    const key = r.floor || '未分层'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* 统计 */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: '总数', value: stats.total, color: 'text-gray-800' },
            { label: '空闲', value: stats.available, color: 'text-emerald-600' },
            { label: '入住', value: stats.occupied, color: 'text-red-600' },
            { label: '清洁', value: stats.cleaning, color: 'text-yellow-600' },
            { label: '维护', value: stats.maintenance, color: 'text-gray-500' },
            { label: '停用', value: stats.retired, color: 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">全部楼层</option>
          {floors.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">全部房型</option>
          {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">全部状态</option>
          <option value="available">空闲</option>
          <option value="occupied">入住</option>
          <option value="cleaning">清洁</option>
          <option value="maintenance">维护</option>
        </select>
        <button onClick={() => setShowAdd(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
          <Plus size={15} /> 新增客房
        </button>
      </div>

      {/* 按楼层展示 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <div className="text-4xl mb-3">🏨</div>
          <p className="text-sm">暂无客房</p>
        </div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([floor, items]) => (
          <div key={floor}>
            <h4 className="text-sm font-medium text-gray-600 mb-2">{floor} <span className="text-gray-400">({items.length}间)</span></h4>
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {items.sort((a, b) => a.roomNo.localeCompare(b.roomNo)).map(r => {
                const sc = STATUS_COLORS[r.status] || STATUS_COLORS.available
                return (
                  <div key={r._id} className="group relative">
                    <div className={`${sc.bg} ${sc.border} border-2 rounded-xl p-3 text-center cursor-default transition-all hover:shadow-md`}>
                      <div className={`text-sm font-bold ${sc.text}`}>{r.roomNo}</div>
                      <div className="text-[10px] text-gray-400">{TYPE_MAP[r.roomType] || r.roomType}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">¥{r.pricePerNight}/晚</div>
                      <div className={`text-[10px] font-medium mt-1 ${sc.text}`}>{sc.label}</div>
                      {r.currentGuestName && (
                        <div className="text-[10px] text-gray-500 mt-0.5 truncate">{r.currentGuestName}</div>
                      )}
                    </div>
                    {/* 悬浮操作 */}
                    <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5 z-10">
                      {r.status === 'cleaning' && (
                        <button onClick={() => handleStatusChange(r, 'available')} title="清洁完成"
                          className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700">
                          <Sparkles size={10} />
                        </button>
                      )}
                      {r.status === 'available' && (
                        <button onClick={() => handleStatusChange(r, 'maintenance')} title="设为维护"
                          className="w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center hover:bg-gray-700">
                          <Wrench size={10} />
                        </button>
                      )}
                      {(r.status === 'occupied' || r.status === 'maintenance') && (
                        <button onClick={() => handleStatusChange(r, 'available')} title="释放"
                          className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700">
                          <Unlock size={10} />
                        </button>
                      )}
                      {r.status !== 'occupied' && (
                        <button onClick={() => handleDelete(r)} title="删除"
                          className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">新增客房</h2>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">房间号</label>
                <input value={formRoomNo} onChange={e => setFormRoomNo(e.target.value)}
                  placeholder="如：301" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">房型</label>
                  <select value={formType} onChange={e => setFormType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">楼层</label>
                  <input value={formFloor} onChange={e => setFormFloor(e.target.value)}
                    placeholder="如：3F" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">每晚价格</label>
                <input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
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
