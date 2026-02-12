/**
 * 新建预订表单（v2）
 *
 * 升级点：
 *   - 球员行接入 /players/search 实时搜索，选中后自动带入 playerNo / phone / memberId
 *   - 加入果岭费（greenFee）/ 保险费（insuranceFee）字段
 *   - 费用汇总拆成 pricing 结构传入后端（与 bookings.js v2 对齐）
 *   - 创建时传入 createdByName，后端写入 statusHistory
 */
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { X, Plus, Trash2, UserPlus, Search, Check } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface BookingPlayer {
  name:      string
  type:      'member' | 'guest'
  phone:     string
  memberId:  string   // player _id（选中后填入）
  playerNo:  string   // 六位球员号
}

interface BookingFormData {
  date:         string
  teeTime:      string
  courseId:     string
  courseName:   string
  players:      BookingPlayer[]
  caddyId:      string
  caddyName:    string
  caddyFee:     number
  cartId:       string
  cartNo:       string
  cartFee:      number
  greenFee:     number
  insuranceFee: number
  totalFee:     number
  note:         string
  createdBy:    string
  createdByName: string
}

interface Course { _id: string; name: string; holes: number; status: string }
interface Caddie { _id: string; name: string; level: string; experience: number; status: string }
interface Cart   { _id: string; cartNo: string; model: string; feePerRound: number; status: string }

interface PlayerSuggestion {
  _id:         string
  playerNo:    string
  name:        string
  phoneNumber: string
  profile?: {
    memberLevel:   string
    consumeCardNo: string
    account:       { balance: number }
  }
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

const EMPTY_PLAYER: BookingPlayer = { name: '', type: 'member', phone: '', memberId: '', playerNo: '' }

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
  value:      string
  onChange:   (val: string) => void
  onSelect:   (p: PlayerSuggestion) => void
  placeholder?: string
}

function PlayerSearchDropdown({ value, onChange, onSelect, placeholder }: PlayerSearchDropdownProps) {
  const [results,   setResults]   = useState<PlayerSuggestion[]>([])
  const [open,      setOpen]      = useState(false)
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
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
        .then((res: any) => {
          const list = res.data || []
          setResults(list.slice(0, 6))
          setOpen(list.length > 0)
        })
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 350)
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || '姓名 / 手机 / 球员号'}
          className="w-full px-2.5 py-2 pr-7 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
        />
        {searching && (
          <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 animate-pulse" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {results.map(p => (
            <button
              key={p._id}
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 text-left transition-colors"
              onMouseDown={e => { e.preventDefault(); onSelect(p); setOpen(false) }}
            >
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {p.name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  {p.profile?.memberLevel && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 rounded-full">
                      {MEMBER_LEVEL_LABEL[p.profile.memberLevel] || p.profile.memberLevel}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                  <span className="font-mono">#{p.playerNo}</span>
                  {p.phoneNumber && <span>{p.phoneNumber}</span>}
                  {(p.profile?.account?.balance ?? 0) > 0 && (
                    <span className="text-emerald-600">余额¥{p.profile!.account.balance}</span>
                  )}
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
    date: initialDate || today,
    teeTime: '08:00',
    courseId: '', courseName: '',
    players: [{ ...EMPTY_PLAYER }],
    caddyId: '', caddyName: '', caddyFee: 0,
    cartId:  '', cartNo:    '', cartFee:  0,
    greenFee:     0,
    insuranceFee: 0,
    totalFee: 0,
    note: '',
    createdBy: '前台',
    createdByName: '前台',
  })

  const [courses, setCourses] = useState<Course[]>([])
  const [caddies, setCaddies] = useState<Caddie[]>([])
  const [carts,   setCarts]   = useState<Cart[]>([])
  const [saving,  setSaving]  = useState(false)

  // 加载资源
  useEffect(() => {
    Promise.all([
      api.resources.courses.getList({ status: 'active' }),
      api.resources.caddies.getList({ status: 'available' }),
      api.resources.carts.getList({ status: 'available' }),
    ]).then(([c, ca, ct]: any[]) => {
      const courseList = c.data || []
      setCourses(courseList)
      setCaddies(ca.data || [])
      setCarts(ct.data || [])
      // 默认选第一个球场
      if (courseList.length > 0 && !form.courseId) {
        setForm(p => ({ ...p, courseId: courseList[0]._id, courseName: courseList[0].name }))
      }
    }).catch(() => toast.error('加载资源数据失败'))
  }, [])

  // 自动重算总费用
  useEffect(() => {
    const total = form.greenFee + form.caddyFee + form.cartFee + form.insuranceFee
    setForm(p => ({ ...p, totalFee: total }))
  }, [form.greenFee, form.caddyFee, form.cartFee, form.insuranceFee])

  const set = (key: keyof BookingFormData, value: unknown) =>
    setForm(p => ({ ...p, [key]: value }))

  // 选球场
  const handleCourseChange = (id: string) => {
    const c = courses.find(c => c._id === id)
    setForm(p => ({ ...p, courseId: id, courseName: c?.name || '' }))
  }

  // 选球童
  const handleCaddyChange = (id: string) => {
    const c = caddies.find(c => c._id === id)
    setForm(p => ({ ...p, caddyId: id, caddyName: c?.name || '', caddyFee: id ? 200 : 0 }))
  }

  // 选球车
  const handleCartChange = (id: string) => {
    const c = carts.find(c => c._id === id)
    setForm(p => ({ ...p, cartId: id, cartNo: c?.cartNo || '', cartFee: c?.feePerRound || 0 }))
  }

  // 球员行操作
  const setPlayer = (idx: number, key: keyof BookingPlayer, val: string) => {
    const next = [...form.players]
    next[idx] = { ...next[idx], [key]: val }
    set('players', next)
  }

  const selectPlayerFromSearch = (idx: number, p: PlayerSuggestion) => {
    const next = [...form.players]
    next[idx] = {
      name:     p.name,
      type:     'member',
      phone:    p.phoneNumber || '',
      memberId: p._id,
      playerNo: p.playerNo,
    }
    set('players', next)
  }

  const addPlayer = () => {
    if (form.players.length >= 4) { toast.error('最多4位球员'); return }
    set('players', [...form.players, { ...EMPTY_PLAYER }])
  }

  const removePlayer = (idx: number) => {
    if (form.players.length <= 1) { toast.error('至少保留1位球员'); return }
    set('players', form.players.filter((_, i) => i !== idx))
  }

  // 提交
  const handleSave = async () => {
    if (!form.date)     { toast.error('请选择预订日期'); return }
    if (!form.teeTime)  { toast.error('请选择发球时间'); return }
    if (!form.courseId) { toast.error('请选择球场'); return }
    if (form.players.some(p => !p.name.trim())) { toast.error('请填写所有球员姓名'); return }

    setSaving(true)
    try {
      // 构建提交数据，与 bookings.js v2 对齐
      const payload = {
        ...form,
        // pricing 相关字段（后端 buildPricing 会自动构建）
        greenFee:     form.greenFee,
        caddyFee:     form.caddyFee,
        cartFee:      form.cartFee,
        insuranceFee: form.insuranceFee,
        totalFee:     form.totalFee,
      }
      await api.bookings.create(payload)
      toast.success('预订创建成功')
      onSuccess()
      onClose()
    } catch {
      /* 拦截器已处理 */
    } finally {
      setSaving(false)
    }
  }

  // 费用明细行（只显示 > 0 的项）
  const feeItems = [
    { label: '果岭费', value: form.greenFee },
    { label: '球童费', value: form.caddyFee },
    { label: '球车费', value: form.cartFee },
    { label: '保险费', value: form.insuranceFee },
  ].filter(r => r.value > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-lg">新建预订</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        {/* 表单主体 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── 预订信息 ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">预订信息</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">预订日期 <span className="text-red-500">*</span></label>
                <input type="date" value={form.date} min={today}
                  onChange={e => set('date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">发球时间 <span className="text-red-500">*</span></label>
                <select value={form.teeTime} onChange={e => set('teeTime', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  {TEE_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
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
            </div>
          </section>

          {/* ── 球员信息 ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                球员信息 <span className="text-gray-300 font-normal normal-case">（{form.players.length}/4）</span>
              </h3>
              <button onClick={addPlayer} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700">
                <UserPlus size={13} /> 添加球员
              </button>
            </div>

            <div className="space-y-3">
              {form.players.map((player, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  {/* 第一行：序号 + 搜索框 + 类型 + 删除 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium w-4 text-center flex-shrink-0">{idx + 1}</span>

                    {/* 搜索框（选中后显示已选信息） */}
                    <div className="flex-1 min-w-0">
                      {player.memberId ? (
                        // 已选中球员 → 展示徽章，可清除
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                          <div className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            {player.name?.[0]}
                          </div>
                          <span className="text-sm font-medium text-emerald-800 flex-1 truncate">{player.name}</span>
                          <span className="text-[10px] font-mono text-emerald-500">#{player.playerNo}</span>
                          <button type="button"
                            onClick={() => {
                              const next = [...form.players]
                              next[idx] = { ...EMPTY_PLAYER }
                              set('players', next)
                            }}
                            className="p-0.5 text-emerald-400 hover:text-red-400 transition-colors">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <PlayerSearchDropdown
                          value={player.name}
                          onChange={val => setPlayer(idx, 'name', val)}
                          onSelect={p => selectPlayerFromSearch(idx, p)}
                          placeholder="搜索球员姓名 / 手机 / 球员号"
                        />
                      )}
                    </div>

                    <select value={player.type} onChange={e => setPlayer(idx, 'type', e.target.value)}
                      className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none bg-white flex-shrink-0">
                      <option value="member">会员</option>
                      <option value="guest">嘉宾</option>
                    </select>

                    <button onClick={() => removePlayer(idx)} className="p-1 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* 第二行：手机号（未选中会员时显示） */}
                  {!player.memberId && (
                    <div className="flex items-center gap-2 pl-6">
                      <input type="tel" value={player.phone} placeholder="手机号（选填）"
                        onChange={e => setPlayer(idx, 'phone', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── 服务配置 ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">服务配置</h3>
            <div className="grid grid-cols-2 gap-4">
              {/* 球童 */}
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">球童（可选）</label>
                <select value={form.caddyId} onChange={e => handleCaddyChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option value="">不需要球童</option>
                  {caddies.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name}（{LEVEL_MAP[c.level] || c.level}·{c.experience}年）
                    </option>
                  ))}
                </select>
                {form.caddyId && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-gray-500">球童费：</span>
                    <input type="number" value={form.caddyFee} min={0}
                      onChange={e => set('caddyFee', parseFloat(e.target.value) || 0)}
                      className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                    <span className="text-xs text-gray-400">元</span>
                  </div>
                )}
              </div>
              {/* 球车 */}
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">球车（可选）</label>
                <select value={form.cartId} onChange={e => handleCartChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  <option value="">不需要球车</option>
                  {carts.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.cartNo}{c.model ? `（${c.model}）` : ''} ¥{c.feePerRound}/轮
                    </option>
                  ))}
                </select>
                {form.cartId && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-gray-500">球车费：</span>
                    <input type="number" value={form.cartFee} min={0}
                      onChange={e => set('cartFee', parseFloat(e.target.value) || 0)}
                      className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                    <span className="text-xs text-gray-400">元</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── 费用信息 ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">费用信息</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">果岭费（元）</label>
                <input type="number" value={form.greenFee} min={0}
                  onChange={e => set('greenFee', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">保险费（元）</label>
                <input type="number" value={form.insuranceFee} min={0}
                  onChange={e => set('insuranceFee', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>
          </section>

          {/* ── 备注 ── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">备注</h3>
            <textarea rows={2} value={form.note} onChange={e => set('note', e.target.value)}
              placeholder="特殊需求、注意事项等..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
          </section>
        </div>

        {/* 底部：费用汇总 + 操作 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-gray-500">预计费用：</span>
              <span className="text-xl font-bold text-emerald-600">¥{form.totalFee}</span>
            </div>
            {feeItems.length > 0 && (
              <div className="text-xs text-gray-400 mt-0.5">
                {feeItems.map(r => `${r.label}¥${r.value}`).join(' + ')}
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
