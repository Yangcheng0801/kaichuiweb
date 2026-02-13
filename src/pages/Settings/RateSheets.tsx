/**
 * 价格矩阵管理页面 (Rate Sheets)
 *
 * 功能：
 *   - 矩阵表格视图：行=日期类型（平日/周末/假日），列=时段（早场/午场/黄昏）
 *   - 点击单元格编辑该组合下所有身份的价格
 *   - 批量初始化：一键生成 3×3=9 条基础规则
 *   - 有效期管理
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Zap, X, Edit3, DollarSign, Clock, Sun, Sunset, Moon } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface RateSheet {
  _id: string
  clubId: string
  courseId: string | null
  ruleName: string
  dayType: string
  timeSlot: string
  startTime: string
  endTime: string
  holes: number
  priceWalkin: number
  priceGuest: number
  priceMember1: number
  priceMember2: number
  priceMember3: number
  priceMember4: number
  caddyFee: number
  cartFee: number
  insuranceFee: number
  priority: number
  status: string
  validFrom: string
  validTo: string
}

interface MatrixData {
  matrix: Record<string, Record<string, RateSheet | null>>
  dayTypes: { key: string; label: string }[]
  timeSlots: { key: string; label: string }[]
  totalRules: number
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DAY_TYPE_ICONS: Record<string, React.ReactNode> = {
  weekday: <Clock size={14} />,
  weekend: <Sun size={14} />,
  holiday: <Sunset size={14} />,
}

const TIME_SLOT_ICONS: Record<string, React.ReactNode> = {
  morning: <Sun size={14} className="text-amber-500" />,
  afternoon: <Sunset size={14} className="text-orange-500" />,
  twilight: <Moon size={14} className="text-indigo-500" />,
}

const IDENTITY_LABELS = [
  { key: 'priceWalkin',  label: '散客',     color: 'text-gray-700' },
  { key: 'priceGuest',   label: '嘉宾',     color: 'text-blue-600' },
  { key: 'priceMember1', label: '普通会员', color: 'text-emerald-600' },
  { key: 'priceMember2', label: '金卡',     color: 'text-yellow-600' },
  { key: 'priceMember3', label: '钻石',     color: 'text-purple-600' },
  { key: 'priceMember4', label: '白金',     color: 'text-rose-600' },
]

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function RateSheets() {
  const [matrix, setMatrix] = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editRule, setEditRule] = useState<RateSheet | null>(null)
  const [editForm, setEditForm] = useState<Partial<RateSheet>>({})
  const [saving, setSaving] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [batchParams, setBatchParams] = useState({
    basePrice: 1200,
    weekendRate: 1.5,
    holidayRate: 1.8,
    afternoonRate: 0.8,
    twilightRate: 0.6,
    guestDiscount: 0.85,
    caddyFee: 200,
    cartFee: 150,
    insuranceFee: 10,
  })

  const loadMatrix = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await api.rateSheets.getMatrix()
      setMatrix(res.data)
    } catch {
      // interceptor handles
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMatrix() }, [loadMatrix])

  // ── 编辑规则 ──
  const openEdit = (rule: RateSheet | null, dayType?: string, timeSlot?: string) => {
    if (rule) {
      setEditRule(rule)
      setEditForm({ ...rule })
    } else {
      // 新建
      setEditRule(null)
      setEditForm({
        dayType: dayType || 'weekday',
        timeSlot: timeSlot || 'morning',
        priceWalkin: 0, priceGuest: 0,
        priceMember1: 0, priceMember2: 0, priceMember3: 0, priceMember4: 0,
        caddyFee: 200, cartFee: 150, insuranceFee: 10,
        holes: 18, priority: 100, status: 'active',
      })
    }
  }

  const closeEdit = () => { setEditRule(null); setEditForm({}) }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editRule?._id) {
        await api.rateSheets.update(editRule._id, editForm)
        toast.success('价格规则更新成功')
      } else {
        await api.rateSheets.create(editForm)
        toast.success('价格规则创建成功')
      }
      closeEdit()
      loadMatrix()
    } catch {
      // interceptor
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该价格规则？')) return
    try {
      await api.rateSheets.remove(id)
      toast.success('已删除')
      loadMatrix()
    } catch {}
  }

  // ── 批量初始化 ──
  const handleBatch = async () => {
    setBatchLoading(true)
    try {
      const res: any = await api.rateSheets.batch(batchParams)
      toast.success(res.message || '批量创建成功')
      setShowBatchForm(false)
      loadMatrix()
    } catch {} finally {
      setBatchLoading(false)
    }
  }

  // ── 矩阵渲染 ──
  const renderMatrix = () => {
    if (!matrix) return null
    const { dayTypes, timeSlots } = matrix

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 rounded-tl-lg" />
              {timeSlots.map(ts => (
                <th key={ts.key} className="px-4 py-3 text-center text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center justify-center gap-1.5">
                    {TIME_SLOT_ICONS[ts.key]}
                    {ts.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayTypes.map(dt => (
              <tr key={dt.key} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-700 border-b border-gray-100 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {DAY_TYPE_ICONS[dt.key]}
                    {dt.label}
                  </div>
                </td>
                {timeSlots.map(ts => {
                  const rule = matrix.matrix[dt.key]?.[ts.key]
                  return (
                    <td key={ts.key} className="px-2 py-2 border-b border-gray-100">
                      {rule ? (
                        <button
                          onClick={() => openEdit(rule)}
                          className="w-full text-left p-3 rounded-xl bg-emerald-50 border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-100 transition-all group cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-medium text-emerald-600">{rule.ruleName}</span>
                            <Edit3 size={10} className="text-emerald-300 group-hover:text-emerald-600 transition-colors" />
                          </div>
                          <div className="text-lg font-bold text-gray-900">¥{rule.priceWalkin}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            嘉宾¥{rule.priceGuest} · 会员¥{rule.priceMember1}
                          </div>
                        </button>
                      ) : (
                        <button
                          onClick={() => openEdit(null, dt.key, ts.key)}
                          className="w-full p-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-emerald-400 text-gray-300 hover:text-emerald-600 transition-all text-center text-xs"
                        >
                          + 添加价格
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── 编辑弹窗 ──
  const renderEditModal = () => {
    if (!editForm.dayType && !editRule) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <DollarSign size={18} className="text-emerald-600" />
              {editRule ? '编辑价格规则' : '新建价格规则'}
            </h2>
            <button onClick={closeEdit} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* 规则名 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">规则名称</label>
              <input
                value={editForm.ruleName || ''}
                onChange={e => setEditForm(p => ({ ...p, ruleName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="如：平日早场价格"
              />
            </div>

            {/* 各身份果岭费 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">各身份果岭费（元/人）</label>
              <div className="grid grid-cols-2 gap-3">
                {IDENTITY_LABELS.map(id => (
                  <div key={id.key}>
                    <label className={`block text-xs font-medium mb-1 ${id.color}`}>{id.label}</label>
                    <input
                      type="number"
                      value={(editForm as any)[id.key] || ''}
                      onChange={e => setEditForm(p => ({ ...p, [id.key]: Number(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 附加费 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">附加费标准</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">球童费</label>
                  <input type="number" value={editForm.caddyFee || ''} onChange={e => setEditForm(p => ({ ...p, caddyFee: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">球车费</label>
                  <input type="number" value={editForm.cartFee || ''} onChange={e => setEditForm(p => ({ ...p, cartFee: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">保险费</label>
                  <input type="number" value={editForm.insuranceFee || ''} onChange={e => setEditForm(p => ({ ...p, insuranceFee: Number(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
            </div>

            {/* 有效期 + 优先级 */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">生效日期</label>
                <input type="date" value={editForm.validFrom || ''} onChange={e => setEditForm(p => ({ ...p, validFrom: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">失效日期</label>
                <input type="date" value={editForm.validTo || ''} onChange={e => setEditForm(p => ({ ...p, validTo: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">优先级</label>
                <input type="number" value={editForm.priority || ''} onChange={e => setEditForm(p => ({ ...p, priority: Number(e.target.value) || 100 }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            {editRule?._id ? (
              <button onClick={() => { handleDelete(editRule._id); closeEdit() }} className="text-xs text-red-400 hover:text-red-600">删除此规则</button>
            ) : <span />}
            <div className="flex gap-3">
              <button onClick={closeEdit} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">取消</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题 + 操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">价格矩阵</h2>
          <p className="text-sm text-gray-500 mt-0.5">管理各日期类型和时段下的果岭费及附加费</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadMatrix} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> 刷新
          </button>
          <button onClick={() => setShowBatchForm(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
            <Zap size={14} /> 一键生成
          </button>
        </div>
      </div>

      {/* 矩阵 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">加载中...</div>
      ) : (
        renderMatrix()
      )}

      {/* 编辑弹窗 */}
      {(editRule || editForm.dayType) && renderEditModal()}

      {/* 批量初始化弹窗 */}
      {showBatchForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">一键生成价格矩阵</h2>
              <button onClick={() => setShowBatchForm(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-gray-500">以散客平日早场价为基准，按比例自动生成 9 条价格规则（3种日期类型 x 3种时段）。</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">基准价格（散客·平日·早场）</label>
                <input type="number" value={batchParams.basePrice} onChange={e => setBatchParams(p => ({ ...p, basePrice: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">周末系数</label><input type="number" step="0.1" value={batchParams.weekendRate} onChange={e => setBatchParams(p => ({ ...p, weekendRate: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">假日系数</label><input type="number" step="0.1" value={batchParams.holidayRate} onChange={e => setBatchParams(p => ({ ...p, holidayRate: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">嘉宾折扣</label><input type="number" step="0.05" value={batchParams.guestDiscount} onChange={e => setBatchParams(p => ({ ...p, guestDiscount: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">球童费</label><input type="number" value={batchParams.caddyFee} onChange={e => setBatchParams(p => ({ ...p, caddyFee: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">球车费</label><input type="number" value={batchParams.cartFee} onChange={e => setBatchParams(p => ({ ...p, cartFee: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">保险费</label><input type="number" value={batchParams.insuranceFee} onChange={e => setBatchParams(p => ({ ...p, insuranceFee: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowBatchForm(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleBatch} disabled={batchLoading} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50">
                {batchLoading ? '生成中...' : '确认生成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
