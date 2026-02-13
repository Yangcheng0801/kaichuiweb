import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, X, BedDouble, Wrench, ClipboardCheck, Package, LogIn, LogOut, RefreshCw } from 'lucide-react'
import { api } from '@/utils/api'

/* ========== 类型 ========== */
interface Room {
  _id: string; roomNo: string; roomType: string; floor: string; status: string
  currentBookingId: string | null; currentGuestName: string | null
  pricePerNight: number; amenities: string[]; clubId: string
  currentStay?: { guestName: string; checkInTime: string; expectedCheckOut: string; guestCount: number; folioId?: string } | null
  lastCleaned?: { cleanedAt: string; inspectedAt: string } | null
}

interface HousekeepingTask {
  _id: string; roomId: string; roomNo: string; floor: string
  taskType: string; priority: string; status: string
  assignedName: string; startedAt: string | null; completedAt: string | null
  inspectedAt: string | null; notes: string; createdAt: string
}

interface StayPackage {
  _id: string; packageName: string; packageCode: string; description: string
  includes: { nights: number; rounds: number; breakfast: boolean; dinner: boolean; cartIncluded: boolean; caddyIncluded: boolean }
  pricing: { basePrice: number; memberPrice: number; weekendSurcharge: number }
  status: string; validFrom: string; validTo: string
}

interface Stats { total: number; available: number; occupied: number; cleaning: number; maintenance: number; retired: number }

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  available:     { label: '空净',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
  vacant_clean:  { label: '空净',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
  occupied:      { label: '住客',   bg: 'bg-red-100',     text: 'text-red-700' },
  vacant_dirty:  { label: '空脏',   bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  cleaning:      { label: '清洁中', bg: 'bg-blue-100',    text: 'text-blue-700' },
  inspected:     { label: '待查房', bg: 'bg-purple-100',  text: 'text-purple-700' },
  out_of_order:  { label: '维修',   bg: 'bg-gray-200',    text: 'text-gray-600' },
  out_of_service:{ label: '停售',   bg: 'bg-gray-100',    text: 'text-gray-400' },
  maintenance:   { label: '维护',   bg: 'bg-gray-200',    text: 'text-gray-600' },
  retired:       { label: '停用',   bg: 'bg-gray-100',    text: 'text-gray-400' },
}

const ROOM_TYPES: Record<string, string> = { standard: '标准间', deluxe: '豪华间', suite: '套房', villa: '别墅' }
const TASK_TYPES: Record<string, string> = { checkout_clean: '退房清洁', stay_clean: '续住清洁', deep_clean: '大清', turndown: '夜床' }
const PRIORITY_MAP: Record<string, { label: string; cls: string }> = {
  urgent: { label: '紧急', cls: 'bg-red-100 text-red-700' },
  high:   { label: '高', cls: 'bg-orange-100 text-orange-700' },
  normal: { label: '正常', cls: 'bg-gray-100 text-gray-600' },
  low:    { label: '低', cls: 'bg-gray-50 text-gray-400' },
}

/* ========== 主组件 ========== */
export default function Rooms() {
  const [tab, setTab] = useState<'rack' | 'housekeeping' | 'packages' | 'add'>('rack')
  const [rooms, setRooms] = useState<Room[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<HousekeepingTask[]>([])
  const [packages, setPackages] = useState<StayPackage[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [filterFloor, setFilterFloor] = useState('')

  // 入住/退房弹窗
  const [actionRoom, setActionRoom] = useState<Room | null>(null)
  const [actionType, setActionType] = useState<'checkin' | 'checkout' | null>(null)
  const [ciGuestName, setCiGuestName] = useState('')
  const [ciGuestCount, setCiGuestCount] = useState('1')
  const [ciExpectedCheckOut, setCiExpectedCheckOut] = useState('')

  // 新增房间
  const [formRoomNo, setFormRoomNo] = useState('')
  const [formFloor, setFormFloor] = useState('')
  const [formType, setFormType] = useState('standard')
  const [formPrice, setFormPrice] = useState('0')

  // 套餐表单
  const [showPkgForm, setShowPkgForm] = useState(false)
  const [pkgName, setPkgName] = useState('')
  const [pkgCode, setPkgCode] = useState('')
  const [pkgDesc, setPkgDesc] = useState('')
  const [pkgNights, setPkgNights] = useState('1')
  const [pkgRounds, setPkgRounds] = useState('2')
  const [pkgBasePrice, setPkgBasePrice] = useState('0')
  const [pkgMemberPrice, setPkgMemberPrice] = useState('0')

  /* ---------- 加载 ---------- */
  const loadRooms = async () => {
    setLoading(true)
    try {
      const params: any = { pageSize: 200 }
      if (filterFloor) params.floor = filterFloor
      const [listRes, statsRes] = await Promise.all([api.rooms.getList(params), api.rooms.getStats()])
      setRooms((listRes as any).data || [])
      setStats((statsRes as any).data || null)
    } catch { toast.error('加载失败') }
    setLoading(false)
  }

  const loadTasks = async () => {
    try {
      const res: any = await api.housekeeping.getTasks()
      setTasks(res.data || [])
    } catch { /* */ }
  }

  const loadPackages = async () => {
    try {
      const res: any = await api.stayPackages.getList()
      setPackages(res.data || [])
    } catch { /* */ }
  }

  useEffect(() => { loadRooms() }, [filterFloor])
  useEffect(() => { if (tab === 'housekeeping') loadTasks(); if (tab === 'packages') loadPackages() }, [tab])

  const floors = [...new Set(rooms.map(r => r.floor).filter(Boolean))].sort()

  /* ---------- 操作 ---------- */
  const handleCheckIn = async () => {
    if (!actionRoom || !ciGuestName.trim()) { toast.error('请填写客人姓名'); return }
    try {
      await api.rooms.checkIn(actionRoom._id, {
        guestName: ciGuestName.trim(), guestCount: Number(ciGuestCount),
        expectedCheckOut: ciExpectedCheckOut,
      })
      toast.success(`${actionRoom.roomNo} 入住成功`); setActionRoom(null); setActionType(null)
      setCiGuestName(''); loadRooms()
    } catch { /* */ }
  }

  const handleCheckOut = async () => {
    if (!actionRoom) return
    try {
      await api.rooms.checkOut(actionRoom._id)
      toast.success(`${actionRoom.roomNo} 退房成功`); setActionRoom(null); setActionType(null)
      loadRooms(); if (tab === 'housekeeping') loadTasks()
    } catch { /* */ }
  }

  const handleTaskAction = async (task: HousekeepingTask, action: 'start' | 'complete' | 'inspect') => {
    try {
      if (action === 'start') await api.housekeeping.start(task._id)
      else if (action === 'complete') await api.housekeeping.complete(task._id)
      else await api.housekeeping.inspect(task._id)
      toast.success('操作成功'); loadTasks(); loadRooms()
    } catch { /* */ }
  }

  const handleCreateRoom = async () => {
    if (!formRoomNo.trim()) { toast.error('房号必填'); return }
    try {
      await api.rooms.create({ roomNo: formRoomNo.trim(), floor: formFloor, roomType: formType, pricePerNight: Number(formPrice) })
      toast.success('客房创建成功'); setShowAdd(false); setFormRoomNo(''); loadRooms()
    } catch { /* */ }
  }

  const handleCreatePackage = async () => {
    if (!pkgName.trim()) { toast.error('套餐名称必填'); return }
    try {
      await api.stayPackages.create({
        packageName: pkgName.trim(), packageCode: pkgCode, description: pkgDesc,
        includes: { nights: Number(pkgNights), rounds: Number(pkgRounds), breakfast: true, dinner: false, cartIncluded: false, caddyIncluded: false },
        pricing: { basePrice: Number(pkgBasePrice), memberPrice: Number(pkgMemberPrice), weekendSurcharge: 0 },
      })
      toast.success('套餐创建成功'); setShowPkgForm(false); setPkgName(''); loadPackages()
    } catch { /* */ }
  }

  const handleDeleteRoom = async (room: Room) => {
    if (room.status === 'occupied') { toast.error('入住中不能删除'); return }
    if (!confirm(`确定删除 ${room.roomNo}？`)) return
    try { await api.rooms.remove(room._id); toast.success('已删除'); loadRooms() } catch { /* */ }
  }

  // 按楼层分组
  const grouped = rooms.reduce<Record<string, Room[]>>((acc, r) => {
    const key = r.floor || '未分层'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  // 清洁看板分组
  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const completedTasks = tasks.filter(t => t.status === 'completed')
  const inspectedTasks = tasks.filter(t => t.status === 'inspected')

  /* ========== 渲染 ========== */
  return (
    <div className="space-y-6">
      {/* 统计 */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: '总数', value: stats.total, color: 'text-gray-800' },
            { label: '空净', value: stats.available, color: 'text-emerald-600' },
            { label: '住客', value: stats.occupied, color: 'text-red-600' },
            { label: '清洁', value: stats.cleaning, color: 'text-blue-600' },
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

      {/* Tab */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100">
          {[
            { key: 'rack' as const, label: '房态总览', icon: BedDouble },
            { key: 'housekeeping' as const, label: '清洁看板', icon: ClipboardCheck },
            { key: 'packages' as const, label: '套餐管理', icon: Package },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium transition-all ${tab === t.key ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
        <button onClick={loadRooms} disabled={loading} className="ml-auto p-2 rounded-lg hover:bg-white text-gray-400 transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ======== Tab: 房态总览 (Room Rack) ======== */}
      {tab === 'rack' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">全部楼层</option>
              {floors.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="flex items-center gap-3 text-[11px] text-gray-400 ml-auto">
              {Object.entries(STATUS_MAP).slice(0, 6).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${v.bg}`} />{v.label}</span>
              ))}
            </div>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
              <Plus size={15} /> 新增客房
            </button>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-16 text-gray-300"><p className="text-sm">暂无客房</p></div>
          ) : (
            Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([floor, items]) => (
              <div key={floor}>
                <h4 className="text-sm font-medium text-gray-600 mb-2">{floor} <span className="text-gray-400">({items.length})</span></h4>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                  {items.sort((a, b) => a.roomNo.localeCompare(b.roomNo)).map(r => {
                    const st = STATUS_MAP[r.status] || STATUS_MAP.available
                    return (
                      <div key={r._id} className="group relative">
                        <div className={`${st.bg} border-2 border-transparent rounded-xl p-3 text-center cursor-pointer transition-all hover:shadow-md hover:border-gray-300`}
                          onClick={() => {
                            if (r.status === 'occupied') { setActionRoom(r); setActionType('checkout') }
                            else if (['available','vacant_clean','inspected'].includes(r.status)) { setActionRoom(r); setActionType('checkin') }
                          }}>
                          <div className={`text-sm font-bold ${st.text}`}>{r.roomNo}</div>
                          <div className="text-[10px] text-gray-400">{ROOM_TYPES[r.roomType] || r.roomType}</div>
                          <div className={`text-[10px] font-medium ${st.text} mt-0.5`}>{st.label}</div>
                          {r.currentGuestName && <div className="text-[10px] text-gray-500 truncate mt-0.5">{r.currentGuestName}</div>}
                          {r.currentStay?.expectedCheckOut && (
                            <div className="text-[9px] text-gray-400 mt-0.5">退 {r.currentStay.expectedCheckOut.slice(5)}</div>
                          )}
                        </div>
                        <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5 z-10">
                          {r.status === 'occupied' && (
                            <button onClick={e => { e.stopPropagation(); setActionRoom(r); setActionType('checkout') }} title="退房"
                              className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
                              <LogOut size={10} />
                            </button>
                          )}
                          {['available','vacant_clean','inspected'].includes(r.status) && (
                            <button onClick={e => { e.stopPropagation(); setActionRoom(r); setActionType('checkin') }} title="入住"
                              className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700">
                              <LogIn size={10} />
                            </button>
                          )}
                          {r.status !== 'occupied' && (
                            <button onClick={e => { e.stopPropagation(); handleDeleteRoom(r) }} title="删除"
                              className="w-5 h-5 rounded-full bg-gray-500 text-white flex items-center justify-center hover:bg-gray-600">
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
        </>
      )}

      {/* ======== Tab: 清洁看板 (Kanban) ======== */}
      {tab === 'housekeeping' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { title: '待清洁', items: pendingTasks, color: 'border-yellow-300', actionLabel: '开始', action: 'start' as const },
            { title: '清洁中', items: inProgressTasks, color: 'border-blue-300', actionLabel: '完成', action: 'complete' as const },
            { title: '待查房', items: completedTasks, color: 'border-purple-300', actionLabel: '通过', action: 'inspect' as const },
            { title: '已完成', items: inspectedTasks, color: 'border-emerald-300', actionLabel: null, action: null },
          ].map(col => (
            <div key={col.title} className={`bg-white rounded-2xl border-t-4 ${col.color} shadow-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100">
                <h4 className="text-sm font-semibold text-gray-700">{col.title} <span className="text-gray-400">({col.items.length})</span></h4>
              </div>
              <div className="p-3 space-y-2 min-h-[120px]">
                {col.items.length === 0 ? (
                  <div className="text-center py-6 text-gray-300 text-xs">暂无</div>
                ) : col.items.map(t => {
                  const pr = PRIORITY_MAP[t.priority] || PRIORITY_MAP.normal
                  return (
                    <div key={t._id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{t.roomNo}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pr.cls}`}>{pr.label}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{TASK_TYPES[t.taskType] || t.taskType}</div>
                      {t.assignedName && <div className="text-xs text-gray-500 mt-0.5">{t.assignedName}</div>}
                      {col.action && (
                        <button onClick={() => handleTaskAction(t, col.action!)}
                          className="mt-2 w-full text-xs py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">
                          {col.actionLabel}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======== Tab: 套餐管理 ======== */}
      {tab === 'packages' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">住宿套餐</h3>
            <button onClick={() => setShowPkgForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
              <Plus size={15} /> 新建套餐
            </button>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {packages.length === 0 ? (
              <div className="col-span-full text-center py-12 text-gray-400 text-sm">暂无套餐</div>
            ) : packages.map(pkg => (
              <div key={pkg._id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-900">{pkg.packageName}</h4>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${pkg.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {pkg.status === 'active' ? '上架' : '下架'}
                  </span>
                </div>
                {pkg.description && <p className="text-xs text-gray-500 mb-3">{pkg.description}</p>}
                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex justify-between"><span>{pkg.includes.nights}晚 + {pkg.includes.rounds}轮</span></div>
                  {pkg.includes.breakfast && <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded mr-1">含早</span>}
                  {pkg.includes.cartIncluded && <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded mr-1">含车</span>}
                  {pkg.includes.caddyIncluded && <span className="inline-block px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">含球童</span>}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-lg font-bold text-gray-900">¥{pkg.pricing.basePrice}</span>
                    {pkg.pricing.memberPrice > 0 && (
                      <span className="text-xs text-emerald-600 ml-2">会员 ¥{pkg.pricing.memberPrice}</span>
                    )}
                  </div>
                  <button onClick={() => { api.stayPackages.remove(pkg._id).then(() => { toast.success('已删除'); loadPackages() }) }}
                    className="text-xs text-red-400 hover:text-red-600">删除</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ======== 入住弹窗 ======== */}
      {actionRoom && actionType === 'checkin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">入住 {actionRoom.roomNo}</h2>
              <button onClick={() => { setActionRoom(null); setActionType(null) }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">客人姓名</label><input value={ciGuestName} onChange={e => setCiGuestName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">人数</label><input type="number" value={ciGuestCount} onChange={e => setCiGuestCount(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">预计退房</label><input type="date" value={ciExpectedCheckOut} onChange={e => setCiExpectedCheckOut(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setActionRoom(null); setActionType(null) }} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCheckIn} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">确认入住</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== 退房确认 ======== */}
      {actionRoom && actionType === 'checkout' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">退房 {actionRoom.roomNo}</h2>
              <button onClick={() => { setActionRoom(null); setActionType(null) }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600">确认为 <strong>{actionRoom.currentGuestName || actionRoom.currentStay?.guestName || '客人'}</strong> 办理退房？</p>
              <p className="text-xs text-gray-400 mt-2">退房后将自动创建清洁任务。</p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setActionRoom(null); setActionType(null) }} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCheckOut} className="flex-1 px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 font-medium">确认退房</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== 新增客房弹窗 ======== */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">新增客房</h2>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">房号</label><input value={formRoomNo} onChange={e => setFormRoomNo(e.target.value)} placeholder="如：301" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">楼层</label><input value={formFloor} onChange={e => setFormFloor(e.target.value)} placeholder="如：3F" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">房型</label><select value={formType} onChange={e => setFormType(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">{Object.entries(ROOM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">每晚价格</label><input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreateRoom} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">确认创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== 新建套餐弹窗 ======== */}
      {showPkgForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">新建住宿套餐</h2>
              <button onClick={() => setShowPkgForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">套餐名称</label><input value={pkgName} onChange={e => setPkgName(e.target.value)} placeholder="如：两球一晚" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">套餐代码</label><input value={pkgCode} onChange={e => setPkgCode(e.target.value)} placeholder="如：STAY_PLAY_1N" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">描述</label><input value={pkgDesc} onChange={e => setPkgDesc(e.target.value)} placeholder="如：1晚住宿 + 2轮果岭 + 双早" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">住宿晚数</label><input type="number" value={pkgNights} onChange={e => setPkgNights(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">果岭轮数</label><input type="number" value={pkgRounds} onChange={e => setPkgRounds(e.target.value)} min="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">标准价</label><input type="number" value={pkgBasePrice} onChange={e => setPkgBasePrice(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">会员价</label><input type="number" value={pkgMemberPrice} onChange={e => setPkgMemberPrice(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowPkgForm(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreatePackage} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">确认创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
