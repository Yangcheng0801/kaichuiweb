import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, X, CreditCard, Wallet, QrCode, Banknote, Building2, Search, Lock, DoorOpen, ParkingCircle, ChevronDown, Shield, Sparkles, Check, Edit2 } from 'lucide-react'
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
  stayType?:      string
  needCaddy?:     boolean
  needCart?:       boolean
  bookingSource?: string
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

// ─── 签到工作台弹窗（v2 — 职责分离版） ────────────────────────────────────────
// 前台签到核心：确认身份 → 发消费凭证 → 分配更衣柜 → 确认住宿/客房 → 完成
// 球车/球童/球包寄存由出发台调度，不在此处处理

interface CheckInDialogProps {
  booking:  Booking
  onClose:  () => void
  onSuccess: () => void
}

interface AvailableLocker { _id: string; lockerNo: string; area: string; size: string; dailyFee: number; status: string }
interface AvailableRoom   { _id: string; roomNo: string; roomType: string; floor: string; pricePerNight: number; status: string }
interface AvailableCard   { _id: string; cardNo: string; cardType: string; status: string }

const ROOM_TYPE_MAP: Record<string, string> = { standard: '标间', deluxe: '豪华', suite: '套房' }

function CheckInDialog({ booking, onClose, onSuccess }: CheckInDialogProps) {
  const existing = booking.assignedResources

  // ── 状态 ───────────────────────────────────────────────────────────────────
  const [consumeMode, setConsumeMode] = useState<'qr_scan' | 'physical' | 'temp' | 'courtesy'>('temp')
  const [selectedCardId, setSelectedCardId] = useState('')
  const [qrInput, setQrInput] = useState('')
  const [qrPlayer, setQrPlayer] = useState<any>(null)
  const [qrSearching, setQrSearching] = useState(false)
  const [courtesyHost, setCourtesyHost] = useState('')
  const [courtesyReason, setCourtesyReason] = useState('')

  const [stayType, setStayType] = useState(booking.stayType || 'day')
  const [editStayType, setEditStayType] = useState(false)

  const [selectedLockerIds, setSelectedLockerIds] = useState<string[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [roomCheckIn, setRoomCheckIn] = useState(booking.date || '')
  const [roomCheckOut, setRoomCheckOut] = useState('')

  const [plateNo, setPlateNo] = useState(existing?.parking?.plateNo || '')
  const [showMoreInfo, setShowMoreInfo] = useState(false)

  const [availableLockers, setAvailableLockers] = useState<AvailableLocker[]>([])
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [availableCards, setAvailableCards] = useState<AvailableCard[]>([])
  const [saving, setSaving] = useState(false)
  const [resourceLoading, setResourceLoading] = useState(true)

  const playerInfo = booking.players?.[0]
  const isMember = playerInfo?.type === 'member' && playerInfo?.memberId
  const needCaddy = booking.needCaddy
  const needCart = booking.needCart

  // 根据球员身份自动选择消费凭证模式
  useEffect(() => {
    if (isMember) setConsumeMode('qr_scan')
    else setConsumeMode('temp')
  }, [isMember])

  useEffect(() => {
    setResourceLoading(true)
    Promise.all([
      api.lockers.getList({ status: 'available', pageSize: 200 }).catch(() => ({ data: [] })),
      api.rooms.getList({ status: 'available', pageSize: 200 }).catch(() => ({ data: [] })),
      api.tempCards.getList({ status: 'available', cardType: 'physical' }).catch(() => ({ data: [] })),
    ]).then(([lockersRes, roomsRes, cardsRes]) => {
      setAvailableLockers((lockersRes as any).data || [])
      setAvailableRooms((roomsRes as any).data || [])
      setAvailableCards((cardsRes as any).data || [])
    }).finally(() => setResourceLoading(false))
  }, [])

  const toggleLocker = (id: string) => {
    setSelectedLockerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const autoAssignLockers = () => {
    const count = booking.playerCount || booking.players?.length || 1
    const needed = count - selectedLockerIds.length
    if (needed <= 0) { toast.info('已分配足够柜位'); return }
    const free = availableLockers.filter(l => !selectedLockerIds.includes(l._id))
    const toAdd = free.slice(0, needed).map(l => l._id)
    if (toAdd.length === 0) { toast.error('可用柜位不足'); return }
    setSelectedLockerIds(prev => [...prev, ...toAdd])
    toast.success(`已自动分配 ${toAdd.length} 个柜位`)
  }

  // 二维码搜索
  const qrTimer = useCallback(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    return (val: string) => {
      setQrInput(val)
      setQrPlayer(null)
      if (timer) clearTimeout(timer)
      if (val.length < 3) return
      timer = setTimeout(async () => {
        setQrSearching(true)
        try {
          const res = await (api as any).players.search({ q: val, clubId: 'default' })
          const list = (res as any).data || []
          if (list.length > 0) setQrPlayer(list[0])
        } catch {} finally { setQrSearching(false) }
      }, 400)
    }
  }, [])
  const [handleQrSearch] = useState(qrTimer)

  // ── 提交签到 ───────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (consumeMode === 'courtesy' && !courtesyHost.trim()) {
      toast.error('接待免账需填写接待人'); return
    }
    setSaving(true)
    try {
      const resources: any = { stayType }

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
          roomId: selectedRoomId, roomNo: room?.roomNo || '',
          roomType: room?.roomType || '', checkInDate: roomCheckIn, checkOutDate: roomCheckOut,
          nights: roomCheckOut && roomCheckIn
            ? Math.max(1, Math.round((new Date(roomCheckOut).getTime() - new Date(roomCheckIn).getTime()) / 86400000))
            : 1,
        }]
      }

      // 停车
      if (plateNo) resources.parking = { plateNo }

      // 消费凭证
      if (consumeMode === 'qr_scan' && qrPlayer) {
        resources.qrPlayerId = qrPlayer._id
        resources.qrCode = qrInput
      } else if (consumeMode === 'physical' && selectedCardId) {
        resources.tempCardId = selectedCardId
        const card = availableCards.find(c => c._id === selectedCardId)
        resources.tempCardNo = card?.cardNo || ''
      } else if (consumeMode === 'temp') {
        resources.generateTempCard = true
      } else if (consumeMode === 'courtesy') {
        resources.generateTempCard = true
        resources.accountType = 'courtesy'
        resources.courtesy = { host: courtesyHost.trim(), reason: courtesyReason.trim() }
      }

      if (Object.keys(resources).length > 0) {
        await (api as any).bookings.updateResources(booking._id, resources)
      }
      await (api as any).bookings.checkIn(booking._id)
      toast.success('签到成功')
      onSuccess()
      onClose()
    } catch {} finally { setSaving(false) }
  }

  // 按区域分组更衣柜
  const lockersByArea = availableLockers.reduce<Record<string, AvailableLocker[]>>((acc, l) => {
    const key = l.area || '未分区'
    if (!acc[key]) acc[key] = []
    acc[key].push(l)
    return acc
  }, {})

  const STAY_LABELS: Record<string, string> = {
    day: '日归', overnight_1: '一晚', overnight_2: '两晚', overnight_3: '三晚', custom: '自定义',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">办理签到</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {booking.teeTime} · {booking.courseName} {booking.orderNo && `· ${booking.orderNo}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 1. 球员信息 */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-2 flex-wrap">
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
              </div>
            )}
            {/* 预订偏好标签 */}
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${needCaddy ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                {needCaddy ? '需要球童' : '无需球童'}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${needCart ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                {needCart ? '需要球车' : '无需球车'}
              </span>
              <span className="text-[10px] text-gray-300 ml-1">（由出发台调度）</span>
            </div>
          </div>

          {/* 2. 消费凭证（4 种模式） */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <CreditCard size={14} /> 消费凭证
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { key: 'qr_scan'  as const, label: '扫码识别', icon: <QrCode size={13} />,     active: 'bg-blue-50 border-blue-400 text-blue-700' },
                { key: 'physical' as const, label: '刷实体卡', icon: <CreditCard size={13} />, active: 'bg-blue-50 border-blue-400 text-blue-700' },
                { key: 'temp'     as const, label: '临时发卡', icon: <Sparkles size={13} />,   active: 'bg-purple-50 border-purple-400 text-purple-700' },
                { key: 'courtesy' as const, label: '接待免账', icon: <Shield size={13} />,     active: 'bg-amber-50 border-amber-400 text-amber-700' },
              ]).map(opt => (
                <button key={opt.key} onClick={() => setConsumeMode(opt.key)}
                  className={`py-2 text-[11px] rounded-lg border transition-all flex flex-col items-center gap-1 ${
                    consumeMode === opt.key
                      ? `${opt.active} font-medium`
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 扫码识别 */}
            {consumeMode === 'qr_scan' && (
              <div className="mt-2.5">
                <div className="relative">
                  <QrCode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input value={qrInput} onChange={e => handleQrSearch(e.target.value)}
                    placeholder="扫描/输入消费二维码或球员号..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  {qrSearching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-300 animate-pulse">识别中...</span>}
                </div>
                {qrPlayer && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-200 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {qrPlayer.name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800">{qrPlayer.name}</p>
                      <p className="text-[10px] text-emerald-600">
                        #{qrPlayer.playerNo}
                        {qrPlayer.profile?.memberLevelLabel && ` · ${qrPlayer.profile.memberLevelLabel}`}
                        {(qrPlayer.profile?.account?.balance ?? 0) > 0 && ` · 余额¥${qrPlayer.profile.account.balance}`}
                      </p>
                    </div>
                    <Check size={16} className="text-emerald-500 flex-shrink-0" />
                  </div>
                )}
                {qrInput.length >= 3 && !qrSearching && !qrPlayer && (
                  <p className="text-xs text-red-400 mt-1.5">未找到匹配的球员，请确认二维码或球员号</p>
                )}
              </div>
            )}

            {/* 刷实体卡 */}
            {consumeMode === 'physical' && (
              <div className="mt-2.5">
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

            {/* 临时发卡 */}
            {consumeMode === 'temp' && (
              <p className="text-xs text-purple-500 mt-2.5 bg-purple-50 rounded-lg px-3 py-2">
                签到后系统将自动生成临时消费卡号，用于场内挂账消费
              </p>
            )}

            {/* 接待免账 */}
            {consumeMode === 'courtesy' && (
              <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <p className="text-xs text-amber-700">接待模式：费用挂球会接待科目，客人无需付费。仍需绑定消费凭证以跟踪场内记录。</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={courtesyHost} onChange={e => setCourtesyHost(e.target.value)}
                    placeholder="接待人（必填）" required
                    className="px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                  <input value={courtesyReason} onChange={e => setCourtesyReason(e.target.value)}
                    placeholder="接待原因（如：商务洽谈）"
                    className="px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
                </div>
              </div>
            )}
          </section>

          {/* 3. 住宿类型（只读回填，可展开编辑） */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <DoorOpen size={14} /> 住宿
                <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${
                  stayType === 'day' ? 'bg-gray-100 text-gray-500' : 'bg-emerald-100 text-emerald-700'
                }`}>{STAY_LABELS[stayType] || stayType}</span>
              </h3>
              <button type="button" onClick={() => setEditStayType(p => !p)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <Edit2 size={11} /> {editStayType ? '收起' : '修改'}
              </button>
            </div>
            {editStayType && (
              <div className="flex gap-1.5 mt-2">
                {Object.entries(STAY_LABELS).map(([val, label]) => (
                  <button key={val} onClick={() => setStayType(val)}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-all ${
                      stayType === val
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>{label}</button>
                ))}
              </div>
            )}
          </section>

          {/* 4. 更衣柜分配 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Lock size={14} /> 更衣柜
                {selectedLockerIds.length > 0 && (
                  <span className="text-xs text-emerald-600 font-normal">已选 {selectedLockerIds.length} 个</span>
                )}
              </h3>
              <button type="button" onClick={autoAssignLockers}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors">
                <Sparkles size={11} /> 自动分配
              </button>
            </div>
            {resourceLoading ? (
              <p className="text-xs text-gray-400 py-2">加载中...</p>
            ) : Object.keys(lockersByArea).length === 0 ? (
              <p className="text-xs text-gray-400 py-2">暂无可用更衣柜</p>
            ) : (
              <div className="space-y-2.5 max-h-32 overflow-y-auto pr-1">
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

          {/* 5. 客房分配（仅住宿时显示） */}
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

          {/* 6. 更多信息（可折叠：停车） */}
          <section>
            <button type="button" onClick={() => setShowMoreInfo(p => !p)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors w-full">
              <ChevronDown size={14} className={`transition-transform ${showMoreInfo ? 'rotate-180' : ''}`} />
              更多信息
              {plateNo && !showMoreInfo && (
                <span className="text-xs text-gray-300 font-normal">车牌：{plateNo}</span>
              )}
            </button>
            {showMoreInfo && (
              <div className="mt-2.5 space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1.5">
                    <ParkingCircle size={12} /> 车牌号
                  </label>
                  <input value={plateNo} onChange={e => setPlateNo(e.target.value)}
                    placeholder="车牌号（可留空）"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
            )}
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
