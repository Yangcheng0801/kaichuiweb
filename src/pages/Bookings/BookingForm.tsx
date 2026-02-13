/**
 * 新建预订表单（v3 — 自动定价引擎）
 *
 * 核心升级：
 *   1. 选日期/时间 → 右侧自动显示「平日/周末/假日」「早场/午场/黄昏」标签
 *   2. 添加球员 → 调用 /api/rate-sheets/calculate 获取每人果岭费
 *   3. 价格面板自动填充（果岭费/球童费/球车费/保险费/客房费/折扣）
 *   4. 每个费用项可手动解锁覆盖
 *   5. 套餐选择（可选）→ 整单替换为套餐价
 *   6. 团队标记（可选）→ 8人以上自动提示可享团队价
 *   7. 底部价格明细汇总卡
 *   8. stayType 统一枚举：day | overnight_1 | overnight_2 | overnight_3 | custom
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { X, Plus, Trash2, UserPlus, Search, Check, Lock, Unlock, Package, Users, Info } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface BookingPlayer {
  name:        string
  type:        'member' | 'guest' | 'walkin'
  memberType:  string
  memberLevel: number | null
  phone:       string
  memberId:    string
  playerNo:    string
}

interface BookingFormData {
  date:           string
  teeTime:        string
  courseId:        string
  courseName:     string
  holes:          number
  players:        BookingPlayer[]
  caddyId:        string
  caddyName:      string
  cartId:         string
  cartNo:         string
  needCaddy:      boolean
  needCart:        boolean
  stayType:       string
  packageId:      string
  note:           string
  createdBy:      string
  createdByName:  string
  // 费用字段
  greenFee:       number
  caddyFee:       number
  cartFee:        number
  insuranceFee:   number
  roomFee:        number
  otherFee:       number
  discount:       number
  totalFee:       number
  // 引擎控制
  priceSource:    'auto' | 'manual' | 'package'
  priceOverride:  boolean
  // 团队
  isTeam:         boolean
  teamName:       string
  totalPlayers:   number
  contactName:    string
  contactPhone:   string
}

interface Course { _id: string; name: string; holes: number; status: string }
interface Caddie { _id: string; name: string; level: string; experience: number; status: string }
interface Cart   { _id: string; cartNo: string; model: string; feePerRound: number; status: string }
interface StayPackage { _id: string; packageName: string; packageCode: string; description: string; includes: any; pricing: any; status: string }

interface PlayerSuggestion {
  _id: string; playerNo: string; name: string; phoneNumber: string
  profile?: { memberLevel: string; consumeCardNo: string; account: { balance: number } }
}

interface PricingResult {
  success: boolean; error?: string
  priceSource: string; dayType: string; dayTypeName: string; dateName?: string
  timeSlot: string; timeSlotName: string; hasRateSheet: boolean
  greenFee: number; caddyFee: number; cartFee: number; insuranceFee: number
  roomFee: number; otherFee: number; discount: number; totalFee: number
  playerBreakdown: { name: string; memberType: string; greenFee: number }[]
  teamDiscount?: { label: string; discountRate: number; discountAmount: number }
  feeStandards?: { caddyFeeUnit: number; cartFeeUnit: number; insuranceFeeUnit: number }
  isClosed?: boolean
}

interface Props {
  onClose:     () => void
  onSuccess:   () => void
  initialDate?: string
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const LEVEL_MAP: Record<string, string> = { junior: '初级', senior: '中级', expert: '高级' }
const MEMBER_LEVEL_LABEL: Record<string, string> = {
  regular: '普通', silver: '银卡', gold: '金卡',
  platinum: '铂金', diamond: '钻石', vip: 'VIP',
}
const MEMBER_LEVEL_TO_NUM: Record<string, number> = {
  regular: 1, silver: 1, gold: 2, platinum: 3, diamond: 4, vip: 4,
}

const STAY_TYPES = [
  { key: 'day',         label: '日归' },
  { key: 'overnight_1', label: '一晚' },
  { key: 'overnight_2', label: '两晚' },
  { key: 'overnight_3', label: '三晚' },
  { key: 'custom',      label: '自定义' },
]

const EMPTY_PLAYER: BookingPlayer = { name: '', type: 'member', memberType: 'member', memberLevel: null, phone: '', memberId: '', playerNo: '' }
const today = new Date().toISOString().slice(0, 10)

function genTeeTimeOptions() {
  const opts: string[] = []
  for (let h = 6; h <= 17; h++) {
    for (let m = 0; m < 60; m += 10) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return opts
}
const TEE_TIMES = genTeeTimeOptions()

// ─── 球员搜索下拉 ─────────────────────────────────────────────────────────────

interface PlayerSearchDropdownProps {
  value: string; onChange: (val: string) => void; onSelect: (p: PlayerSuggestion) => void; placeholder?: string
}

function PlayerSearchDropdown({ value, onChange, onSelect, placeholder }: PlayerSearchDropdownProps) {
  const [results, setResults] = useState<PlayerSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInput = (val: string) => {
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!val.trim() || val.length < 2) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => {
      setSearching(true)
      api.players.search({ q: val, clubId: 'default' })
        .then((res: any) => { const list = res.data || []; setResults(list.slice(0, 6)); setOpen(list.length > 0) })
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 350)
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <input type="text" value={value} onChange={e => handleInput(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || '姓名 / 手机 / 球员号'}
          className="w-full px-2.5 py-2 pr-7 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
        {searching && <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 animate-pulse" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {results.map(p => (
            <button key={p._id} type="button" className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 text-left transition-colors"
              onMouseDown={e => { e.preventDefault(); onSelect(p); setOpen(false) }}>
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{p.name?.[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  {p.profile?.memberLevel && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 rounded-full">{MEMBER_LEVEL_LABEL[p.profile.memberLevel] || p.profile.memberLevel}</span>}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                  <span className="font-mono">#{p.playerNo}</span>
                  {p.phoneNumber && <span>{p.phoneNumber}</span>}
                  {(p.profile?.account?.balance ?? 0) > 0 && <span className="text-emerald-600">余额¥{p.profile!.account.balance}</span>}
                </div>
              </div>
              <Check size={14} className="text-emerald-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function BookingForm({ onClose, onSuccess, initialDate }: Props) {
  const [form, setForm] = useState<BookingFormData>({
    date: initialDate || today, teeTime: '08:00',
    courseId: '', courseName: '', holes: 18,
    players: [{ ...EMPTY_PLAYER }],
    caddyId: '', caddyName: '', cartId: '', cartNo: '',
    needCaddy: false, needCart: false,
    stayType: 'day', packageId: '',
    note: '', createdBy: '前台', createdByName: '前台',
    greenFee: 0, caddyFee: 0, cartFee: 0, insuranceFee: 0,
    roomFee: 0, otherFee: 0, discount: 0, totalFee: 0,
    priceSource: 'auto', priceOverride: false,
    isTeam: false, teamName: '', totalPlayers: 0, contactName: '', contactPhone: '',
  })

  const [courses, setCourses] = useState<Course[]>([])
  const [caddies, setCaddies] = useState<Caddie[]>([])
  const [carts, setCarts] = useState<Cart[]>([])
  const [packages, setPackages] = useState<StayPackage[]>([])
  const [saving, setSaving] = useState(false)

  // Pricing engine state
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [lockedFields, setLockedFields] = useState<Record<string, boolean>>({
    greenFee: true, caddyFee: true, cartFee: true, insuranceFee: true, roomFee: true, otherFee: true, discount: true,
  })

  const set = (key: keyof BookingFormData, value: unknown) => setForm(p => ({ ...p, [key]: value }))

  // ── 加载资源 ──
  useEffect(() => {
    Promise.all([
      api.resources.courses.getList({ status: 'active' }),
      api.resources.caddies.getList({ status: 'available' }),
      api.resources.carts.getList({ status: 'available' }),
      api.stayPackages.getList({ status: 'active' }),
    ]).then(([c, ca, ct, pk]: any[]) => {
      const courseList = c.data || []
      setCourses(courseList)
      setCaddies(ca.data || [])
      setCarts(ct.data || [])
      setPackages(pk.data || [])
      if (courseList.length > 0 && !form.courseId) {
        setForm(p => ({ ...p, courseId: courseList[0]._id, courseName: courseList[0].name }))
      }
    }).catch(() => toast.error('加载资源数据失败'))
  }, [])

  // ── 调用定价引擎 ──
  const calculatePrice = useCallback(async () => {
    if (!form.date || !form.teeTime || form.players.length === 0) return
    if (form.priceOverride) return // 手动模式不调引擎

    setPricingLoading(true)
    try {
      const res: any = await api.rateSheets.calculate({
        clubId: 'default',
        date: form.date,
        teeTime: form.teeTime,
        courseId: form.courseId || undefined,
        holes: form.holes,
        players: form.players.map(p => ({
          name: p.name,
          memberType: p.memberType || p.type || 'walkin',
          memberLevel: p.memberLevel,
        })),
        needCaddy: form.needCaddy,
        needCart: form.needCart,
        packageId: form.packageId || undefined,
        totalPlayers: form.isTeam ? (form.totalPlayers || form.players.length) : form.players.length,
      })

      const data = res.data as PricingResult
      setPricingResult(data)

      if (data && data.success) {
        // 仅更新锁定状态的字段（未被用户手动解锁的字段）
        setForm(p => ({
          ...p,
          ...(lockedFields.greenFee     ? { greenFee: data.greenFee } : {}),
          ...(lockedFields.caddyFee     ? { caddyFee: data.caddyFee } : {}),
          ...(lockedFields.cartFee      ? { cartFee: data.cartFee } : {}),
          ...(lockedFields.insuranceFee ? { insuranceFee: data.insuranceFee } : {}),
          ...(lockedFields.roomFee      ? { roomFee: data.roomFee || 0 } : {}),
          ...(lockedFields.discount     ? { discount: data.discount || 0 } : {}),
          priceSource: data.priceSource as any || 'auto',
        }))
      }
    } catch (e) {
      console.warn('[BookingForm] 自动定价失败:', e)
    } finally {
      setPricingLoading(false)
    }
  }, [form.date, form.teeTime, form.courseId, form.holes, form.players, form.needCaddy, form.needCart, form.packageId, form.isTeam, form.totalPlayers, form.priceOverride, lockedFields])

  // 触发定价（防抖）
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (calcTimer.current) clearTimeout(calcTimer.current)
    calcTimer.current = setTimeout(() => { calculatePrice() }, 500)
    return () => { if (calcTimer.current) clearTimeout(calcTimer.current) }
  }, [calculatePrice])

  // 自动重算总费用
  useEffect(() => {
    const total = form.greenFee + form.caddyFee + form.cartFee + form.insuranceFee + form.roomFee + form.otherFee - form.discount
    setForm(p => ({ ...p, totalFee: Math.max(0, Math.round(total * 100) / 100) }))
  }, [form.greenFee, form.caddyFee, form.cartFee, form.insuranceFee, form.roomFee, form.otherFee, form.discount])

  // ── 球场选择 ──
  const handleCourseChange = (id: string) => {
    const c = courses.find(c => c._id === id)
    setForm(p => ({ ...p, courseId: id, courseName: c?.name || '', holes: c?.holes || 18 }))
  }

  // ── 球童/球车选择 ──
  const handleCaddyChange = (id: string) => {
    const c = caddies.find(c => c._id === id)
    setForm(p => ({ ...p, caddyId: id, caddyName: c?.name || '', needCaddy: !!id }))
  }
  const handleCartChange = (id: string) => {
    const c = carts.find(c => c._id === id)
    setForm(p => ({ ...p, cartId: id, cartNo: c?.cartNo || '', needCart: !!id }))
  }

  // ── 球员行操作 ──
  const setPlayer = (idx: number, key: keyof BookingPlayer, val: any) => {
    const next = [...form.players]
    next[idx] = { ...next[idx], [key]: val }
    set('players', next)
  }

  const selectPlayerFromSearch = (idx: number, p: PlayerSuggestion) => {
    const next = [...form.players]
    const mLevel = p.profile?.memberLevel
    next[idx] = {
      name: p.name,
      type: 'member',
      memberType: 'member',
      memberLevel: mLevel ? (MEMBER_LEVEL_TO_NUM[mLevel] || 1) : 1,
      phone: p.phoneNumber || '',
      memberId: p._id,
      playerNo: p.playerNo,
    }
    set('players', next)
  }

  const addPlayer = () => {
    if (form.players.length >= 4 && !form.isTeam) { toast.error('普通预订最多4位球员，如需更多请开启团队模式'); return }
    set('players', [...form.players, { ...EMPTY_PLAYER }])
  }

  const removePlayer = (idx: number) => {
    if (form.players.length <= 1) { toast.error('至少保留1位球员'); return }
    set('players', form.players.filter((_: any, i: number) => i !== idx))
  }

  // ── 锁定/解锁费用字段 ──
  const toggleLock = (field: string) => {
    setLockedFields(p => ({ ...p, [field]: !p[field] }))
  }

  // ── 提交 ──
  const handleSave = async () => {
    if (!form.date) { toast.error('请选择预订日期'); return }
    if (!form.teeTime) { toast.error('请选择发球时间'); return }
    if (!form.courseId) { toast.error('请选择球场'); return }
    if (form.players.some(p => !p.name.trim())) { toast.error('请填写所有球员姓名'); return }

    setSaving(true)
    try {
      const payload: any = {
        date: form.date, teeTime: form.teeTime,
        courseId: form.courseId, courseName: form.courseName,
        holes: form.holes,
        players: form.players.map(p => ({
          name: p.name, type: p.type, memberType: p.memberType,
          memberLevel: p.memberLevel, phone: p.phone,
          memberId: p.memberId, playerNo: p.playerNo,
        })),
        caddyId: form.caddyId || undefined, caddyName: form.caddyName,
        cartId: form.cartId || undefined, cartNo: form.cartNo,
        needCaddy: form.needCaddy, needCart: form.needCart,
        stayType: form.stayType,
        packageId: form.packageId || undefined,
        greenFee: form.greenFee, caddyFee: form.caddyFee,
        cartFee: form.cartFee, insuranceFee: form.insuranceFee,
        roomFee: form.roomFee, otherFee: form.otherFee,
        discount: form.discount, totalFee: form.totalFee,
        priceSource: form.priceSource,
        priceOverride: form.priceOverride,
        note: form.note,
        createdBy: form.createdBy, createdByName: form.createdByName,
      }

      // 团队信息
      if (form.isTeam) {
        payload.teamBooking = {
          isTeam: true,
          teamName: form.teamName,
          totalPlayers: form.totalPlayers || form.players.length,
          contactName: form.contactName,
          contactPhone: form.contactPhone,
        }
      }

      await api.bookings.create(payload)
      toast.success('预订创建成功')
      onSuccess()
      onClose()
    } catch {} finally {
      setSaving(false)
    }
  }

  // ── 费用行渲染 ──
  const feeFields = [
    { key: 'greenFee',     label: '果岭费',   color: 'text-emerald-600' },
    { key: 'caddyFee',     label: '球童费',   color: 'text-blue-600' },
    { key: 'cartFee',      label: '球车费',   color: 'text-indigo-600' },
    { key: 'insuranceFee', label: '保险费',   color: 'text-gray-600' },
    { key: 'roomFee',      label: '客房费',   color: 'text-purple-600' },
    { key: 'otherFee',     label: '其他费用', color: 'text-gray-500' },
  ]

  // 汇总
  const feeItems = feeFields.filter(f => (form as any)[f.key] > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900 text-lg">新建预订</h2>
            {pricingResult && pricingResult.success && (
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${pricingResult.dayType === 'holiday' ? 'bg-red-100 text-red-700' : pricingResult.dayType === 'weekend' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {pricingResult.dayTypeName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                  {pricingResult.timeSlotName}
                </span>
                {pricingResult.dateName && <span className="text-[10px] text-gray-400">{pricingResult.dateName}</span>}
              </div>
            )}
            {pricingLoading && <span className="text-xs text-gray-400 animate-pulse">算价中...</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        {/* 表单主体 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── 预订信息 ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">预订信息</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期 <span className="text-red-500">*</span></label>
                <input type="date" value={form.date} min={today} onChange={e => set('date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">时间 <span className="text-red-500">*</span></label>
                <select value={form.teeTime} onChange={e => set('teeTime', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  {TEE_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">住宿类型</label>
                <select value={form.stayType} onChange={e => set('stayType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  {STAY_TYPES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">球场 <span className="text-red-500">*</span></label>
                <select value={form.courseId} onChange={e => handleCourseChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option value="">请选择球场</option>
                  {courses.map(c => <option key={c._id} value={c._id}>{c.name}（{c.holes}洞）</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">套餐</label>
                <select value={form.packageId} onChange={e => set('packageId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option value="">无套餐</option>
                  {packages.map(p => <option key={p._id} value={p._id}>{p.packageName}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* ── 球员信息 ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                球员 <span className="text-gray-300 font-normal normal-case">（{form.players.length}{form.isTeam ? ` / 团队${form.totalPlayers}人` : '/4'}）</span>
              </h3>
              <button onClick={addPlayer} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700">
                <UserPlus size={13} /> 添加球员
              </button>
            </div>
            <div className="space-y-3">
              {form.players.map((player, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium w-4 text-center flex-shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      {player.memberId ? (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                          <div className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{player.name?.[0]}</div>
                          <span className="text-sm font-medium text-emerald-800 flex-1 truncate">{player.name}</span>
                          <span className="text-[10px] font-mono text-emerald-500">#{player.playerNo}</span>
                          <button type="button" onClick={() => { const next = [...form.players]; next[idx] = { ...EMPTY_PLAYER }; set('players', next) }}
                            className="p-0.5 text-emerald-400 hover:text-red-400 transition-colors"><X size={12} /></button>
                        </div>
                      ) : (
                        <PlayerSearchDropdown value={player.name} onChange={val => setPlayer(idx, 'name', val)}
                          onSelect={p => selectPlayerFromSearch(idx, p)} placeholder="搜索球员姓名 / 手机 / 球员号" />
                      )}
                    </div>
                    <select value={player.type} onChange={e => { setPlayer(idx, 'type', e.target.value); setPlayer(idx, 'memberType', e.target.value) }}
                      className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none bg-white flex-shrink-0">
                      <option value="member">会员</option>
                      <option value="guest">嘉宾</option>
                      <option value="walkin">散客</option>
                    </select>
                    <button onClick={() => removePlayer(idx)} className="p-1 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                  {/* 定价引擎返回的每人明细 */}
                  {pricingResult?.playerBreakdown?.[idx] && (
                    <div className="pl-6 text-xs text-gray-400">
                      果岭费 ¥{pricingResult.playerBreakdown[idx].greenFee}
                    </div>
                  )}
                  {!player.memberId && (
                    <div className="flex items-center gap-2 pl-6">
                      <input type="tel" value={player.phone} placeholder="手机号（选填）" onChange={e => setPlayer(idx, 'phone', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── 团队模式 ── */}
          <section>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isTeam} onChange={e => set('isTeam', e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-400" />
                <Users size={14} className="text-blue-600" />
                <span className="text-sm text-blue-800 font-medium">团队模式</span>
              </label>
              {form.isTeam && form.players.length >= 8 && pricingResult?.teamDiscount && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{pricingResult.teamDiscount.label}</span>
              )}
            </div>
            {form.isTeam && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">团队名称</label>
                  <input value={form.teamName} onChange={e => set('teamName', e.target.value)} placeholder="如：XX公司团建"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">总人数</label>
                  <input type="number" value={form.totalPlayers || ''} onChange={e => set('totalPlayers', Number(e.target.value))} min={1}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">联系人</label>
                  <input value={form.contactName} onChange={e => set('contactName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">联系电话</label>
                  <input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
            )}
          </section>

          {/* ── 服务配置 ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">服务配置</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">球童（可选）</label>
                <select value={form.caddyId} onChange={e => handleCaddyChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option value="">不需要球童</option>
                  {caddies.map(c => <option key={c._id} value={c._id}>{c.name}（{LEVEL_MAP[c.level] || c.level}·{c.experience}年）</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">球车（可选）</label>
                <select value={form.cartId} onChange={e => handleCartChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option value="">不需要球车</option>
                  {carts.map(c => <option key={c._id} value={c._id}>{c.cartNo}{c.model ? `（${c.model}）` : ''}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* ── 费用信息（自动算价 + 可覆盖）── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">费用信息</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.priceOverride} onChange={e => {
                  const override = e.target.checked
                  set('priceOverride', override)
                  if (override) {
                    set('priceSource', 'manual')
                    // 解锁所有字段
                    setLockedFields({ greenFee: false, caddyFee: false, cartFee: false, insuranceFee: false, roomFee: false, otherFee: false, discount: false })
                  } else {
                    set('priceSource', 'auto')
                    setLockedFields({ greenFee: true, caddyFee: true, cartFee: true, insuranceFee: true, roomFee: true, otherFee: true, discount: true })
                  }
                }} className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-400" />
                <span className="text-xs text-amber-600 font-medium">手动定价</span>
              </label>
            </div>

            {pricingResult && !pricingResult.success && pricingResult.isClosed && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                <Info size={14} /> {pricingResult.error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {feeFields.map(f => (
                <div key={f.key} className="relative">
                  <div className="flex items-center gap-1 mb-1">
                    <label className={`text-xs font-medium ${f.color}`}>{f.label}</label>
                    {!form.priceOverride && (
                      <button onClick={() => toggleLock(f.key)} className="p-0.5"
                        title={lockedFields[f.key] ? '系统自动（点击解锁手动输入）' : '已手动覆盖（点击恢复自动）'}>
                        {lockedFields[f.key]
                          ? <Lock size={10} className="text-emerald-400" />
                          : <Unlock size={10} className="text-amber-500" />
                        }
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    value={(form as any)[f.key] || ''}
                    readOnly={!form.priceOverride && lockedFields[f.key]}
                    onChange={e => set(f.key as keyof BookingFormData, parseFloat(e.target.value) || 0)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                      !form.priceOverride && lockedFields[f.key] ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700' : 'border-gray-200 bg-white'
                    }`}
                  />
                </div>
              ))}
              {/* 折扣 */}
              <div className="relative">
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs font-medium text-red-500">折扣减免</label>
                  {!form.priceOverride && (
                    <button onClick={() => toggleLock('discount')} className="p-0.5">
                      {lockedFields.discount ? <Lock size={10} className="text-emerald-400" /> : <Unlock size={10} className="text-amber-500" />}
                    </button>
                  )}
                </div>
                <input type="number" value={form.discount || ''} readOnly={!form.priceOverride && lockedFields.discount}
                  onChange={e => set('discount', parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                    !form.priceOverride && lockedFields.discount ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700' : 'border-gray-200 bg-white'
                  }`} />
              </div>
            </div>

            {/* 团队折扣提示 */}
            {pricingResult?.teamDiscount && (
              <div className="mt-3 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-center gap-2">
                <Users size={12} />
                团队折扣已应用：{pricingResult.teamDiscount.label}，减免 ¥{pricingResult.teamDiscount.discountAmount}
              </div>
            )}
          </section>

          {/* ── 备注 ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">备注</h3>
            <textarea rows={2} value={form.note} onChange={e => set('note', e.target.value)} placeholder="特殊需求、注意事项等..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
          </section>
        </div>

        {/* 底部：费用汇总 + 操作 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-gray-500">应收合计：</span>
              <span className="text-xl font-bold text-emerald-600">¥{form.totalFee}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${form.priceSource === 'auto' ? 'bg-emerald-100 text-emerald-700' : form.priceSource === 'package' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                {form.priceSource === 'auto' ? '系统定价' : form.priceSource === 'package' ? '套餐价' : '手动'}
              </span>
            </div>
            {feeItems.length > 0 && (
              <div className="text-xs text-gray-400 mt-0.5">
                {feeItems.map(r => `${r.label}¥${(form as any)[r.key]}`).join(' + ')}
                {form.discount > 0 && ` - 折扣¥${form.discount}`}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">取消</button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium">
              {saving ? '创建中...' : '确认预订'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
