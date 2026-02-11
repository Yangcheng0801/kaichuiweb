import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { X, Plus, Trash2, UserPlus } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface Player {
  name: string
  type: 'member' | 'guest'
  phone: string
  memberId: string
}

interface BookingFormData {
  date: string
  teeTime: string
  courseId: string
  courseName: string
  players: Player[]
  caddyId: string
  caddyName: string
  caddyFee: number
  cartId: string
  cartNo: string
  cartFee: number
  totalFee: number
  note: string
  createdBy: string
}

interface Course { _id: string; name: string; holes: number; status: string }
interface Caddie { _id: string; name: string; level: string; experience: number; status: string }
interface Cart   { _id: string; cartNo: string; model: string; feePerRound: number; status: string }

interface Props {
  onClose: () => void
  onSuccess: () => void
  initialDate?: string   // 从发球表点击新增时带入日期
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const LEVEL_MAP: Record<string, string> = { junior: '初级', senior: '中级', expert: '高级' }

const EMPTY_PLAYER: Player = { name: '', type: 'member', phone: '', memberId: '' }

const today = new Date().toISOString().slice(0, 10)

// 生成发球时间选项（06:00 ~ 17:50，每10分钟）
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

// ─── 组件 ────────────────────────────────────────────────────────────────────

export default function BookingForm({ onClose, onSuccess, initialDate }: Props) {
  const [form, setForm] = useState<BookingFormData>({
    date: initialDate || today,
    teeTime: '08:00',
    courseId: '', courseName: '',
    players: [{ ...EMPTY_PLAYER }],
    caddyId: '', caddyName: '', caddyFee: 0,
    cartId: '',  cartNo: '',   cartFee: 0,
    totalFee: 0,
    note: '', createdBy: '前台'
  })

  const [courses, setCourses]   = useState<Course[]>([])
  const [caddies, setCaddies]   = useState<Caddie[]>([])
  const [carts, setCarts]       = useState<Cart[]>([])
  const [saving, setSaving]     = useState(false)

  // 加载资源数据
  useEffect(() => {
    Promise.all([
      api.resources.courses.getList({ status: 'active' }),
      api.resources.caddies.getList({ status: 'available' }),
      api.resources.carts.getList({ status: 'available' }),
    ]).then(([c, ca, ct]: any[]) => {
      setCourses(c.data || [])
      setCaddies(ca.data || [])
      setCarts(ct.data || [])
    }).catch(() => toast.error('加载资源数据失败'))
  }, [])

  // 自动计算总费用
  useEffect(() => {
    const total = form.caddyFee + form.cartFee
    setForm(p => ({ ...p, totalFee: total }))
  }, [form.caddyFee, form.cartFee])

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
    setForm(p => ({
      ...p,
      caddyId: id,
      caddyName: c?.name || '',
      caddyFee: id ? 200 : 0   // 默认球童费，实际可从 pricing_rules 取
    }))
  }

  // 选球车
  const handleCartChange = (id: string) => {
    const c = carts.find(c => c._id === id)
    setForm(p => ({
      ...p,
      cartId: id,
      cartNo: c?.cartNo || '',
      cartFee: c?.feePerRound || 0
    }))
  }

  // 球员列表操作
  const setPlayer = (idx: number, key: keyof Player, val: string) => {
    const next = [...form.players]
    next[idx] = { ...next[idx], [key]: val }
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

  const handleSave = async () => {
    if (!form.date)     { toast.error('请选择预订日期'); return }
    if (!form.teeTime)  { toast.error('请选择发球时间'); return }
    if (!form.courseId) { toast.error('请选择球场'); return }
    if (form.players.some(p => !p.name.trim())) { toast.error('请填写所有球员姓名'); return }

    setSaving(true)
    try {
      await api.bookings.create(form)
      toast.success('预订创建成功')
      onSuccess()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-lg">新建预订</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        {/* 表单主体（可滚动）*/}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* 基础信息 */}
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
                  {courses.map(c => (
                    <option key={c._id} value={c._id}>{c.name}（{c.holes}洞）</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 球员信息 */}
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
                <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-gray-50 p-3 rounded-xl">
                  <div className="col-span-1 pt-2.5 text-xs text-gray-400 font-medium text-center">{idx + 1}</div>
                  <div className="col-span-4">
                    <input type="text" value={player.name} placeholder="姓名 *"
                      onChange={e => setPlayer(idx, 'name', e.target.value)}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                  </div>
                  <div className="col-span-2">
                    <select value={player.type} onChange={e => setPlayer(idx, 'type', e.target.value)}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                      <option value="member">会员</option>
                      <option value="guest">嘉宾</option>
                    </select>
                  </div>
                  <div className="col-span-4">
                    <input type="tel" value={player.phone} placeholder="手机号（选填）"
                      onChange={e => setPlayer(idx, 'phone', e.target.value)}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white" />
                  </div>
                  <div className="col-span-1 flex items-center justify-center pt-1">
                    <button onClick={() => removePlayer(idx)} className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 服务配置 */}
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
                      {c.name}（{LEVEL_MAP[c.level]}·{c.experience}年）
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

          {/* 备注 */}
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">备注</h3>
            <textarea rows={2} value={form.note} onChange={e => set('note', e.target.value)}
              placeholder="特殊需求、注意事项等..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
          </section>
        </div>

        {/* 底部：费用汇总 + 操作按钮 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
          <div className="text-sm">
            <span className="text-gray-500">预计费用：</span>
            <span className="text-xl font-semibold text-emerald-600 ml-1">¥{form.totalFee}</span>
            {(form.caddyFee > 0 || form.cartFee > 0) && (
              <span className="text-xs text-gray-400 ml-2">
                ({[form.caddyFee > 0 && `球童¥${form.caddyFee}`, form.cartFee > 0 && `球车¥${form.cartFee}`].filter(Boolean).join(' + ')})
              </span>
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
