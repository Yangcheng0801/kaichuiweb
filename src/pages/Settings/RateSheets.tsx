/**
 * 价格矩阵管理页面 (Rate Sheets) v2
 *
 * 升级：
 *   - 动态身份列：从 identity_types 集合加载，替代硬编码 6 列
 *   - 加打定价区域：为每种身份设置加打 9 洞的价格
 *   - 减打策略区域：选择减打策略（比例/固定/不退款）
 *   - 矩阵表格 + 弹窗编辑保留原有结构
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Zap, X, Edit3, DollarSign, Clock, Sun, Sunset, Moon, Plus, Minus } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface IdentityType {
  _id: string; code: string; name: string; category: string; color: string; sortOrder: number; status: string
}

interface RateSheet {
  _id: string; clubId: string; courseId: string | null
  ruleName: string; dayType: string; timeSlot: string
  startTime: string; endTime: string; holes: number
  // 新版动态定价
  prices: Record<string, number>
  addOnPrices: Record<string, number>
  reducedPlayPolicy: { type: string; rate: number; fixedPrices: Record<string, number> }
  // 旧字段（兼容）
  priceWalkin: number; priceGuest: number
  priceMember1: number; priceMember2: number; priceMember3: number; priceMember4: number
  caddyFee: number; cartFee: number; insuranceFee: number
  priority: number; status: string; validFrom: string; validTo: string
}

interface MatrixData {
  matrix: Record<string, Record<string, RateSheet | null>>
  dayTypes: { key: string; label: string }[]
  timeSlots: { key: string; label: string }[]
  totalRules: number
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DAY_TYPE_ICONS: Record<string, React.ReactNode> = {
  weekday: <Clock size={14} />, weekend: <Sun size={14} />, holiday: <Sunset size={14} />,
}
const TIME_SLOT_ICONS: Record<string, React.ReactNode> = {
  morning: <Sun size={14} className="text-amber-500" />,
  afternoon: <Sunset size={14} className="text-orange-500" />,
  twilight: <Moon size={14} className="text-indigo-500" />,
}

const REDUCED_PLAY_TYPES = [
  { key: 'proportional', label: '按比例收费', description: '按实际打球洞数比例 × 最低费率' },
  { key: 'fixed_rate',   label: '固定减打价', description: '为每种身份设置固定的减打价格' },
  { key: 'no_refund',    label: '不退差价',   description: '无论打几洞，按全价收费' },
]

// ─── 兼容：从 rate_sheet 提取 prices ──────────────────────────────────────────
function extractPrices(rule: RateSheet): Record<string, number> {
  if (rule.prices && typeof rule.prices === 'object' && Object.keys(rule.prices).length > 0) {
    return rule.prices
  }
  // 旧版兼容
  return {
    walkin:   rule.priceWalkin || 0,
    guest:    rule.priceGuest || 0,
    member_1: rule.priceMember1 || 0,
    member_2: rule.priceMember2 || 0,
    member_3: rule.priceMember3 || 0,
    member_4: rule.priceMember4 || 0,
  }
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function RateSheets() {
  const [matrix, setMatrix] = useState<MatrixData | null>(null)
  const [identityTypes, setIdentityTypes] = useState<IdentityType[]>([])
  const [loading, setLoading] = useState(true)
  const [editRule, setEditRule] = useState<RateSheet | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [activeEditTab, setActiveEditTab] = useState<'standard' | 'addOn' | 'reduced'>('standard')
  const [batchParams, setBatchParams] = useState({
    basePrice: 1200, weekendRate: 1.5, holidayRate: 1.8,
    afternoonRate: 0.8, twilightRate: 0.6, guestDiscount: 0.85,
    caddyFee: 200, cartFee: 150, insuranceFee: 10,
    addOnRate: 0.5, reducedPlayType: 'proportional', reducedPlayRate: 0.6,
  })

  // ── 加载 ──
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [matrixRes, idRes]: any[] = await Promise.all([
        api.rateSheets.getMatrix(),
        api.identityTypes.getList({ status: 'active' }),
      ])
      setMatrix(matrixRes.data)
      setIdentityTypes(idRes.data || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const activeIdentities = identityTypes.filter(i => i.status === 'active')

  // ── 编辑 ──
  const openEdit = (rule: RateSheet | null, dayType?: string, timeSlot?: string) => {
    setActiveEditTab('standard')
    if (rule) {
      const prices = extractPrices(rule)
      setEditRule(rule)
      setEditForm({
        ...rule,
        prices: { ...prices },
        addOnPrices: { ...(rule.addOnPrices || {}) },
        reducedPlayPolicy: {
          type: rule.reducedPlayPolicy?.type || 'proportional',
          rate: rule.reducedPlayPolicy?.rate ?? 0.6,
          fixedPrices: { ...(rule.reducedPlayPolicy?.fixedPrices || {}) },
        },
      })
    } else {
      setEditRule(null)
      const defaultPrices: Record<string, number> = {}
      activeIdentities.forEach(i => { defaultPrices[i.code] = 0 })
      setEditForm({
        dayType: dayType || 'weekday', timeSlot: timeSlot || 'morning',
        prices: defaultPrices, addOnPrices: {},
        reducedPlayPolicy: { type: 'proportional', rate: 0.6, fixedPrices: {} },
        caddyFee: 200, cartFee: 150, insuranceFee: 10,
        holes: 18, priority: 100, status: 'active',
      })
    }
  }

  const closeEdit = () => { setEditRule(null); setEditForm({}); setActiveEditTab('standard') }

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
      loadData()
    } catch {} finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该价格规则？')) return
    try {
      await api.rateSheets.remove(id)
      toast.success('已删除')
      loadData()
    } catch {}
  }

  // ── 批量初始化 ──
  const handleBatch = async () => {
    setBatchLoading(true)
    try {
      const res: any = await api.rateSheets.batch(batchParams)
      toast.success(res.message || '批量创建成功')
      setShowBatchForm(false)
      loadData()
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground bg-secondary/50 border-b border-border rounded-tl-lg" />
              {timeSlots.map(ts => (
                <th key={ts.key} className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground bg-secondary/50 border-b border-border">
                  <div className="flex items-center justify-center gap-1.5">
                    {TIME_SLOT_ICONS[ts.key]}{ts.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayTypes.map(dt => (
              <tr key={dt.key} className="hover:bg-secondary/50/50">
                <td className="px-4 py-3 text-sm font-medium text-foreground border-b border-border whitespace-nowrap">
                  <div className="flex items-center gap-1.5">{DAY_TYPE_ICONS[dt.key]}{dt.label}</div>
                </td>
                {timeSlots.map(ts => {
                  const rule = matrix.matrix[dt.key]?.[ts.key]
                  return (
                    <td key={ts.key} className="px-2 py-2 border-b border-border">
                      {rule ? (
                        <button onClick={() => openEdit(rule)}
                          className="w-full text-left p-3 rounded-xl bg-success/10 border border-success/10 hover:border-success/30 hover:bg-success/10 transition-all group cursor-pointer">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-medium text-success">{rule.ruleName}</span>
                            <Edit3 size={10} className="text-success/70 group-hover:text-success transition-colors" />
                          </div>
                          <div className="text-lg font-bold text-foreground">¥{extractPrices(rule).walkin || rule.priceWalkin || 0}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                            {activeIdentities.slice(1, 4).map(id => (
                              <span key={id.code}>{id.name}¥{extractPrices(rule)[id.code] || 0}</span>
                            ))}
                          </div>
                          {/* 加打/减打标识 */}
                          <div className="flex gap-1 mt-1">
                            {rule.addOnPrices && Object.keys(rule.addOnPrices).length > 0 && (
                              <span className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded">加打</span>
                            )}
                            {rule.reducedPlayPolicy?.type && rule.reducedPlayPolicy.type !== 'proportional' && (
                              <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded">减打</span>
                            )}
                          </div>
                        </button>
                      ) : (
                        <button onClick={() => openEdit(null, dt.key, ts.key)}
                          className="w-full p-3 rounded-xl border-2 border-dashed border-border hover:border-success text-muted-foreground hover:text-success transition-all text-center text-xs">
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

    const prices = editForm.prices || {}
    const addOnPrices = editForm.addOnPrices || {}
    const rpp = editForm.reducedPlayPolicy || { type: 'proportional', rate: 0.6, fixedPrices: {} }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* 标题 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <DollarSign size={18} className="text-success" />
              {editRule ? '编辑价格规则' : '新建价格规则'}
            </h2>
            <button onClick={closeEdit} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
          </div>

          {/* Tab 切换 */}
          <div className="flex gap-1 px-6 pt-3 pb-0">
            {([
              { key: 'standard', label: '标准定价', icon: <DollarSign size={13} /> },
              { key: 'addOn',    label: '加打定价', icon: <Plus size={13} /> },
              { key: 'reduced',  label: '减打策略', icon: <Minus size={13} /> },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveEditTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-all border-b-2 ${
                  activeEditTab === tab.key
                    ? 'border-success text-success bg-success/10'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* 内容 */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* 通用：规则名 */}
            {activeEditTab === 'standard' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">规则名称</label>
                  <input value={editForm.ruleName || ''} onChange={e => setEditForm((p: any) => ({ ...p, ruleName: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="如：平日早场价格" />
                </div>

                {/* 各身份果岭费 */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">各身份果岭费（元/人·18洞）</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {activeIdentities.map(id => (
                      <div key={id.code}>
                        <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: id.color }} />
                          {id.name}
                        </label>
                        <input type="number" value={prices[id.code] ?? ''} onChange={e => {
                          const val = Number(e.target.value) || 0
                          setEditForm((p: any) => ({ ...p, prices: { ...p.prices, [id.code]: val } }))
                        }} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 附加费 */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">附加费标准</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ key: 'caddyFee', label: '球童费' }, { key: 'cartFee', label: '球车费' }, { key: 'insuranceFee', label: '保险费' }].map(f => (
                      <div key={f.key}>
                        <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                        <input type="number" value={editForm[f.key] || ''} onChange={e => setEditForm((p: any) => ({ ...p, [f.key]: Number(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 有效期 + 优先级 */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">生效日期</label>
                    <input type="date" value={editForm.validFrom || ''} onChange={e => setEditForm((p: any) => ({ ...p, validFrom: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">失效日期</label>
                    <input type="date" value={editForm.validTo || ''} onChange={e => setEditForm((p: any) => ({ ...p, validTo: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">优先级</label>
                    <input type="number" value={editForm.priority || ''} onChange={e => setEditForm((p: any) => ({ ...p, priority: Number(e.target.value) || 100 }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
              </>
            )}

            {/* 加打定价 Tab */}
            {activeEditTab === 'addOn' && (
              <>
                <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                  <strong>加打（加9洞）</strong>：球员完赛后追加 9 洞的费用。通常为标准 18 洞价格的 40%~60%。如不设置则自动按标准价 50% 估算。
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2">各身份加打价格（元/人·9洞）</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {activeIdentities.map(id => {
                      const standardPrice = prices[id.code] || 0
                      const addOnPrice = addOnPrices[id.code]
                      const estimated = addOnPrice === undefined || addOnPrice === null
                      return (
                        <div key={id.code}>
                          <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: id.color }} />
                            {id.name}
                            {estimated && <span className="text-[9px] text-muted-foreground">（默认50%≈¥{Math.round(standardPrice * 0.5)}）</span>}
                          </label>
                          <input type="number" value={addOnPrices[id.code] ?? ''} onChange={e => {
                            const val = e.target.value === '' ? undefined : Number(e.target.value) || 0
                            setEditForm((p: any) => {
                              const next = { ...p.addOnPrices }
                              if (val === undefined) delete next[id.code]
                              else next[id.code] = val
                              return { ...p, addOnPrices: next }
                            })
                          }} placeholder={`≈${Math.round(standardPrice * 0.5)}`}
                            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const newAddOn: Record<string, number> = {}
                    activeIdentities.forEach(i => { newAddOn[i.code] = Math.round((prices[i.code] || 0) * 0.5) })
                    setEditForm((p: any) => ({ ...p, addOnPrices: newAddOn }))
                  }} className="px-3 py-1.5 text-xs bg-info/10 text-info border border-info/20 rounded-lg hover:bg-blue-200">
                    一键填充（50%）
                  </button>
                  <button onClick={() => {
                    const newAddOn: Record<string, number> = {}
                    activeIdentities.forEach(i => { newAddOn[i.code] = Math.round((prices[i.code] || 0) * 0.4) })
                    setEditForm((p: any) => ({ ...p, addOnPrices: newAddOn }))
                  }} className="px-3 py-1.5 text-xs bg-info/10 text-info border border-info/20 rounded-lg hover:bg-blue-200">
                    一键填充（40%）
                  </button>
                  <button onClick={() => setEditForm((p: any) => ({ ...p, addOnPrices: {} }))}
                    className="px-3 py-1.5 text-xs bg-secondary text-muted-foreground rounded-lg hover:bg-secondary">
                    清空（使用默认估算）
                  </button>
                </div>
              </>
            )}

            {/* 减打策略 Tab */}
            {activeEditTab === 'reduced' && (
              <>
                <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
                  <strong>减打（减洞）</strong>：球员未打满预定洞数时的计费方式。如预订 18 洞实际只打了 9 洞。
                </div>
                {/* 策略选择 */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">减打计费策略</label>
                  {REDUCED_PLAY_TYPES.map(t => (
                    <label key={t.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      rpp.type === t.key ? 'border-amber-300 bg-amber-50' : 'border-border hover:bg-secondary/50'
                    }`}>
                      <input type="radio" name="reducedType" value={t.key} checked={rpp.type === t.key}
                        onChange={() => setEditForm((p: any) => ({ ...p, reducedPlayPolicy: { ...p.reducedPlayPolicy, type: t.key } }))}
                        className="mt-0.5 text-amber-600 focus:ring-amber-400" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* 比例收费率 */}
                {rpp.type === 'proportional' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">最低收费比例（0.4 = 40%）</label>
                    <input type="number" step="0.05" min="0" max="1" value={rpp.rate ?? 0.6}
                      onChange={e => setEditForm((p: any) => ({ ...p, reducedPlayPolicy: { ...p.reducedPlayPolicy, rate: Number(e.target.value) || 0.6 } }))}
                      className="w-32 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    <p className="text-xs text-muted-foreground mt-1">例：球员打 9/18 洞 → 实际比例 50%，不低于设定的最低比例</p>
                  </div>
                )}

                {/* 固定减打价 */}
                {rpp.type === 'fixed_rate' && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-2">各身份固定减打价（元/人）</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {activeIdentities.map(id => (
                        <div key={id.code}>
                          <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: id.color }} />
                            {id.name}
                          </label>
                          <input type="number" value={rpp.fixedPrices?.[id.code] ?? ''} onChange={e => {
                            const val = Number(e.target.value) || 0
                            setEditForm((p: any) => ({
                              ...p, reducedPlayPolicy: {
                                ...p.reducedPlayPolicy,
                                fixedPrices: { ...p.reducedPlayPolicy.fixedPrices, [id.code]: val },
                              },
                            }))
                          }} placeholder={`≈¥${Math.round((prices[id.code] || 0) * 0.6)}`}
                            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => {
                      const fp: Record<string, number> = {}
                      activeIdentities.forEach(i => { fp[i.code] = Math.round((prices[i.code] || 0) * 0.6) })
                      setEditForm((p: any) => ({ ...p, reducedPlayPolicy: { ...p.reducedPlayPolicy, fixedPrices: fp } }))
                    }} className="mt-2 px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200">
                      一键填充（标准价60%）
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 底部 */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            {editRule?._id ? (
              <button onClick={() => { handleDelete(editRule._id); closeEdit() }} className="text-xs text-red-400 hover:text-red-600">删除此规则</button>
            ) : <span />}
            <div className="flex gap-3">
              <button onClick={closeEdit} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">取消</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 disabled:opacity-50 font-medium">
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
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">价格矩阵</h2>
          <p className="text-sm text-muted-foreground mt-0.5">管理各日期类型和时段下的果岭费、加打价格及减打策略</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-secondary/50">
            <RefreshCw size={14} /> 刷新
          </button>
          <button onClick={() => setShowBatchForm(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-success text-white rounded-lg hover:bg-success/90 font-medium">
            <Zap size={14} /> 一键生成
          </button>
        </div>
      </div>

      {/* 身份类型提示 */}
      {activeIdentities.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">当前启用身份：</span>
          {activeIdentities.map(id => (
            <span key={id.code} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: id.color }} />
              {id.name}
            </span>
          ))}
        </div>
      )}

      {/* 矩阵 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
      ) : (
        renderMatrix()
      )}

      {/* 编辑弹窗 */}
      {(editRule || editForm.dayType) && renderEditModal()}

      {/* 批量初始化弹窗 */}
      {showBatchForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">一键生成价格矩阵</h2>
              <button onClick={() => setShowBatchForm(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <p className="text-xs text-muted-foreground">以散客平日早场价为基准，自动生成 9 条价格规则，<strong>包含全部身份定价、加打价格和减打策略</strong>。</p>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">基准价格（散客·平日·早场）</label>
                <input type="number" value={batchParams.basePrice} onChange={e => setBatchParams(p => ({ ...p, basePrice: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-muted-foreground mb-1">周末系数</label><input type="number" step="0.1" value={batchParams.weekendRate} onChange={e => setBatchParams(p => ({ ...p, weekendRate: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="block text-xs text-muted-foreground mb-1">假日系数</label><input type="number" step="0.1" value={batchParams.holidayRate} onChange={e => setBatchParams(p => ({ ...p, holidayRate: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="block text-xs text-muted-foreground mb-1">嘉宾折扣</label><input type="number" step="0.05" value={batchParams.guestDiscount} onChange={e => setBatchParams(p => ({ ...p, guestDiscount: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-muted-foreground mb-1">球童费</label><input type="number" value={batchParams.caddyFee} onChange={e => setBatchParams(p => ({ ...p, caddyFee: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="block text-xs text-muted-foreground mb-1">球车费</label><input type="number" value={batchParams.cartFee} onChange={e => setBatchParams(p => ({ ...p, cartFee: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label className="block text-xs text-muted-foreground mb-1">保险费</label><input type="number" value={batchParams.insuranceFee} onChange={e => setBatchParams(p => ({ ...p, insuranceFee: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              </div>
              <div className="border-t border-border pt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">加打系数</label>
                  <input type="number" step="0.05" value={batchParams.addOnRate} onChange={e => setBatchParams(p => ({ ...p, addOnRate: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">加打价 = 标准价 × 系数</p>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">减打比例</label>
                  <input type="number" step="0.05" value={batchParams.reducedPlayRate} onChange={e => setBatchParams(p => ({ ...p, reducedPlayRate: Number(e.target.value) }))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">最低收费 = 标准价 × 比例</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowBatchForm(false)} className="flex-1 px-4 py-2 border border-border text-muted-foreground text-sm rounded-lg hover:bg-secondary/50">取消</button>
              <button onClick={handleBatch} disabled={batchLoading} className="flex-1 px-4 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 font-medium disabled:opacity-50">
                {batchLoading ? '生成中...' : '确认生成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
