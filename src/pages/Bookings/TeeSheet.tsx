import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, X, CreditCard, Wallet, QrCode, Banknote, Building2, Search, UserCheck, Car, Lock, DoorOpen, Package, ParkingCircle, Zap } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface Pricing {
  greenFee:     number
  caddyFee:     number
  cartFee:      number
  insuranceFee: number
  roomFee:      number
  otherFee:     number
  discount:     number
  totalFee:     number
  paidFee:      number
  pendingFee:   number
}

interface Booking {
  _id:         string
  orderNo:     string
  date:        string
  teeTime:     string
  courseId:    string
  courseName:  string
  players:     { name: string; type: string; playerNo?: string; phone?: string; memberId?: string }[]
  playerCount: number
  caddyId:     string
  caddyName:   string
  cartNo:      string
  totalFee:    number
  pricing:     Pricing
  payments:    any[]
  status:      string
  note:        string
  version:     number
  stayType?:   string
  assignedResources?: {
    caddyId:     string | null
    caddyName:   string
    cartId:      string | null
    cartNo:      string
    lockers:     { lockerId?: string; lockerNo: string; area?: string }[]
    rooms:       { roomId?: string; roomNo: string; roomType?: string }[]
    bagStorage:  { bagNo: string; location?: string }[]
    parking:     { plateNo: string; companions?: string[] } | null
    tempCardId?: string
    tempCardNo?: string
    folioId?:    string
    folioNo?:    string
  }
  playerId?:  string
  playerName?: string
}

interface Course { _id: string; name: string; holes: number }

interface Props {
  onNewBooking:  (date: string) => void
  onStatusChange: () => void
}

// ─── 支付方式 ─────────────────────────────────────────────────────────────────

const PAY_METHODS = [
  { value: 'cash',        label: '现金',     icon: <Banknote   size={16} /> },
  { value: 'wechat',      label: '微信',     icon: <QrCode     size={16} /> },
  { value: 'alipay',      label: '支付宝',   icon: <QrCode     size={16} /> },
  { value: 'card',        label: '银行卡',   icon: <CreditCard size={16} /> },
  { value: 'member_card', label: '会员卡',   icon: <Wallet     size={16} /> },
  { value: 'transfer',    label: '转账',     icon: <Building2  size={16} /> },
]

// ─── 状态样式 ─────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; dot: string; card: string; text: string }> = {
  pending:    { label: '待确认', dot: 'bg-yellow-400',  card: 'border-yellow-200 bg-yellow-50',  text: 'text-yellow-700' },
  confirmed:  { label: '已确认', dot: 'bg-emerald-400', card: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700' },
  checked_in: { label: '已签到', dot: 'bg-blue-400',    card: 'border-blue-200 bg-blue-50',       text: 'text-blue-700'    },
  completed:  { label: '已完赛', dot: 'bg-gray-300',    card: 'border-gray-200 bg-gray-50',       text: 'text-gray-500'    },
  cancelled:  { label: '已取消', dot: 'bg-red-300',     card: 'border-red-200 bg-red-50',         text: 'text-red-400'     },
}

// ─── 日期工具 ─────────────────────────────────────────────────────────────────

function formatDate(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function formatDisplay(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
}

// ─── 签到工作台弹窗（全面升级版） ─────────────────────────────────────────────

interface CheckInDialogProps {
  booking:  Booking
  onClose:  () => void
  onSuccess: () => void
}

interface AvailableLocker { _id: string; lockerNo: string; area: string; size: string; dailyFee: number; status: string }
interface AvailableRoom   { _id: string; roomNo: string; roomType: string; floor: string; pricePerNight: number; status: string }
interface AvailableCard   { _id: string; cardNo: string; cardType: string; status: string }
interface AvailableCaddy  { _id: string; name: string; level: string; rating?: number; status: string }
interface AvailableCart    { _id: string; cartNumber?: string; brand?: string; status?: string; name?: string }

const LOCKER_STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  available:   { bg: 'bg-emerald-50',  border: 'border-emerald-300', text: 'text-emerald-700' },
  occupied:    { bg: 'bg-red-50',      border: 'border-red-300',     text: 'text-red-600' },
  maintenance: { bg: 'bg-gray-100',    border: 'border-gray-300',    text: 'text-gray-400' },
}

const ROOM_TYPE_MAP: Record<string, string> = { standard: '标间', deluxe: '豪华', suite: '套房' }

function CheckInDialog({ booking, onClose, onSuccess }: CheckInDialogProps) {
  const existing = booking.assignedResources

  // ── 资源选择状态 ───────────────────────────────────────────────────────────
  // 消费凭证
  const [consumeMode, setConsumeMode] = useState<'existing' | 'physical' | 'virtual'>('existing')
  const [selectedCardId, setSelectedCardId] = useState('')
  // 住宿类型
  const [stayType, setStayType] = useState(booking.stayType || 'day')
  // 球车
  const [cartNo, setCartNo] = useState(existing?.cartNo || booking.cartNo || '')
  // 球童
  const [caddyId, setCaddyId] = useState(existing?.caddyId || booking.caddyId || '')
  const [caddyName, setCaddyName] = useState(existing?.caddyName || booking.caddyName || '')
  // 更衣柜
  const [selectedLockerIds, setSelectedLockerIds] = useState<string[]>([])
  // 客房
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [roomCheckIn, setRoomCheckIn] = useState(booking.date || '')
  const [roomCheckOut, setRoomCheckOut] = useState('')
  // 球包寄存
  const [needBag, setNeedBag] = useState(false)
  const [bagNo, setBagNo] = useState(existing?.bagStorage?.[0]?.bagNo || '')
  const [bagDesc, setBagDesc] = useState('')
  // 停车
  const [plateNo, setPlateNo] = useState(existing?.parking?.plateNo || '')
  const [companions, setCompanions] = useState<{ name: string; playerNo?: string }[]>([])
  const [companionSearch, setCompanionSearch] = useState('')
  const [companionResults, setCompanionResults] = useState<any[]>([])
  const [searchingCompanion, setSearchingCompanion] = useState(false)

  // ── 可用资源列表 ───────────────────────────────────────────────────────────
  const [availableLockers, setAvailableLockers] = useState<AvailableLocker[]>([])
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [availableCards, setAvailableCards] = useState<AvailableCard[]>([])
  const [availableCaddies, setAvailableCaddies] = useState<AvailableCaddy[]>([])
  const [availableCarts, setAvailableCarts] = useState<AvailableCart[]>([])
  const [saving, setSaving] = useState(false)
  const [resourceLoading, setResourceLoading] = useState(true)

  // 加载所有可用资源
  useEffect(() => {
    setResourceLoading(true)
    Promise.all([
      api.lockers.getList({ status: 'available', pageSize: 200 }).catch(() => ({ data: [] })),
      api.rooms.getList({ status: 'available', pageSize: 200 }).catch(() => ({ data: [] })),
      api.tempCards.getList({ status: 'available', cardType: 'physical' }).catch(() => ({ data: [] })),
      api.resources.caddies.getList({ status: 'available' }).catch(() => ({ data: [] })),
      api.resources.carts.getList({ status: 'active' }).catch(() => ({ data: [] })),
    ]).then(([lockersRes, roomsRes, cardsRes, caddiesRes, cartsRes]) => {
      setAvailableLockers((lockersRes as any).data || [])
      setAvailableRooms((roomsRes as any).data || [])
      setAvailableCards((cardsRes as any).data || [])
      setAvailableCaddies((caddiesRes as any).data || [])
      setAvailableCarts((cartsRes as any).data || [])
    }).finally(() => setResourceLoading(false))
  }, [])

  // 更衣柜选择切换
  const toggleLocker = (id: string) => {
    setSelectedLockerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // 搜索同行人
  const handleCompanionSearch = async (q: string) => {
    setCompanionSearch(q)
    if (!q || q.length < 1) { setCompanionResults([]); return }
    setSearchingCompanion(true)
    try {
      const res = await api.players.search({ q })
      setCompanionResults((res as any).data || [])
    } catch {
      setCompanionResults([])
    } finally {
      setSearchingCompanion(false)
    }
  }

  const addCompanion = (player: any) => {
    const already = companions.some(c => c.playerNo === player.playerNo || c.name === player.name)
    if (already) { toast.error('该同行人已添加'); return }
    setCompanions(prev => [...prev, { name: player.name || player.nickName || '', playerNo: player.playerNo || '' }])
    setCompanionSearch('')
    setCompanionResults([])
  }

  const removeCompanion = (idx: number) => {
    setCompanions(prev => prev.filter((_, i) => i !== idx))
  }

  // 球童选择
  const handleCaddySelect = (caddy: AvailableCaddy) => {
    if (caddyId === caddy._id) {
      setCaddyId('')
      setCaddyName('')
    } else {
      setCaddyId(caddy._id)
      setCaddyName(caddy.name)
    }
  }

  // ── 提交签到 ───────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setSaving(true)
    try {
      // 构建资源分配数据
      const resources: any = {}

      // 球车
      if (cartNo) resources.cartNo = cartNo

      // 球童
      if (caddyId) {
        resources.caddyId = caddyId
        resources.caddyName = caddyName
      }

      // 更衣柜
      if (selectedLockerIds.length > 0) {
        resources.lockers = selectedLockerIds.map(id => {
          const l = availableLockers.find(x => x._id === id)
          return { lockerId: id, lockerNo: l?.lockerNo || '', area: l?.area || '' }
        })
      }

      // 客房
      if (stayType !== 'day' && selectedRoomId) {
        const room = availableRooms.find(r => r._id === selectedRoomId)
        resources.rooms = [{
          roomId: selectedRoomId,
          roomNo: room?.roomNo || '',
          roomType: room?.roomType || '',
          checkInDate: roomCheckIn,
          checkOutDate: roomCheckOut,
          nights: roomCheckOut && roomCheckIn
            ? Math.max(1, Math.round((new Date(roomCheckOut).getTime() - new Date(roomCheckIn).getTime()) / 86400000))
            : 1,
        }]
      }

      // 球包寄存
      if (needBag && bagNo) {
        resources.bagStorage = [{ bagNo, location: '', description: bagDesc }]
      }

      // 停车
      if (plateNo || companions.length > 0) {
        resources.parking = {
          plateNo,
          companions: companions.map(c => `${c.name}${c.playerNo ? `(${c.playerNo})` : ''}`),
        }
      }

      // 临时消费卡
      if (consumeMode === 'physical' && selectedCardId) {
        resources.tempCardId = selectedCardId
        const card = availableCards.find(c => c._id === selectedCardId)
        resources.tempCardNo = card?.cardNo || ''
      } else if (consumeMode === 'virtual') {
        resources.generateTempCard = true
      }

      // 住宿类型
      resources.stayType = stayType

      // 调用 API
      if (Object.keys(resources).length > 0) {
        await api.bookings.updateResources(booking._id, resources)
      }
      await api.bookings.checkIn(booking._id)
      toast.success('签到成功')
      onSuccess()
      onClose()
    } catch {
      /* 拦截器处理 */
    } finally {
      setSaving(false)
    }
  }

  // ── 按区域分组更衣柜 ─────────────────────────────────────────────────────
  const lockersByArea = availableLockers.reduce<Record<string, AvailableLocker[]>>((acc, l) => {
    const key = l.area || '未分区'
    if (!acc[key]) acc[key] = []
    acc[key].push(l)
    return acc
  }, {})

  const playerInfo = booking.players?.[0]
  const hasExistingCard = playerInfo?.type === 'member'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">办理签到</h2>
            <p className="text-xs text-gray-400 mt-0.5">{booking.teeTime} · {booking.courseName} {booking.orderNo && `· ${booking.orderNo}`}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 1. 球员信息卡片 */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-3 flex-wrap">
              {booking.players?.map((p, i) => (
                <span key={i} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                  p.type === 'guest' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {p.name}{p.type === 'guest' ? '（嘉宾）' : '（会员）'}
                </span>
              ))}
              <span className="text-xs text-gray-400 ml-auto">{booking.playerCount}人</span>
            </div>
            {playerInfo && (
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                {(playerInfo as any).playerNo && <span>球员号：{(playerInfo as any).playerNo}</span>}
                {(playerInfo as any).phone && <span>手机：{(playerInfo as any).phone}</span>}
                {(playerInfo as any).memberId && <span>会员卡：{(playerInfo as any).memberId}</span>}
              </div>
            )}
          </div>

          {/* 2. 消费凭证 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <CreditCard size={14} /> 消费凭证
            </h3>
            <div className="flex gap-2">
              <button onClick={() => setConsumeMode('existing')}
                className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${consumeMode === 'existing' ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {hasExistingCard ? '已有会员卡' : '无需消费卡'}
              </button>
              <button onClick={() => setConsumeMode('physical')}
                className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${consumeMode === 'physical' ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                发放实体卡
              </button>
              <button onClick={() => setConsumeMode('virtual')}
                className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${consumeMode === 'virtual' ? 'bg-purple-50 border-purple-400 text-purple-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <span className="flex items-center justify-center gap-1"><Zap size={12} />系统生成</span>
              </button>
            </div>
            {consumeMode === 'physical' && (
              <div className="mt-2">
                {availableCards.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">暂无可用实体卡，请先在资源管理中录入</p>
                ) : (
                  <select value={selectedCardId} onChange={e => setSelectedCardId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="">选择实体消费卡...</option>
                    {availableCards.map(c => (
                      <option key={c._id} value={c._id}>{c.cardNo}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {consumeMode === 'virtual' && (
              <p className="text-xs text-purple-500 mt-2 bg-purple-50 rounded-lg px-3 py-2">
                签到后系统将自动生成临时消费卡号
              </p>
            )}
          </section>

          {/* 3. 住宿类型 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <DoorOpen size={14} /> 住宿类型
            </h3>
            <div className="flex gap-2">
              {[
                { value: 'day',         label: '日归' },
                { value: 'overnight_1', label: '一晚' },
                { value: 'overnight_2', label: '两晚' },
                { value: 'overnight_3', label: '三晚' },
                { value: 'custom',      label: '自定义' },
              ].map(opt => (
                <button key={opt.value} onClick={() => setStayType(opt.value)}
                  className={`flex-1 py-2.5 text-xs rounded-lg border transition-all ${stayType === opt.value ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {/* 4. 球车 + 球童（并排） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 球车 */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Car size={14} /> 球车分配
              </h3>
              <select value={cartNo} onChange={e => setCartNo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">选择球车（可留空）</option>
                {availableCarts.map(c => (
                  <option key={c._id} value={c.cartNumber || c.name || ''}>
                    {c.cartNumber || c.name}{c.brand ? ` (${c.brand})` : ''}
                  </option>
                ))}
              </select>
              <input value={cartNo} onChange={e => setCartNo(e.target.value)}
                placeholder="或直接输入车号"
                className="w-full mt-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-300" />
            </section>

            {/* 球童 */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <UserCheck size={14} /> 球童分配
                {caddyName && <span className="text-xs text-emerald-600 font-normal ml-1">已选：{caddyName}</span>}
              </h3>
              {resourceLoading ? (
                <p className="text-xs text-gray-400 py-2">加载中...</p>
              ) : availableCaddies.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">当前无空闲球童</p>
              ) : (
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                  {availableCaddies.map(c => (
                    <button key={c._id} onClick={() => handleCaddySelect(c)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all ${
                        caddyId === c._id
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                          : 'border-gray-100 text-gray-600 hover:bg-gray-50'
                      }`}>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-gray-400">{c.level || '普通'}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* 5. 更衣柜可视化选择 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Lock size={14} /> 更衣柜分配
              {selectedLockerIds.length > 0 && (
                <span className="text-xs text-emerald-600 font-normal">
                  已选 {selectedLockerIds.length} 个
                </span>
              )}
            </h3>
            {resourceLoading ? (
              <p className="text-xs text-gray-400 py-2">加载中...</p>
            ) : Object.keys(lockersByArea).length === 0 ? (
              <p className="text-xs text-gray-400 py-2">暂无可用更衣柜，请先在资源管理中录入</p>
            ) : (
              <div className="space-y-3 max-h-36 overflow-y-auto pr-1">
                {Object.entries(lockersByArea).map(([area, items]) => (
                  <div key={area}>
                    <div className="text-[10px] text-gray-400 mb-1">{area}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.sort((a, b) => a.lockerNo.localeCompare(b.lockerNo)).map(l => {
                        const selected = selectedLockerIds.includes(l._id)
                        return (
                          <button key={l._id} onClick={() => toggleLocker(l._id)}
                            className={`w-14 h-10 rounded-lg border-2 text-[11px] font-bold transition-all flex flex-col items-center justify-center ${
                              selected
                                ? 'bg-blue-500 border-blue-600 text-white shadow-md scale-105'
                                : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:border-blue-400 hover:bg-blue-50'
                            }`}>
                            {l.lockerNo}
                            {l.dailyFee > 0 && <span className="text-[8px] opacity-70">¥{l.dailyFee}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 6. 客房分配（两球一晚 / 仅住宿时显示） */}
          {stayType !== 'day' && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <DoorOpen size={14} /> 客房分配
              </h3>
              {availableRooms.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">暂无空闲客房</p>
              ) : (
                <>
                  <select value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="">选择客房...</option>
                    {availableRooms.map(r => (
                      <option key={r._id} value={r._id}>
                        {r.roomNo} - {ROOM_TYPE_MAP[r.roomType] || r.roomType} ({r.floor}) ¥{r.pricePerNight}/晚
                      </option>
                    ))}
                  </select>
                  {selectedRoomId && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">入住日期</label>
                        <input type="date" value={roomCheckIn} onChange={e => setRoomCheckIn(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">退房日期</label>
                        <input type="date" value={roomCheckOut} onChange={e => setRoomCheckOut(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* 7. 球包寄存 */}
          <section>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={needBag} onChange={e => setNeedBag(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Package size={14} /> 需要寄存球包
              </span>
            </label>
            {needBag && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <input value={bagNo} onChange={e => setBagNo(e.target.value)}
                    placeholder="寄存编号（如 B-025）"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <input value={bagDesc} onChange={e => setBagDesc(e.target.value)}
                    placeholder="球包描述（可选）"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
            )}
          </section>

          {/* 8. 停车信息 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <ParkingCircle size={14} /> 停车信息
            </h3>
            <input value={plateNo} onChange={e => setPlateNo(e.target.value)}
              placeholder="车牌号（可留空）"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />

            {/* 同行人 */}
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium text-gray-600">同行人</span>
                {companions.length > 0 && (
                  <span className="text-[10px] text-gray-400">({companions.length}人)</span>
                )}
              </div>
              {/* 已添加的同行人 */}
              {companions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {companions.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                      {c.name}{c.playerNo ? `(${c.playerNo})` : ''}
                      <button onClick={() => removeCompanion(i)} className="ml-0.5 hover:text-red-500 transition-colors">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* 搜索添加 */}
              <div className="relative">
                <div className="flex items-center gap-1">
                  <Search size={13} className="text-gray-400 absolute left-2.5 pointer-events-none" />
                  <input value={companionSearch} onChange={e => handleCompanionSearch(e.target.value)}
                    placeholder="搜索球员姓名/编号添加同行人..."
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                </div>
                {/* 搜索结果下拉 */}
                {companionSearch && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-32 overflow-y-auto">
                    {searchingCompanion ? (
                      <div className="px-3 py-2 text-xs text-gray-400">搜索中...</div>
                    ) : companionResults.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">未找到匹配的球员</div>
                    ) : (
                      companionResults.map((p: any) => (
                        <button key={p._id || p.playerNo} onClick={() => addCompanion(p)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 transition-colors text-left">
                          <span className="font-medium text-gray-700">{p.name || p.nickName}</span>
                          <span className="text-gray-400">{p.playerNo || ''}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            取消
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-semibold">
            {saving ? '处理中...' : '确认签到'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 收银台弹窗（Folio 版） ──────────────────────────────────────────────────

interface CashierDialogProps {
  booking:   Booking
  onClose:   () => void
  onSuccess: () => void
}

const CHARGE_TYPE_LABELS: Record<string, string> = {
  green_fee: '果岭费', caddy_fee: '球童费', cart_fee: '球车费',
  insurance: '保险费', locker_daily: '更衣柜', room: '客房费',
  dining: '餐饮', proshop: '球具店', minibar: '迷你吧', other: '其他',
}

function CashierDialog({ booking, onClose, onSuccess }: CashierDialogProps) {
  const folioId = booking.assignedResources?.folioId
  const [folioData, setFolioData] = useState<any>(null)
  const [loadingFolio, setLoadingFolio] = useState(true)
  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // 加载 Folio 数据（charges + payments）
  useEffect(() => {
    const load = async () => {
      setLoadingFolio(true)
      try {
        if (folioId) {
          const res: any = await api.folios.getDetail(folioId)
          setFolioData(res.data)
          const bal = res.data?.balance ?? 0
          setPayAmount(String(Math.max(0, bal)))
        } else {
          // 无 Folio 时回退到 booking.pricing
          const p = booking.pricing || {} as Pricing
          const pending = p.pendingFee ?? (p.totalFee - (p.paidFee || 0))
          setPayAmount(String(Math.max(0, pending || booking.totalFee || 0)))
        }
      } catch { /* fallback */ }
      setLoadingFolio(false)
    }
    load()
  }, [folioId, booking])

  const charges  = (folioData?.charges || []).filter((c: any) => c.status === 'posted')
  const payments = folioData?.payments || []
  const totalCharges  = folioData?.totalCharges  ?? (booking.pricing?.totalFee || booking.totalFee || 0)
  const totalPayments = folioData?.totalPayments ?? (booking.pricing?.paidFee || 0)
  const balance       = folioData?.balance       ?? Math.max(0, totalCharges - totalPayments)

  // 冲销某项消费
  const handleVoid = async (chargeId: string) => {
    if (!folioId) return
    try {
      await api.folios.voidCharge(folioId, chargeId, { reason: '前台冲销' })
      const res: any = await api.folios.getDetail(folioId)
      setFolioData(res.data)
      toast.success('已冲销')
    } catch { /* 拦截器 */ }
  }

  const handleConfirm = async () => {
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) { toast.error('请输入有效的收款金额'); return }
    setSaving(true)
    try {
      if (folioId) {
        // Folio 路径：收款 → 结算 → 完赛
        await api.folios.addPayment(folioId, { amount: amt, payMethod, note })
        await api.folios.settle(folioId, { force: true })
      }
      // 同步到 booking 旧字段（兼容）
      await api.bookings.pay(booking._id, { amount: amt, payMethod, note })
      await api.bookings.complete(booking._id)
      toast.success('收款并标记完赛成功')
      onSuccess()
      onClose()
    } catch { /* 拦截器 */ }
    finally { setSaving(false) }
  }

  // 只收款不完赛
  const handlePayOnly = async () => {
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) { toast.error('请输入有效的收款金额'); return }
    setSaving(true)
    try {
      if (folioId) {
        await api.folios.addPayment(folioId, { amount: amt, payMethod, note })
        const res: any = await api.folios.getDetail(folioId)
        setFolioData(res.data)
        setPayAmount(String(Math.max(0, res.data?.balance || 0)))
      }
      await api.bookings.pay(booking._id, { amount: amt, payMethod, note })
      toast.success(`收款 ¥${amt} 成功`)
    } catch { /* 拦截器 */ }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-gray-900">结算工作台</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {booking.orderNo && <span className="mr-2">{booking.orderNo}</span>}
              {booking.teeTime} · {booking.courseName}
              {folioData?.folioNo && <span className="ml-2 text-emerald-600">Folio#{folioData.folioNo}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 球员 */}
          <div className="flex flex-wrap gap-1.5">
            {booking.players?.map((pl, i) => (
              <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                pl.type === 'guest' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {pl.name}{pl.type === 'guest' ? '（嘉宾）' : ''}
              </span>
            ))}
          </div>

          {/* Folio 消费明细 */}
          {loadingFolio ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">加载账单...</div>
          ) : (
            <div className="bg-gray-50 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">消费明细</span>
                <span className="text-xs text-gray-400">{charges.length} 项</span>
              </div>
              {charges.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {charges.map((c: any) => (
                    <div key={c._id} className="flex items-center justify-between px-4 py-2.5 group">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700">{c.description || CHARGE_TYPE_LABELS[c.chargeType] || c.chargeType}</div>
                        <div className="text-[11px] text-gray-400">
                          {CHARGE_TYPE_LABELS[c.chargeType] || c.chargeType}
                          {c.chargeSource ? ` · ${c.chargeSource}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">¥{c.amount}</span>
                        <button onClick={() => handleVoid(c._id)}
                          className="opacity-0 group-hover:opacity-100 text-[11px] text-red-400 hover:text-red-600 transition-all px-1">
                          冲销
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  {folioId ? '暂无消费记录' : '未创建 Folio，显示预订费用'}
                </div>
              )}

              {/* 汇总 */}
              <div className="flex justify-between items-center px-4 py-3 bg-gray-100">
                <span className="text-sm font-semibold text-gray-800">消费合计</span>
                <span className="text-lg font-bold text-gray-900">¥{totalCharges}</span>
              </div>
              {totalPayments > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-gray-500">已付</span>
                  <span className="text-emerald-600 font-medium">¥{totalPayments}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-4 py-3 bg-orange-50">
                <span className="text-sm font-semibold text-orange-700">待收</span>
                <span className="text-xl font-bold text-orange-600">¥{Math.max(0, balance)}</span>
              </div>
            </div>
          )}

          {/* 本次收款金额 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">本次收款金额（元）</label>
            <input
              type="number" min="0" step="0.01"
              value={payAmount} onChange={e => setPayAmount(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 text-right"
            />
          </div>

          {/* 收款方式 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">收款方式</label>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.value} onClick={() => setPayMethod(m.value)}
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all ${
                    payMethod === m.value
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">备注（可选）</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="如：部分预付、挂账等"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>

          {/* 历史支付记录 */}
          {payments.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">支付记录</label>
              <div className="space-y-1">
                {payments.map((pay: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <span>{pay.payMethodName || PAY_METHODS.find(m => m.value === pay.payMethod)?.label || pay.payMethod}</span>
                    <span className="font-medium text-gray-700">¥{pay.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            取消
          </button>
          <button onClick={handlePayOnly} disabled={saving}
            className="flex-1 px-4 py-2 border border-emerald-400 text-emerald-700 text-sm rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors font-medium">
            仅收款
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-semibold">
            {saving ? '处理中...' : `收款并完赛`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 取消确认弹窗 ─────────────────────────────────────────────────────────────

interface CancelDialogProps {
  booking:   Booking
  onClose:   () => void
  onSuccess: () => void
}

function CancelDialog({ booking, onClose, onSuccess }: CancelDialogProps) {
  const [cancelNote, setCancelNote] = useState('')
  const [saving,     setSaving]     = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await api.bookings.cancel(booking._id, cancelNote || undefined)
      toast.success('预订已取消')
      onSuccess()
      onClose()
    } catch {
      /* 拦截器处理 */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-5">
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">⚠️</div>
            <h2 className="font-semibold text-gray-900 text-lg">确认取消预订？</h2>
            <p className="text-sm text-gray-500 mt-1">
              {booking.teeTime} · {booking.courseName} · {booking.playerCount}人
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">取消原因（可选）</label>
            <input value={cancelNote} onChange={e => setCancelNote(e.target.value)}
              placeholder="如：客户临时有事"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            不取消
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors font-medium">
            {saving ? '处理中...' : '确认取消'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function TeeSheet({ onNewBooking, onStatusChange }: Props) {
  const today = formatDate(new Date())
  const [date,     setDate]     = useState(today)
  const [courseId, setCourseId] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [courses,  setCourses]  = useState<Course[]>([])
  const [loading,  setLoading]  = useState(false)

  // 弹窗状态
  const [checkInTarget,  setCheckInTarget]  = useState<Booking | null>(null)
  const [cashierTarget,  setCashierTarget]  = useState<Booking | null>(null)
  const [cancelTarget,   setCancelTarget]   = useState<Booking | null>(null)

  // 加载球场列表
  useEffect(() => {
    api.resources.courses.getList({ status: 'active' }).then((res: any) => {
      const list = res.data || []
      setCourses(list)
      if (list.length > 0 && !courseId) setCourseId(list[0]._id)
    })
  }, [])

  // 加载发球表
  const load = () => {
    if (!date) return
    setLoading(true)
    api.bookings.getTeeSheet({ date, courseId: courseId || undefined })
      .then((res: any) => { setBookings(res.data || []) })
      .catch(() => toast.error('加载发球表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [date, courseId])

  // 弹窗操作成功后
  const handleSuccess = () => {
    load()
    onStatusChange()
  }

  // 按时间排序
  const sorted = [...bookings].sort((a, b) => a.teeTime.localeCompare(b.teeTime))

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* 日期导航 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setDate(formatDate(addDays(new Date(date), -1)))}
            className="p-1.5 rounded hover:bg-white transition-colors text-gray-600"><ChevronLeft size={16} /></button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-2 py-1 bg-transparent text-sm font-medium text-gray-800 focus:outline-none" />
          <button onClick={() => setDate(formatDate(addDays(new Date(date), 1)))}
            className="p-1.5 rounded hover:bg-white transition-colors text-gray-600"><ChevronRight size={16} /></button>
        </div>

        {/* 今日快捷 */}
        {date !== today && (
          <button onClick={() => setDate(today)}
            className="px-3 py-1.5 text-xs text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
            今天
          </button>
        )}

        {/* 球场选择 */}
        {courses.length > 1 && (
          <select value={courseId} onChange={e => setCourseId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
            <option value="">全部球场</option>
            {courses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}

        {/* 新增按钮 */}
        <button onClick={() => onNewBooking(date)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
          <Plus size={15} /> 新增预订
        </button>
      </div>

      {/* 日期显示 */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="font-semibold text-gray-800">{formatDisplay(date)}</h3>
        <span className="text-sm text-gray-400">{sorted.length} 组预订</span>
      </div>

      {/* 发球表内容 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <div className="text-4xl mb-3">⛳</div>
          <p className="text-sm">当天暂无预订</p>
          <button onClick={() => onNewBooking(date)}
            className="mt-4 px-5 py-2 bg-emerald-600 text-white text-sm rounded-full hover:bg-emerald-700 transition-colors">
            新增预订
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(b => {
            const s = STATUS_MAP[b.status] || STATUS_MAP.pending
            const pricing = b.pricing || {} as Pricing
            const pendingFee = pricing.pendingFee ?? (pricing.totalFee - (pricing.paidFee || 0))
            const res = b.assignedResources

            return (
              <div key={b._id} className={`border rounded-xl p-4 transition-all ${s.card}`}>
                <div className="flex items-start justify-between gap-4">
                  {/* 左侧：时间 + 主要信息 */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    {/* 时间 */}
                    <div className="flex-shrink-0 text-center w-14">
                      <div className="text-xl font-bold text-gray-800 leading-none">{b.teeTime}</div>
                      <div className="text-xs text-gray-400 mt-1">{b.courseName}</div>
                      {b.orderNo && (
                        <div className="text-[10px] text-gray-300 mt-0.5 leading-tight">{b.orderNo}</div>
                      )}
                    </div>

                    {/* 球员 + 资源 */}
                    <div className="min-w-0 flex-1">
                      {/* 球员名单 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {b.players?.map((p, i) => (
                          <span key={i} className={`text-sm font-medium ${p.type === 'guest' ? 'text-purple-700' : 'text-gray-800'}`}>
                            {p.name}{p.type === 'guest' ? '（嘉）' : ''}
                          </span>
                        ))}
                        <span className="text-xs text-gray-400">{b.playerCount}人</span>
                      </div>

                      {/* 资源信息 */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        {(res?.caddyName || b.caddyName) && (
                          <span>球童：{res?.caddyName || b.caddyName}</span>
                        )}
                        {(res?.cartNo || b.cartNo) && (
                          <span className={b.status === 'checked_in' ? 'text-blue-600 font-medium' : ''}>
                            球车：{res?.cartNo || b.cartNo}
                          </span>
                        )}
                        {res?.lockers?.[0]?.lockerNo && (
                          <span className="text-blue-600">柜：{res.lockers.map(l => l.lockerNo).join(',')}</span>
                        )}
                        {res?.rooms?.[0]?.roomNo && (
                          <span className="text-purple-600">房：{res.rooms[0].roomNo}</span>
                        )}
                        {res?.tempCardNo && (
                          <span className="text-orange-600">卡：{res.tempCardNo}</span>
                        )}
                        {res?.bagStorage?.[0]?.bagNo && (
                          <span>球包：{res.bagStorage[0].bagNo}</span>
                        )}
                        {/* 费用显示 */}
                        {(pricing.totalFee || b.totalFee) > 0 && (
                          <span className={pendingFee > 0 ? 'text-orange-600 font-medium' : 'text-emerald-600 font-medium'}>
                            {pendingFee > 0
                              ? `待付 ¥${Math.max(0, pendingFee)}`
                              : `已付 ¥${pricing.paidFee || b.totalFee}`
                            }
                          </span>
                        )}
                        {b.note && (
                          <span className="text-gray-400 truncate max-w-[160px]">备注：{b.note}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 右侧：状态 + 操作 */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-2">
                    {/* 状态标签 */}
                    <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white/70 ${s.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>

                    {/* 操作按钮 */}
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {/* 待确认 → 确认 */}
                      {b.status === 'pending' && (
                        <button
                          onClick={async () => {
                            try {
                              await api.bookings.confirm(b._id)
                              toast.success('已确认预订')
                              handleSuccess()
                            } catch { /* 拦截器处理 */ }
                          }}
                          className="px-2.5 py-1 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                          确认
                        </button>
                      )}

                      {/* 已确认 → 签到（打开弹窗） */}
                      {b.status === 'confirmed' && (
                        <button onClick={() => setCheckInTarget(b)}
                          className="px-2.5 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
                          签到
                        </button>
                      )}

                      {/* 已签到 → 完赛（打开收银台） */}
                      {b.status === 'checked_in' && (
                        <button onClick={() => setCashierTarget(b)}
                          className="px-2.5 py-1 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                          完赛结账
                        </button>
                      )}

                      {/* 取消按钮（确认/待确认状态可取消） */}
                      {(b.status === 'confirmed' || b.status === 'pending') && (
                        <button onClick={() => setCancelTarget(b)}
                          className="px-2.5 py-1 text-xs bg-white text-red-400 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                          取消
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 签到弹窗 */}
      {checkInTarget && (
        <CheckInDialog
          booking={checkInTarget}
          onClose={() => setCheckInTarget(null)}
          onSuccess={handleSuccess}
        />
      )}

      {/* 收银台弹窗 */}
      {cashierTarget && (
        <CashierDialog
          booking={cashierTarget}
          onClose={() => setCashierTarget(null)}
          onSuccess={handleSuccess}
        />
      )}

      {/* 取消确认弹窗 */}
      {cancelTarget && (
        <CancelDialog
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
