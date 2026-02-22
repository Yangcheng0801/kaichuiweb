/**
 * 新建预订表单（v5 — 职责分离 + 体验优化）
 *
 * v5 核心变更：
 *   1. 球童/球车选择改为需求开关（具体分配由出发台调度）
 *   2. 移除加打/减打区域（运营阶段由出发台处理）
 *   3. 住宿类型降级为 pill 选择器（大多数为日归）
 *   4. 费用区域折叠式展示，减少视觉噪音
 *   5. 新增预订来源 & 折扣原因，便于数据分析审计
 *   6. 发球时间间隔从 10 分钟改为 7 分钟（行业标准）
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { X, Trash2, UserPlus, Search, Check, Lock, Unlock, Users, Info, ChevronDown, UserCheck } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface IdentityType {
  _id: string; code: string; name: string; category: string; color: string; memberLevel: number | null; status: string
}

interface BookingPlayer {
  name:         string
  identityCode: string       // v4: 动态身份代码
  type:         string       // 兼容旧版
  memberType:   string       // 兼容旧版
  memberLevel:  number | null
  phone:        string
  memberId:     string
  playerNo:     string
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
  priceSource:    'auto' | 'manual' | 'package' | 'addOn' | 'reduced'
  priceOverride:  boolean
  // 团队
  isTeam:         boolean
  teamName:       string
  totalPlayers:   number
  contactName:    string
  contactPhone:   string
  // 来源 & 折扣原因
  bookingSource:  string
  discountReason: string
  // 点号（指定球童）
  caddyDesignation: {
    type: 'none' | 'designated'
    caddyId: string
    caddyNo: string
    caddyName: string
    caddyLevel: string
    designationFeeOverride?: number
  }
  caddyDesignationFee: number
  // 加打/减打（运营阶段由出发台处理，保留字段兼容后端）
  isAddOn:        boolean
  isReduced:      boolean
  holesPlayed:    number
}

interface Course { _id: string; name: string; holes: number; status: string }
interface StayPackage { _id: string; packageName: string; packageCode: string; description: string; includes: any; pricing: any; status: string }

interface PlayerSuggestion {
  _id: string; playerNo: string; name: string; phoneNumber: string
  profile?: { memberLevel: string; consumeCardNo: string; account: { balance: number } }
}

interface PricingResult {
  success: boolean; error?: string
  priceSource: string; dayType: string; dayTypeName: string; dateName?: string
  timeSlot: string; timeSlotName: string; hasRateSheet: boolean
  greenFee: number; caddyFee: number; caddyDesignationFee?: number; cartFee: number; insuranceFee: number
  roomFee: number; otherFee: number; discount: number; totalFee: number
  playerBreakdown: { name: string; identityCode?: string; memberType?: string; greenFee: number; addOnInfo?: any; reducedInfo?: any }[]
  teamDiscount?: { label: string; discountRate: number; discountAmount: number }
  feeStandards?: { caddyFeeUnit: number; cartFeeUnit: number; insuranceFeeUnit: number }
  isClosed?: boolean
  addOnInfo?: any
  reducedInfo?: any
  addOnPricesRef?: Record<string, number>
  reducedPolicyRef?: any
}

interface CaddieItem { _id: string; name?: string; caddyNo?: string; no?: string; level?: string }
interface CaddieSelectDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (c: { caddyId: string; caddyNo: string; caddyName: string; caddyLevel: string; designationFeeOverride?: number }) => void
  date: string
  teeTime: string
}

function CaddieSelectDialog({ open, onClose, onSelect, date, teeTime }: CaddieSelectDialogProps) {
  const [caddies, setCaddies] = useState<CaddieItem[]>([])
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, { available: boolean; reason?: string }>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSearch('')
      setLoading(true)
      Promise.all([
        api.resources.caddies.getList({}),
        api.resources.caddies.getAvailabilityMap({ date, teeTime }),
      ])
        .then(([listRes, availRes]: any[]) => {
          setCaddies(listRes?.data || [])
          setAvailabilityMap(availRes?.data || {})
        })
        .catch(() => toast.error('加载球童列表失败'))
        .finally(() => setLoading(false))
    }
  }, [open, date, teeTime])

  const filtered = caddies.filter(c => {
    const no = (c.caddyNo || c.no || '').toString()
    const name = (c.name || '').toLowerCase()
    const q = search.trim().toLowerCase()
    return !q || no.includes(q) || name.includes(q)
  })

  const handlePick = async (c: CaddieItem) => {
    setChecking(c._id)
    try {
      const res: any = await api.resources.caddies.checkAvailability({ caddyId: c._id, date, teeTime })
      if (res.available) {
        onSelect({
          caddyId: c._id,
          caddyNo: (c.caddyNo || c.no || '').toString(),
          caddyName: c.name || '',
          caddyLevel: c.level || 'trainee',
          designationFeeOverride: (c as any).designationFeeOverride,
        })
        onClose()
      } else {
        toast.error(res.reason || '该球童当前时段不可用')
      }
    } catch {
      toast.error('校验失败，请稍后重试')
    } finally {
      setChecking(null)
    }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-foreground">选择球童（点号）</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground"><X size={18} /></button>
        </div>
        <div className="p-3 border-b">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="球童号 / 姓名"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">暂无球童</div>
          ) : (
            filtered.map(c => {
              const avail = availabilityMap[c._id]
              const available = avail === undefined ? true : avail.available
              const reason = avail?.reason
              return (
                <button key={c._id} type="button" onClick={() => available && handlePick(c)}
                  disabled={!!checking || !available}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    available && !checking
                      ? 'hover:bg-success/10 cursor-pointer'
                      : 'opacity-60 cursor-not-allowed bg-secondary/50'
                  }`}>
                  <div className={`w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 ${
                    available ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground'
                  }`}>
                    {(c.caddyNo || c.no)?.toString().slice(-2) || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{c.name || '未命名'}</div>
                    <div className="text-xs text-muted-foreground">{c.caddyNo || c.no}号 · {c.level === 'gold' ? '金牌' : c.level === 'silver' ? '特级' : '普通'}</div>
                    {!available && reason && (
                      <div className="text-[11px] text-amber-600 mt-0.5">{reason}</div>
                    )}
                  </div>
                  {checking === c._id && <span className="text-xs text-amber-600 ml-auto">校验中…</span>}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

interface Props { onClose: () => void; onSuccess: () => void; initialDate?: string }

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const MEMBER_LEVEL_LABEL: Record<string, string> = {
  regular: '普通', silver: '银卡', gold: '金卡', platinum: '铂金', diamond: '钻石', vip: 'VIP',
}
const MEMBER_LEVEL_TO_IDENTITY: Record<string, string> = {
  regular: 'member_1', silver: 'member_1', gold: 'member_2', platinum: 'member_3', diamond: 'member_4', vip: 'member_4',
}

const STAY_TYPES = [
  { key: 'day', label: '日归' }, { key: 'overnight_1', label: '一晚' },
  { key: 'overnight_2', label: '两晚' }, { key: 'overnight_3', label: '三晚' }, { key: 'custom', label: '自定义' },
]

const BOOKING_SOURCES = [
  { key: 'walkin',   label: '现场散客' },
  { key: 'phone',    label: '电话预订' },
  { key: 'wechat',   label: '微信/小程序' },
  { key: 'ota',      label: 'OTA 平台' },
  { key: 'agent',    label: '旅行社/代理' },
  { key: 'member',   label: '会员自助' },
  { key: 'internal', label: '内部接待' },
]

const EMPTY_PLAYER: BookingPlayer = {
  name: '', identityCode: 'walkin', type: 'walkin', memberType: 'walkin',
  memberLevel: null, phone: '', memberId: '', playerNo: '',
}
const today = new Date().toISOString().slice(0, 10)

function genTeeTimeOptions(intervalMin = 7) {
  const opts: string[] = []
  for (let h = 6; h <= 17; h++) {
    for (let m = 0; m < 60; m += intervalMin) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return opts
}
const TEE_TIMES = genTeeTimeOptions(7)

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
          className="w-full px-2.5 py-2 pr-7 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white" />
        {searching && <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground animate-pulse" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          {results.map(p => (
            <button key={p._id} type="button" className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-success/10 text-left transition-colors"
              onMouseDown={e => { e.preventDefault(); onSelect(p); setOpen(false) }}>
              <div className="w-7 h-7 rounded-full bg-success/10 text-success text-xs font-bold flex items-center justify-center flex-shrink-0">{p.name?.[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  {p.profile?.memberLevel && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 rounded-full">{MEMBER_LEVEL_LABEL[p.profile.memberLevel] || p.profile.memberLevel}</span>}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <span className="font-mono">#{p.playerNo}</span>
                  {p.phoneNumber && <span>{p.phoneNumber}</span>}
                  {(p.profile?.account?.balance ?? 0) > 0 && <span className="text-success">余额¥{p.profile!.account.balance}</span>}
                </div>
              </div>
              <Check size={14} className="text-success flex-shrink-0" />
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
    caddyId: '', caddyName: '', cartId: '', cartNo: '',  // 保留字段兼容后端结构
    needCaddy: false, needCart: false,
    stayType: 'day', packageId: '',
    note: '', createdBy: '前台', createdByName: '前台',
    greenFee: 0, caddyFee: 0, cartFee: 0, insuranceFee: 0,
    roomFee: 0, otherFee: 0, discount: 0, totalFee: 0,
    priceSource: 'auto', priceOverride: false,
    isTeam: false, teamName: '', totalPlayers: 0, contactName: '', contactPhone: '',
    bookingSource: 'walkin', discountReason: '',
    caddyDesignation: { type: 'none', caddyId: '', caddyNo: '', caddyName: '', caddyLevel: 'trainee' },
    caddyDesignationFee: 0,
    isAddOn: false, isReduced: false, holesPlayed: 9,
  })

  const [identityTypes, setIdentityTypes] = useState<IdentityType[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [packages, setPackages] = useState<StayPackage[]>([])
  const [saving, setSaving] = useState(false)
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [lockedFields, setLockedFields] = useState<Record<string, boolean>>({
    greenFee: true, caddyFee: true, caddyDesignationFee: true, cartFee: true, insuranceFee: true, roomFee: true, otherFee: true, discount: true,
  })
  const [feeExpanded, setFeeExpanded] = useState(false)
  const [caddieSelectOpen, setCaddieSelectOpen] = useState(false)

  const set = (key: keyof BookingFormData, value: unknown) => setForm(p => ({ ...p, [key]: value }))

  // ── 加载资源 ──
  useEffect(() => {
    Promise.all([
      api.resources.courses.getList({ status: 'active' }),
      api.stayPackages.getList({ status: 'active' }),
      api.identityTypes.getList({ status: 'active' }),
    ]).then(([c, pk, ids]: any[]) => {
      const courseList = c.data || []
      setCourses(courseList)
      setPackages(pk.data || [])
      setIdentityTypes(ids.data || [])
      if (courseList.length > 0 && !form.courseId) {
        setForm(p => ({ ...p, courseId: courseList[0]._id, courseName: courseList[0].name }))
      }
    }).catch(() => toast.error('加载资源数据失败'))
  }, [])

  const activeIdentities = identityTypes.filter(i => i.status === 'active')

  // ── 调用定价引擎 ──
  const calculatePrice = useCallback(async () => {
    if (!form.date || !form.teeTime || form.players.length === 0) return
    if (form.priceOverride) return

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
          identityCode: p.identityCode || 'walkin',
          memberType: p.memberType || p.type || 'walkin',
          memberLevel: p.memberLevel,
        })),
        needCaddy: form.needCaddy,
        needCart: form.needCart,
        packageId: form.packageId || undefined,
        totalPlayers: form.isTeam ? (form.totalPlayers || form.players.length) : form.players.length,
        caddyDesignation: form.caddyDesignation?.type === 'designated' ? form.caddyDesignation : undefined,
        isAddOn: form.isAddOn,
        isReduced: form.isReduced,
        holesPlayed: form.isReduced ? form.holesPlayed : undefined,
      })

      const data = res.data as PricingResult
      setPricingResult(data)

      if (data && data.success) {
        setForm(p => ({
          ...p,
          ...(lockedFields.greenFee     ? { greenFee: data.greenFee } : {}),
          ...(lockedFields.caddyFee     ? { caddyFee: data.caddyFee } : {}),
          ...(lockedFields.caddyDesignationFee !== false ? { caddyDesignationFee: data.caddyDesignationFee || 0 } : {}),
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
  }, [form.date, form.teeTime, form.courseId, form.holes, form.players, form.needCaddy, form.needCart, form.caddyDesignation, form.packageId, form.isTeam, form.totalPlayers, form.priceOverride, form.isAddOn, form.isReduced, form.holesPlayed, lockedFields])

  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (calcTimer.current) clearTimeout(calcTimer.current)
    calcTimer.current = setTimeout(() => { calculatePrice() }, 500)
    return () => { if (calcTimer.current) clearTimeout(calcTimer.current) }
  }, [calculatePrice])

  useEffect(() => {
    const total = form.greenFee + form.caddyFee + (form.caddyDesignationFee || 0) + form.cartFee + form.insuranceFee + form.roomFee + form.otherFee - form.discount
    setForm(p => ({ ...p, totalFee: Math.max(0, Math.round(total * 100) / 100) }))
  }, [form.greenFee, form.caddyFee, form.caddyDesignationFee, form.cartFee, form.insuranceFee, form.roomFee, form.otherFee, form.discount])

  // ── 选择处理 ──
  const handleCourseChange = (id: string) => {
    const c = courses.find(c => c._id === id)
    setForm(p => ({ ...p, courseId: id, courseName: c?.name || '', holes: c?.holes || 18 }))
  }
  // caddy/cart 具体分配由出发台调度，预订仅记录需求偏好

  // ── 球员操作 ──
  const setPlayer = (idx: number, key: keyof BookingPlayer, val: any) => {
    const next = [...form.players]
    next[idx] = { ...next[idx], [key]: val }
    set('players', next)
  }

  const selectPlayerFromSearch = (idx: number, p: PlayerSuggestion) => {
    const next = [...form.players]
    const mLevel = p.profile?.memberLevel
    const identityCode = mLevel ? (MEMBER_LEVEL_TO_IDENTITY[mLevel] || 'member_1') : 'walkin'
    next[idx] = {
      name: p.name,
      identityCode,
      type: 'member',
      memberType: 'member',
      memberLevel: mLevel ? (Number(identityCode.split('_')[1]) || 1) : null,
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

  const toggleLock = (field: string) => setLockedFields(p => ({ ...p, [field]: !p[field] }))

  const handleCaddieSelect = (c: { caddyId: string; caddyNo: string; caddyName: string; caddyLevel: string; designationFeeOverride?: number }) => {
    set('caddyDesignation', {
      type: 'designated',
      caddyId: c.caddyId,
      caddyNo: c.caddyNo,
      caddyName: c.caddyName,
      caddyLevel: c.caddyLevel || 'trainee',
      designationFeeOverride: c.designationFeeOverride,
    })
    setCaddieSelectOpen(false)
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
        courseId: form.courseId, courseName: form.courseName, holes: form.holes,
        players: form.players.map(p => ({
          name: p.name, identityCode: p.identityCode,
          type: p.type, memberType: p.memberType, memberLevel: p.memberLevel,
          phone: p.phone, memberId: p.memberId, playerNo: p.playerNo,
        })),
        needCaddy: form.needCaddy, needCart: form.needCart,
        stayType: form.stayType,
        packageId: form.packageId || undefined,
        greenFee: form.greenFee, caddyFee: form.caddyFee,
        caddyDesignationFee: form.caddyDesignationFee || 0,
        cartFee: form.cartFee, insuranceFee: form.insuranceFee,
        roomFee: form.roomFee, otherFee: form.otherFee,
        discount: form.discount, totalFee: form.totalFee,
        priceSource: form.priceSource, priceOverride: form.priceOverride,
        bookingSource: form.bookingSource,
        discountReason: form.discountReason || undefined,
        isAddOn: form.isAddOn, isReduced: form.isReduced,
        holesPlayed: form.isReduced ? form.holesPlayed : undefined,
        note: form.note, createdBy: form.createdBy, createdByName: form.createdByName,
      }

      if (form.caddyDesignation?.type === 'designated' && form.caddyDesignation.caddyId) {
        payload.caddyDesignation = {
          type: 'designated',
          caddyId: form.caddyDesignation.caddyId,
          caddyNo: form.caddyDesignation.caddyNo,
          caddyName: form.caddyDesignation.caddyName,
          caddyLevel: form.caddyDesignation.caddyLevel || 'trainee',
          designationFeeOverride: form.caddyDesignation.designationFeeOverride,
        }
      }

      if (form.isTeam) {
        payload.teamBooking = {
          isTeam: true, teamName: form.teamName,
          totalPlayers: form.totalPlayers || form.players.length,
          contactName: form.contactName, contactPhone: form.contactPhone,
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

  // ── 找到身份名称 ──
  const getIdentityName = (code: string) => {
    const found = activeIdentities.find(i => i.code === code)
    return found?.name || code
  }
  const getIdentityColor = (code: string) => {
    const found = activeIdentities.find(i => i.code === code)
    return found?.color || '#6b7280'
  }

  // ── 费用行渲染 ──
  const feeFields = [
    { key: 'greenFee',     label: '果岭费',   color: 'text-success' },
    { key: 'caddyFee',     label: '球童费',   color: 'text-blue-600' },
    { key: 'caddyDesignationFee', label: '点号费', color: 'text-amber-600' },
    { key: 'cartFee',      label: '球车费',   color: 'text-indigo-600' },
    { key: 'insuranceFee', label: '保险费',   color: 'text-muted-foreground' },
    { key: 'roomFee',      label: '客房费',   color: 'text-purple-600' },
    { key: 'otherFee',     label: '其他费用', color: 'text-muted-foreground' },
  ]
  const feeItems = feeFields.filter(f => (form as any)[f.key] > 0)

  const priceSourceLabel = form.priceSource === 'auto' ? '系统定价' : form.priceSource === 'package' ? '套餐价' : form.priceSource === 'addOn' ? '加打价' : form.priceSource === 'reduced' ? '减打价' : '手动'
  const priceSourceStyle = form.priceSource === 'auto' ? 'bg-success/10 text-success' : form.priceSource === 'package' ? 'bg-purple-100 text-purple-700' : form.priceSource === 'addOn' ? 'bg-blue-100 text-blue-700' : form.priceSource === 'reduced' ? 'bg-amber-100 text-amber-700' : 'bg-amber-100 text-amber-700'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-foreground text-lg">新建预订</h2>
            {pricingResult && pricingResult.success && (
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${pricingResult.dayType === 'holiday' ? 'bg-red-100 text-red-700' : pricingResult.dayType === 'weekend' ? 'bg-amber-100 text-amber-700' : 'bg-success/10 text-success'}`}>
                  {pricingResult.dayTypeName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                  {pricingResult.timeSlotName}
                </span>
                {pricingResult.dateName && <span className="text-[10px] text-muted-foreground">{pricingResult.dateName}</span>}
              </div>
            )}
            {pricingLoading && <span className="text-xs text-muted-foreground animate-pulse">算价中...</span>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>

        {/* 表单主体 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── 预订信息 ── */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">预订信息</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">日期 <span className="text-red-500">*</span></label>
                <input type="date" value={form.date} min={today} onChange={e => set('date', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">时间 <span className="text-red-500">*</span></label>
                <select value={form.teeTime} onChange={e => set('teeTime', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white">
                  {TEE_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">预订来源</label>
                <select value={form.bookingSource} onChange={e => set('bookingSource', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white">
                  {BOOKING_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">球场 <span className="text-red-500">*</span></label>
                <select value={form.courseId} onChange={e => handleCourseChange(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white">
                  <option value="">请选择球场</option>
                  {courses.map(c => <option key={c._id} value={c._id}>{c.name}（{c.holes}洞）</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">套餐</label>
                <select value={form.packageId} onChange={e => set('packageId', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white">
                  <option value="">无套餐</option>
                  {packages.map(p => <option key={p._id} value={p._id}>{p.packageName}</option>)}
                </select>
              </div>
            </div>
            {/* 次要选项：住宿类型（大多数预订为日归，折叠到此） */}
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground">住宿</span>
              <div className="flex gap-1">
                {STAY_TYPES.map(st => (
                  <button key={st.key} type="button" onClick={() => set('stayType', st.key)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-all ${
                      form.stayType === st.key
                        ? 'bg-success/10 text-success font-medium'
                        : 'text-muted-foreground hover:bg-secondary'
                    }`}>{st.label}</button>
                ))}
              </div>
            </div>
          </section>

          {/* ── 球员信息 ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                球员 <span className="text-muted-foreground font-normal normal-case">（{form.players.length}{form.isTeam ? ` / 团队${form.totalPlayers}人` : '/4'}）</span>
              </h3>
              <button onClick={addPlayer} className="flex items-center gap-1 text-xs text-success hover:text-success">
                <UserPlus size={13} /> 添加球员
              </button>
            </div>
            <div className="space-y-3">
              {form.players.map((player, idx) => (
                <div key={idx} className="bg-secondary/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium w-4 text-center flex-shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      {player.memberId ? (
                        <div className="flex items-center gap-2 bg-success/10 border border-success/20 rounded-lg px-2.5 py-1.5">
                          <div className="w-5 h-5 rounded-full bg-success/20 text-success text-[10px] font-bold flex items-center justify-center flex-shrink-0">{player.name?.[0]}</div>
                          <span className="text-sm font-medium text-success flex-1 truncate">{player.name}</span>
                          <span className="text-[10px] font-mono text-success">#{player.playerNo}</span>
                          <button type="button" onClick={() => { const next = [...form.players]; next[idx] = { ...EMPTY_PLAYER }; set('players', next) }}
                            className="p-0.5 text-success hover:text-red-400 transition-colors"><X size={12} /></button>
                        </div>
                      ) : (
                        <PlayerSearchDropdown value={player.name} onChange={val => setPlayer(idx, 'name', val)}
                          onSelect={p => selectPlayerFromSearch(idx, p)} placeholder="搜索球员姓名 / 手机 / 球员号" />
                      )}
                    </div>
                    {/* 动态身份选择 */}
                    <select value={player.identityCode} onChange={e => {
                      const code = e.target.value
                      const idType = activeIdentities.find(i => i.code === code)
                      const next = [...form.players]
                      next[idx] = {
                        ...next[idx],
                        identityCode: code,
                        type: idType?.category === 'member' ? 'member' : (code === 'guest' ? 'guest' : (code === 'walkin' ? 'walkin' : code)),
                        memberType: idType?.category === 'member' ? 'member' : code,
                        memberLevel: idType?.memberLevel || null,
                      }
                      set('players', next)
                    }}
                      className="w-24 px-2 py-2 border border-border rounded-lg text-xs focus:outline-none bg-white flex-shrink-0">
                      {activeIdentities.length > 0 ? (
                        activeIdentities.map(id => (
                          <option key={id.code} value={id.code}>{id.name}</option>
                        ))
                      ) : (
                        <>
                          <option value="walkin">散客</option>
                          <option value="guest">嘉宾</option>
                          <option value="member_1">会员</option>
                        </>
                      )}
                    </select>
                    <button onClick={() => removePlayer(idx)} className="p-1 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                  {/* 每人明细 */}
                  {pricingResult?.playerBreakdown?.[idx] && (
                    <div className="pl-6 text-xs text-muted-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getIdentityColor(player.identityCode) }} />
                      {getIdentityName(player.identityCode)}
                      {' '}¥{pricingResult.playerBreakdown[idx].greenFee}
                    </div>
                  )}
                  {!player.memberId && (
                    <div className="flex items-center gap-2 pl-6">
                      <input type="tel" value={player.phone} placeholder="手机号（选填）" onChange={e => setPlayer(idx, 'phone', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-ring bg-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 加打/减打属于运营阶段操作，由出发台在场上动态处理 */}

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
                  <label className="block text-xs text-muted-foreground mb-1">团队名称</label>
                  <input value={form.teamName} onChange={e => set('teamName', e.target.value)} placeholder="如：XX公司团建"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">总人数</label>
                  <input type="number" value={form.totalPlayers || ''} onChange={e => set('totalPlayers', Number(e.target.value))} min={1}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">联系人</label>
                  <input value={form.contactName} onChange={e => set('contactName', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">联系电话</label>
                  <input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
            )}
          </section>

          {/* ── 服务需求（具体分配由出发台调度） ── */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">服务需求</h3>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                form.needCaddy ? 'border-success/30 bg-success/10' : 'border-border hover:bg-secondary/50'
              }`}>
                <input type="checkbox" checked={form.needCaddy} onChange={e => {
                  const checked = e.target.checked
                  set('needCaddy', checked)
                  if (!checked) set('caddyDesignation', { type: 'none', caddyId: '', caddyNo: '', caddyName: '', caddyLevel: 'trainee' })
                }}
                  className="w-4 h-4 rounded text-success focus:ring-ring" />
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium ${form.needCaddy ? 'text-success' : 'text-muted-foreground'}`}>需要球童</span>
                  <p className="text-[10px] text-muted-foreground">出发台统一调度分配</p>
                  {form.needCaddy && (
                    <label className="mt-2 flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.caddyDesignation?.type === 'designated'}
                        onChange={e => {
                          if (!e.target.checked) {
                            set('caddyDesignation', { type: 'none', caddyId: '', caddyNo: '', caddyName: '', caddyLevel: 'trainee' })
                          } else {
                            setCaddieSelectOpen(true)
                          }
                        }}
                        className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-400" />
                      <span className="text-xs text-amber-700 font-medium">指定球童（点号）</span>
                    </label>
                  )}
                  {form.caddyDesignation?.type === 'designated' && form.caddyDesignation.caddyNo && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        {form.caddyDesignation.caddyNo}号 {form.caddyDesignation.caddyName}
                      </span>
                      <button type="button" onClick={() => setCaddieSelectOpen(true)}
                        className="text-amber-500 hover:text-amber-700 text-xs">更换</button>
                    </div>
                  )}
                </div>
              </label>
              <label className={`flex-1 flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                form.needCart ? 'border-success/30 bg-success/10' : 'border-border hover:bg-secondary/50'
              }`}>
                <input type="checkbox" checked={form.needCart} onChange={e => set('needCart', e.target.checked)}
                  className="w-4 h-4 rounded text-success focus:ring-ring" />
                <div>
                  <span className={`text-sm font-medium ${form.needCart ? 'text-success' : 'text-muted-foreground'}`}>需要球车</span>
                  <p className="text-[10px] text-muted-foreground">出发台统一调度分配</p>
                </div>
              </label>
            </div>
          </section>

          {/* ── 费用信息（折叠式） ── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setFeeExpanded(p => !p)}
                className="flex items-center gap-2 group">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">费用信息</h3>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform ${feeExpanded ? 'rotate-180' : ''}`} />
                {!feeExpanded && feeItems.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {feeItems.map(r => `${r.label}¥${(form as any)[r.key]}`).join('、')}
                  </span>
                )}
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.priceOverride} onChange={e => {
                  const override = e.target.checked
                  set('priceOverride', override)
                  if (override) {
                    set('priceSource', 'manual')
                    setLockedFields({ greenFee: false, caddyFee: false, caddyDesignationFee: false, cartFee: false, insuranceFee: false, roomFee: false, otherFee: false, discount: false })
                    setFeeExpanded(true)
                  } else {
                    set('priceSource', 'auto')
                    setLockedFields({ greenFee: true, caddyFee: true, caddyDesignationFee: true, cartFee: true, insuranceFee: true, roomFee: true, otherFee: true, discount: true })
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

            {feeExpanded && (
              <div className="grid grid-cols-3 gap-3 mt-2">
                {feeFields.map(f => (
                  <div key={f.key} className="relative">
                    <div className="flex items-center gap-1 mb-1">
                      <label className={`text-xs font-medium ${f.color}`}>{f.label}</label>
                      {!form.priceOverride && (
                        <button type="button" onClick={() => toggleLock(f.key)} className="p-0.5"
                          title={lockedFields[f.key] ? '系统自动（点击解锁手动输入）' : '已手动覆盖（点击恢复自动）'}>
                          {lockedFields[f.key] ? <Lock size={10} className="text-success" /> : <Unlock size={10} className="text-amber-500" />}
                        </button>
                      )}
                    </div>
                    <input type="number" value={(form as any)[f.key] || ''}
                      readOnly={!form.priceOverride && lockedFields[f.key]}
                      onChange={e => set(f.key as keyof BookingFormData, parseFloat(e.target.value) || 0)}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                        !form.priceOverride && lockedFields[f.key] ? 'border-success/20 bg-success/10/50 text-success' : 'border-border bg-white'
                      }`} />
                  </div>
                ))}
              </div>
            )}

            {/* 折扣减免（始终可见） */}
            <div className={`grid grid-cols-2 gap-3 ${feeExpanded ? 'mt-3' : 'mt-2'}`}>
              <div className="relative">
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs font-medium text-red-500">折扣减免</label>
                  {!form.priceOverride && (
                    <button type="button" onClick={() => toggleLock('discount')} className="p-0.5">
                      {lockedFields.discount ? <Lock size={10} className="text-success" /> : <Unlock size={10} className="text-amber-500" />}
                    </button>
                  )}
                </div>
                <input type="number" value={form.discount || ''} readOnly={!form.priceOverride && lockedFields.discount}
                  onChange={e => set('discount', parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                    !form.priceOverride && lockedFields.discount ? 'border-success/20 bg-success/10/50 text-success' : 'border-border bg-white'
                  }`} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">折扣原因</label>
                <input type="text" value={form.discountReason} onChange={e => set('discountReason', e.target.value)}
                  placeholder="如：会员折扣、赛事赞助…"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            {pricingResult?.teamDiscount && (
              <div className="mt-3 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-center gap-2">
                <Users size={12} /> 团队折扣已应用：{pricingResult.teamDiscount.label}，减免 ¥{pricingResult.teamDiscount.discountAmount}
              </div>
            )}
          </section>

          {/* ── 备注 ── */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">备注</h3>
            <textarea rows={2} value={form.note} onChange={e => set('note', e.target.value)} placeholder="特殊需求、注意事项等..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </section>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/50/50 rounded-b-2xl flex-shrink-0">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">应收合计：</span>
              <span className="text-xl font-bold text-success">¥{form.totalFee}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priceSourceStyle}`}>
                {priceSourceLabel}
              </span>
            </div>
            {feeItems.length > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {feeItems.map(r => `${r.label}¥${(form as any)[r.key]}`).join(' + ')}
                {form.discount > 0 && ` - 折扣¥${form.discount}`}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">取消</button>
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 disabled:opacity-50 transition-colors font-medium">
              {saving ? '创建中...' : '确认预订'}
            </button>
          </div>
        </div>
      </div>

      <CaddieSelectDialog
        open={caddieSelectOpen}
        onClose={() => setCaddieSelectOpen(false)}
        onSelect={handleCaddieSelect}
        date={form.date}
        teeTime={form.teeTime}
      />
    </div>
  )
}
