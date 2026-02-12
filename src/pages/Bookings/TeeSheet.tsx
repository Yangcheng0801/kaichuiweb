import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, X, CreditCard, Wallet, QrCode, Banknote, Building2 } from 'lucide-react'
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
  players:     { name: string; type: string }[]
  playerCount: number
  caddyName:   string
  cartNo:      string
  totalFee:    number
  pricing:     Pricing
  payments:    any[]
  status:      string
  note:        string
  version:     number
  assignedResources?: {
    caddyId:    string | null
    caddyName:  string
    cartId:     string | null
    cartNo:     string
    lockers:    { lockerNo: string; area?: string }[]
    rooms:      { roomNo: string; type?: string }[]
    bagStorage: { bagNo: string; location?: string }[]
    parking:    { plateNo: string; companions?: string[] } | null
  }
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

// ─── 签到弹窗 ─────────────────────────────────────────────────────────────────

interface CheckInDialogProps {
  booking:  Booking
  onClose:  () => void
  onSuccess: () => void
}

function CheckInDialog({ booking, onClose, onSuccess }: CheckInDialogProps) {
  const existing = booking.assignedResources
  const [cartNo,    setCartNo]    = useState(existing?.cartNo    || booking.cartNo || '')
  const [lockerNo,  setLockerNo]  = useState(existing?.lockers?.[0]?.lockerNo  || '')
  const [bagNo,     setBagNo]     = useState(existing?.bagStorage?.[0]?.bagNo  || '')
  const [saving,    setSaving]    = useState(false)

  const handleConfirm = async () => {
    setSaving(true)
    try {
      // 更新资源分配
      const resources: any = {}
      if (cartNo)   resources.cartNo = cartNo
      if (lockerNo) resources.lockers    = [{ lockerNo }]
      if (bagNo)    resources.bagStorage = [{ bagNo }]

      if (Object.keys(resources).length > 0) {
        await api.bookings.updateResources(booking._id, resources)
      }
      // 签到（改状态）
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">办理签到</h2>
            <p className="text-xs text-gray-400 mt-0.5">{booking.teeTime} · {booking.courseName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 球员信息 */}
          <div className="flex flex-wrap gap-1.5">
            {booking.players?.map((p, i) => (
              <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                p.type === 'guest' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {p.name}{p.type === 'guest' ? '（嘉宾）' : ''}
              </span>
            ))}
          </div>

          {/* 资源分配 */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">球车号</label>
              <input value={cartNo} onChange={e => setCartNo(e.target.value)}
                placeholder="输入球车号（如：A01）"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">更衣柜号</label>
              <input value={lockerNo} onChange={e => setLockerNo(e.target.value)}
                placeholder="输入更衣柜号（可留空）"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">球包寄存号</label>
              <input value={bagNo} onChange={e => setBagNo(e.target.value)}
                placeholder="输入球包寄存号（可留空）"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            取消
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
            {saving ? '处理中...' : '确认签到'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 收银台弹窗 ───────────────────────────────────────────────────────────────

interface CashierDialogProps {
  booking:   Booking
  onClose:   () => void
  onSuccess: () => void
}

function CashierDialog({ booking, onClose, onSuccess }: CashierDialogProps) {
  const p = booking.pricing || {} as Pricing
  const pendingFee = p.pendingFee ?? (p.totalFee - (p.paidFee || 0))
  const [payMethod,   setPayMethod]   = useState('cash')
  const [payAmount,   setPayAmount]   = useState(String(Math.max(0, pendingFee || booking.totalFee || 0)))
  const [note,        setNote]        = useState('')
  const [saving,      setSaving]      = useState(false)

  const feeRows = [
    { label: '果岭费',  value: p.greenFee     },
    { label: '球童费',  value: p.caddyFee     },
    { label: '球车费',  value: p.cartFee      },
    { label: '保险费',  value: p.insuranceFee },
    { label: '客房费',  value: p.roomFee      },
    { label: '其他费',  value: p.otherFee     },
    { label: '折扣',    value: p.discount ? -p.discount : undefined, className: 'text-emerald-600' },
  ].filter(r => r.value !== undefined && r.value !== 0)

  const handleConfirm = async () => {
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) { toast.error('请输入有效的收款金额'); return }
    setSaving(true)
    try {
      // 先收款
      await api.bookings.pay(booking._id, { amount: amt, payMethod, note })
      // 再完赛
      await api.bookings.complete(booking._id)
      toast.success('收款并标记完赛成功 ✓')
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-gray-900">收银台</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {booking.orderNo && <span className="mr-2">{booking.orderNo}</span>}
              {booking.teeTime} · {booking.courseName}
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

          {/* 费用明细 */}
          {feeRows.length > 0 && (
            <div className="bg-gray-50 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500">费用明细</span>
              </div>
              <div className="divide-y divide-gray-100">
                {feeRows.map(r => (
                  <div key={r.label} className="flex justify-between items-center px-4 py-2.5">
                    <span className="text-sm text-gray-600">{r.label}</span>
                    <span className={`text-sm font-medium ${(r as any).className || 'text-gray-800'}`}>
                      {(r.value! > 0 ? '' : '')}¥{Math.abs(r.value!)}
                    </span>
                  </div>
                ))}
              </div>
              {/* 合计行 */}
              <div className="flex justify-between items-center px-4 py-3 bg-gray-100">
                <span className="text-sm font-semibold text-gray-800">应收合计</span>
                <span className="text-lg font-bold text-gray-900">¥{p.totalFee || booking.totalFee || 0}</span>
              </div>
              {(p.paidFee || 0) > 0 && (
                <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-gray-500">已付</span>
                  <span className="text-emerald-600 font-medium">¥{p.paidFee}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-4 py-3 bg-orange-50">
                <span className="text-sm font-semibold text-orange-700">待收</span>
                <span className="text-xl font-bold text-orange-600">¥{Math.max(0, pendingFee)}</span>
              </div>
            </div>
          )}

          {/* 无明细时显示简版合计 */}
          {feeRows.length === 0 && (
            <div className="bg-orange-50 rounded-xl flex justify-between items-center px-5 py-4">
              <span className="text-sm font-semibold text-orange-700">待收金额</span>
              <span className="text-2xl font-bold text-orange-600">¥{booking.totalFee || 0}</span>
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
          {booking.payments && booking.payments.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">历史支付记录</label>
              <div className="space-y-1">
                {booking.payments.map((pay: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <span>{PAY_METHODS.find(m => m.value === pay.payMethod)?.label || pay.payMethod}</span>
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
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            取消
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-semibold">
            {saving ? '处理中...' : `收款 ¥${payAmount || 0} 并完赛`}
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
                          <span className="text-blue-600">柜：{res.lockers[0].lockerNo}</span>
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
