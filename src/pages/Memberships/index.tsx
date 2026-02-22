import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Crown, Plus, Trash2, Edit3, Check, X, RefreshCw,
  CreditCard, Star, Gift, BarChart3, Search, ChevronDown,
  ChevronRight, Pause, Play, XCircle, RotateCcw, Clock,
  Users, Award, TrendingUp, Zap, AlertTriangle, Download,
  Eye, Wallet, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { api as _api } from '@/utils/api'

const api: any = _api

/* ========== 常量 ========== */
const CATEGORY_LABELS: Record<string, string> = {
  annual: '年卡', seasonal: '季卡/半年卡', rounds: '次卡',
  stored_value: '储值卡', family: '家庭卡',
}
const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:    { label: '生效中', cls: 'bg-success/10 text-success' },
  expiring:  { label: '即将到期', cls: 'bg-amber-100 text-amber-700' },
  expired:   { label: '已过期', cls: 'bg-secondary text-muted-foreground' },
  pending:   { label: '待激活', cls: 'bg-info/10 text-info border border-info/20' },
  suspended: { label: '已暂停', cls: 'bg-orange-100 text-orange-700' },
  cancelled: { label: '已取消', cls: 'bg-destructive/10 text-destructive border border-destructive/20' },
}
const PLAN_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:   { label: '在售', cls: 'bg-success/10 text-success' },
  inactive: { label: '已下架', cls: 'bg-secondary text-muted-foreground' },
}
const POINT_TYPE_LABELS: Record<string, string> = {
  earn: '赚取', redeem: '兑换', expire: '过期', adjust: '调整', welcome: '开卡赠送', referral: '推荐奖励',
}

const TABS = [
  { key: 'plans', label: '套餐管理', icon: Crown },
  { key: 'memberships', label: '会籍列表', icon: CreditCard },
  { key: 'points', label: '积分中心', icon: Star },
  { key: 'report', label: '会籍报表', icon: BarChart3 },
] as const
type TabKey = typeof TABS[number]['key']

/* ========== 主组件 ========== */
export default function Memberships() {
  const [activeTab, setActiveTab] = useState<TabKey>('plans')

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 顶部标题 + Tab */}
      <div className="flex-none border-b bg-card px-6 pt-5 pb-0">
        <h1 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" /> 会籍管理
        </h1>
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = activeTab === t.key
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition
                  ${isActive ? 'bg-amber-50 text-amber-700 border border-b-0 border-amber-200' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 overflow-auto p-6 bg-secondary/50">
        {activeTab === 'plans' && <PlansTab />}
        {activeTab === 'memberships' && <MembershipsTab />}
        {activeTab === 'points' && <PointsTab />}
        {activeTab === 'report' && <ReportTab />}
      </div>
    </div>
  )
}

/* ===================================================================
 * Tab 1: 套餐管理
 * =================================================================== */
function PlansTab() {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<any>(null)
  const [form, setForm] = useState<any>(getEmptyPlanForm())

  function getEmptyPlanForm() {
    return {
      planCode: '', name: '', category: 'annual', duration: 12, price: 0, depositAmount: 0,
      description: '', identityCode: 'member_1', maxMembers: 1, autoRenew: false,
      benefits: {
        freeRounds: 0, discountRate: 1, guestQuota: 0, guestDiscount: 1,
        priorityBooking: false, freeCaddy: false, freeCart: false, freeLocker: false, freeParking: false,
      },
      pointsRules: { earnRate: 1, welcomePoints: 0, birthdayMultiplier: 1 },
    }
  }

  const loadPlans = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await api.membershipPlans.getList()
      setPlans(res.data || [])
    } catch (e: any) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadPlans() }, [loadPlans])

  const handleSeed = async () => {
    try {
      const res: any = await api.membershipPlans.seed()
      toast.success(res.message || '初始化完成')
      loadPlans()
    } catch (e: any) { toast.error('初始化失败') }
  }

  const handleSave = async () => {
    if (!form.planCode || !form.name) { toast.error('编码和名称必填'); return }
    try {
      if (editingPlan) {
        await api.membershipPlans.update(editingPlan._id, form)
        toast.success('更新成功')
      } else {
        await api.membershipPlans.create(form)
        toast.success('创建成功')
      }
      setShowForm(false)
      setEditingPlan(null)
      setForm(getEmptyPlanForm())
      loadPlans()
    } catch (e: any) { toast.error('保存失败') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该套餐？')) return
    try {
      await api.membershipPlans.remove(id)
      toast.success('删除成功')
      loadPlans()
    } catch (e: any) { toast.error('删除失败') }
  }

  const openEdit = (plan: any) => {
    setEditingPlan(plan)
    setForm({
      planCode: plan.planCode, name: plan.name, category: plan.category,
      duration: plan.duration, price: plan.price, depositAmount: plan.depositAmount || 0,
      description: plan.description || '', identityCode: plan.identityCode || '',
      maxMembers: plan.maxMembers || 1, autoRenew: !!plan.autoRenew,
      benefits: { ...plan.benefits },
      pointsRules: { ...plan.pointsRules },
    })
    setShowForm(true)
  }

  const toggleStatus = async (plan: any) => {
    const newStatus = plan.status === 'active' ? 'inactive' : 'active'
    try {
      await api.membershipPlans.update(plan._id, { status: newStatus })
      toast.success(newStatus === 'active' ? '已上架' : '已下架')
      loadPlans()
    } catch (_) { toast.error('操作失败') }
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => { setEditingPlan(null); setForm(getEmptyPlanForm()); setShowForm(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-primary-foreground rounded-lg hover:bg-amber-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> 新增套餐
          </button>
          <button onClick={handleSeed}
            className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-foreground hover:bg-secondary/50 text-sm">
            <Zap className="w-4 h-4" /> 初始化默认套餐
          </button>
        </div>
        <button onClick={loadPlans} className="p-2 text-muted-foreground hover:text-muted-foreground">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 套餐卡片列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map(plan => (
          <div key={plan._id} className="bg-card rounded-xl shadow-sm border p-5 hover:shadow-md transition group">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                <span className="text-xs text-muted-foreground font-mono">{plan.planCode}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_STATUS_LABELS[plan.status]?.cls || 'bg-secondary text-muted-foreground'}`}>
                {PLAN_STATUS_LABELS[plan.status]?.label || plan.status}
              </span>
            </div>

            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{plan.description || '暂无描述'}</p>

            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-2xl font-bold text-amber-600">¥{(plan.price || 0).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                / {plan.duration > 0 ? `${plan.duration}个月` : '用完即止'}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">{CATEGORY_LABELS[plan.category] || plan.category}</span>
              {plan.benefits?.freeRounds > 0 && <span className="px-2 py-0.5 bg-success/10 text-success rounded">免费{plan.benefits.freeRounds}轮</span>}
              {plan.benefits?.discountRate < 1 && <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded">{plan.benefits.discountRate * 10}折续打</span>}
              {plan.benefits?.guestQuota > 0 && <span className="px-2 py-0.5 bg-pink-50 text-pink-600 rounded">带客{plan.benefits.guestQuota}次</span>}
              {plan.benefits?.priorityBooking && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded">优先预订</span>}
              {plan.benefits?.freeCart && <span className="px-2 py-0.5 bg-teal-50 text-teal-600 rounded">免球车</span>}
              {plan.benefits?.freeLocker && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">免更衣柜</span>}
              {plan.maxMembers > 1 && <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded">最多{plan.maxMembers}人</span>}
            </div>

            <div className="text-xs text-muted-foreground mb-3">
              积分：{plan.pointsRules?.earnRate || 1}x 赚取 | 开卡送 {plan.pointsRules?.welcomePoints || 0} | 生日 {plan.pointsRules?.birthdayMultiplier || 1}x
            </div>

            <div className="flex items-center gap-2 pt-3 border-t opacity-0 group-hover:opacity-100 transition">
              <button onClick={() => openEdit(plan)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded">
                <Edit3 className="w-3.5 h-3.5" /> 编辑
              </button>
              <button onClick={() => toggleStatus(plan)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-50 rounded">
                {plan.status === 'active' ? <><Pause className="w-3.5 h-3.5" /> 下架</> : <><Play className="w-3.5 h-3.5" /> 上架</>}
              </button>
              <button onClick={() => handleDelete(plan._id)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded ml-auto">
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            </div>
          </div>
        ))}
        {plans.length === 0 && !loading && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            暂无套餐，点击"初始化默认套餐"快速创建
          </div>
        )}
      </div>

      {/* 创建/编辑表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editingPlan ? '编辑套餐' : '新增套餐'}</h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium text-foreground">套餐编码 *</label>
                <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={form.planCode}
                  onChange={e => setForm({ ...form, planCode: e.target.value })} placeholder="annual_vip" disabled={!!editingPlan} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">名称 *</label>
                <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} placeholder="年度VIP会籍" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">类型</label>
                <select className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">有效月数 (0=用完即止)</label>
                <input type="number" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={form.duration}
                  onChange={e => setForm({ ...form, duration: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">售价 (¥)</label>
                <input type="number" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={form.price}
                  onChange={e => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">押金 (¥)</label>
                <input type="number" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={form.depositAmount}
                  onChange={e => setForm({ ...form, depositAmount: Number(e.target.value) })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-foreground">描述</label>
                <textarea className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" rows={2} value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>

            {/* 权益配置 */}
            <h3 className="text-sm font-bold text-foreground mb-2 mt-4 flex items-center gap-1"><Gift className="w-4 h-4" /> 权益配置</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground">免费轮次 (0=不限)</label>
                <input type="number" className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.benefits.freeRounds}
                  onChange={e => setForm({ ...form, benefits: { ...form.benefits, freeRounds: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">续打折扣 (0.7=7折)</label>
                <input type="number" step="0.05" className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.benefits.discountRate}
                  onChange={e => setForm({ ...form, benefits: { ...form.benefits, discountRate: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">带客名额</label>
                <input type="number" className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.benefits.guestQuota}
                  onChange={e => setForm({ ...form, benefits: { ...form.benefits, guestQuota: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">带客折扣</label>
                <input type="number" step="0.05" className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.benefits.guestDiscount}
                  onChange={e => setForm({ ...form, benefits: { ...form.benefits, guestDiscount: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">最大绑定人数</label>
                <input type="number" className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.maxMembers}
                  onChange={e => setForm({ ...form, maxMembers: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">关联身份编码</label>
                <input className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.identityCode}
                  onChange={e => setForm({ ...form, identityCode: e.target.value })} />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mb-4 text-sm">
              {(['priorityBooking', 'freeCaddy', 'freeCart', 'freeLocker', 'freeParking'] as const).map(k => (
                <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={!!form.benefits[k]}
                    onChange={e => setForm({ ...form, benefits: { ...form.benefits, [k]: e.target.checked } })} />
                  <span className="text-muted-foreground">
                    {{ priorityBooking: '优先预订', freeCaddy: '免球童费', freeCart: '免球车费', freeLocker: '免更衣柜', freeParking: '免停车费' }[k]}
                  </span>
                </label>
              ))}
            </div>

            {/* 积分规则 */}
            <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1"><Star className="w-4 h-4" /> 积分规则</h3>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div>
                <label className="text-xs text-muted-foreground">赚取倍率</label>
                <input type="number" step="0.1" className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.pointsRules.earnRate}
                  onChange={e => setForm({ ...form, pointsRules: { ...form.pointsRules, earnRate: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">开卡赠送积分</label>
                <input type="number" className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.pointsRules.welcomePoints}
                  onChange={e => setForm({ ...form, pointsRules: { ...form.pointsRules, welcomePoints: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">生日积分倍数</label>
                <input type="number" step="0.5" className="w-full mt-1 px-2 py-1.5 border rounded text-sm" value={form.pointsRules.birthdayMultiplier}
                  onChange={e => setForm({ ...form, pointsRules: { ...form.pointsRules, birthdayMultiplier: Number(e.target.value) } })} />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowForm(false); setEditingPlan(null) }}
                className="px-4 py-2 border rounded-lg text-sm text-muted-foreground hover:bg-secondary/50">取消</button>
              <button onClick={handleSave}
                className="px-4 py-2 bg-amber-600 text-primary-foreground rounded-lg text-sm hover:bg-amber-700">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ===================================================================
 * Tab 2: 会籍列表
 * =================================================================== */
function MembershipsTab() {
  const [memberships, setMemberships] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ playerId: '', playerName: '', phoneNumber: '', planId: '', paymentAmount: 0, paymentMethod: 'card' })
  const [selectedMembership, setSelectedMembership] = useState<any>(null)
  const [renewForm, setRenewForm] = useState({ months: 12, amount: 0, method: 'card' })
  const [showRenew, setShowRenew] = useState(false)

  // 球员搜索
  const [playerSearchQuery, setPlayerSearchQuery] = useState('')
  const [playerResults, setPlayerResults] = useState<any[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, pRes]: any[] = await Promise.all([
        api.memberships.getList({ pageSize: 200 }),
        api.membershipPlans.getList({ status: 'active' }),
      ])
      setMemberships(mRes.data || [])
      setPlans(pRes.data || [])
    } catch (e: any) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleSearchPlayer = async () => {
    if (!playerSearchQuery.trim()) return
    try {
      const res: any = await api.players.search({ q: playerSearchQuery })
      setPlayerResults(res.data || [])
    } catch (_) { toast.error('搜索失败') }
  }

  const handleCreate = async () => {
    if (!createForm.playerId || !createForm.planId) { toast.error('请选择球员和套餐'); return }
    try {
      const res: any = await api.memberships.create({
        playerId: createForm.playerId,
        playerName: createForm.playerName,
        phoneNumber: createForm.phoneNumber,
        planId: createForm.planId,
        payment: { amount: createForm.paymentAmount, method: createForm.paymentMethod },
      })
      toast.success(`开卡成功！会籍编号: ${res.data?.membershipNo}`)
      setShowCreate(false)
      setCreateForm({ playerId: '', playerName: '', phoneNumber: '', planId: '', paymentAmount: 0, paymentMethod: 'card' })
      loadData()
    } catch (e: any) { toast.error('开卡失败') }
  }

  const handleRenew = async () => {
    if (!selectedMembership) return
    try {
      await api.memberships.renew(selectedMembership._id, {
        months: renewForm.months,
        payment: { amount: renewForm.amount, method: renewForm.method },
      })
      toast.success('续费成功')
      setShowRenew(false)
      loadData()
    } catch (e: any) { toast.error('续费失败') }
  }

  const handleAction = async (id: string, action: string, reason?: string) => {
    try {
      if (action === 'suspend') await api.memberships.suspend(id, { reason })
      else if (action === 'resume') await api.memberships.resume(id)
      else if (action === 'cancel') await api.memberships.cancel(id, { reason: reason || '管理员取消' })
      toast.success('操作成功')
      loadData()
    } catch (e: any) { toast.error('操作失败') }
  }

  const handleCheckExpiry = async () => {
    try {
      const res: any = await api.memberships.checkExpiry()
      toast.success(`到期检查完成：${res.data?.expiredCount || 0} 已过期，${res.data?.expiringCount || 0} 即将到期`)
      loadData()
    } catch (_) { toast.error('检查失败') }
  }

  const filtered = memberships.filter(m => {
    if (statusFilter && m.status !== statusFilter) return false
    if (keyword) {
      const kw = keyword.toLowerCase()
      return (m.playerName || '').toLowerCase().includes(kw) ||
        (m.phoneNumber || '').includes(kw) ||
        (m.membershipNo || '').toLowerCase().includes(kw)
    }
    return true
  })

  const stats = {
    active: memberships.filter(m => m.status === 'active').length,
    expiring: memberships.filter(m => m.status === 'expiring').length,
    total: memberships.length,
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '有效会籍', value: stats.active, cls: 'text-success', bg: 'bg-success/10' },
          { label: '即将到期', value: stats.expiring, cls: 'text-amber-600', bg: 'bg-amber-50' },
          { label: '总会籍数', value: stats.total, cls: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '总收入', value: `¥${memberships.reduce((s, m) => s + (Number(m.payment?.amount) || 0), 0).toLocaleString()}`, cls: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((kpi, i) => (
          <div key={i} className={`${kpi.bg} rounded-xl p-4`}>
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.cls} mt-1`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md bg-card border rounded-lg px-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input className="flex-1 py-2 text-sm outline-none" placeholder="搜索姓名/手机/会籍号"
            value={keyword} onChange={e => setKeyword(e.target.value)} />
        </div>
        <select className="px-3 py-2 border rounded-lg text-sm bg-card" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-primary-foreground rounded-lg hover:bg-amber-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> 办理开卡
        </button>
        <button onClick={handleCheckExpiry}
          className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-muted-foreground hover:bg-secondary/50">
          <Clock className="w-4 h-4" /> 到期检查
        </button>
      </div>

      {/* 列表 */}
      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs">
            <tr>
              <th className="text-left px-4 py-3">会籍编号</th>
              <th className="text-left px-4 py-3">球员</th>
              <th className="text-left px-4 py-3">套餐</th>
              <th className="text-left px-4 py-3">状态</th>
              <th className="text-left px-4 py-3">有效期</th>
              <th className="text-left px-4 py-3">使用情况</th>
              <th className="text-right px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map(m => {
              const st = STATUS_LABELS[m.status] || { label: m.status, cls: 'bg-secondary text-muted-foreground' }
              const freeRounds = m.benefits?.freeRounds || 0
              const roundsUsed = m.usage?.roundsUsed || 0
              return (
                <tr key={m._id} className="hover:bg-secondary/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.membershipNo}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{m.playerName}</div>
                    <div className="text-xs text-muted-foreground">{m.phoneNumber}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-foreground">{m.planName}</span>
                    <span className="text-xs text-muted-foreground ml-1">({CATEGORY_LABELS[m.planCategory] || m.planCategory})</span>
                  </td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {m.startDate?.slice(0, 10)} ~ {m.endDate?.slice(0, 10) || '∞'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {freeRounds > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-secondary rounded-full h-1.5 max-w-[80px]">
                          <div className="bg-success/100 h-1.5 rounded-full" style={{ width: `${Math.min(100, (roundsUsed / freeRounds) * 100)}%` }} />
                        </div>
                        <span className="text-muted-foreground">{roundsUsed}/{freeRounds}轮</span>
                      </div>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {['active', 'expiring', 'expired'].includes(m.status) && (
                        <button onClick={() => { setSelectedMembership(m); setRenewForm({ months: 12, amount: 0, method: 'card' }); setShowRenew(true) }}
                          className="p-1.5 text-success hover:bg-success/10 rounded" title="续费">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {m.status === 'active' && (
                        <button onClick={() => handleAction(m._id, 'suspend')}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="暂停">
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {m.status === 'suspended' && (
                        <button onClick={() => handleAction(m._id, 'resume')}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="恢复">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {m.status !== 'cancelled' && (
                        <button onClick={() => { if (confirm('确认取消该会籍？')) handleAction(m._id, 'cancel') }}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="取消">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">暂无会籍记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 开卡弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5 text-amber-500" /> 办理开卡</h2>

            {/* 球员搜索 */}
            <div className="mb-4">
              <label className="text-sm font-medium text-foreground mb-1 block">选择球员</label>
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="输入姓名/手机号搜索"
                  value={playerSearchQuery} onChange={e => setPlayerSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchPlayer()} />
                <button onClick={handleSearchPlayer} className="px-3 py-2 bg-secondary rounded-lg hover:bg-secondary">
                  <Search className="w-4 h-4" />
                </button>
              </div>
              {playerResults.length > 0 && (
                <div className="mt-2 border rounded-lg max-h-32 overflow-auto">
                  {playerResults.map((p: any) => (
                    <button key={p._id} onClick={() => {
                      setCreateForm({ ...createForm, playerId: p._id, playerName: p.name || p.nickName || '', phoneNumber: p.phone || '' })
                      setPlayerResults([])
                      setPlayerSearchQuery('')
                    }}
                      className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm flex justify-between border-b last:border-0">
                      <span>{p.name || p.nickName}</span>
                      <span className="text-muted-foreground">{p.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {createForm.playerId && (
                <div className="mt-2 px-3 py-2 bg-amber-50 rounded text-sm">
                  已选：<strong>{createForm.playerName}</strong> {createForm.phoneNumber}
                </div>
              )}
            </div>

            {/* 选择套餐 */}
            <div className="mb-4">
              <label className="text-sm font-medium text-foreground mb-1 block">选择套餐</label>
              <select className="w-full px-3 py-2 border rounded-lg text-sm" value={createForm.planId}
                onChange={e => {
                  const plan = plans.find(p => p._id === e.target.value)
                  setCreateForm({ ...createForm, planId: e.target.value, paymentAmount: plan?.price || 0 })
                }}>
                <option value="">-- 请选择 --</option>
                {plans.map(p => <option key={p._id} value={p._id}>{p.name} - ¥{(p.price || 0).toLocaleString()}</option>)}
              </select>
            </div>

            {/* 支付 */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-sm font-medium text-foreground">支付金额</label>
                <input type="number" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={createForm.paymentAmount}
                  onChange={e => setCreateForm({ ...createForm, paymentAmount: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">支付方式</label>
                <select className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={createForm.paymentMethod}
                  onChange={e => setCreateForm({ ...createForm, paymentMethod: e.target.value })}>
                  <option value="card">银行卡</option>
                  <option value="cash">现金</option>
                  <option value="wechat">微信</option>
                  <option value="alipay">支付宝</option>
                  <option value="transfer">转账</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-amber-600 text-primary-foreground rounded-lg text-sm hover:bg-amber-700">确认开卡</button>
            </div>
          </div>
        </div>
      )}

      {/* 续费弹窗 */}
      {showRenew && selectedMembership && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRenew(false)}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">续费 - {selectedMembership.playerName}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              当前套餐: {selectedMembership.planName} | 到期日: {selectedMembership.endDate?.slice(0, 10) || '未设置'}
            </p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-sm font-medium text-foreground">续费月数</label>
                <input type="number" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={renewForm.months}
                  onChange={e => setRenewForm({ ...renewForm, months: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">续费金额</label>
                <input type="number" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={renewForm.amount}
                  onChange={e => setRenewForm({ ...renewForm, amount: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRenew(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={handleRenew} className="px-4 py-2 bg-success text-primary-foreground rounded-lg text-sm hover:bg-success/90">确认续费</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ===================================================================
 * Tab 3: 积分中心
 * =================================================================== */
function PointsTab() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ playerId: '', playerName: '', amount: 0, description: '' })
  const [playerSearchQuery, setPlayerSearchQuery] = useState('')
  const [playerResults, setPlayerResults] = useState<any[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, sRes]: any[] = await Promise.all([
        api.points.getList({ pageSize: 100 }),
        api.points.getStats(),
      ])
      setTransactions(tRes.data || [])
      setStats(sRes.data || null)
    } catch (e: any) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleSearchPlayer = async () => {
    if (!playerSearchQuery.trim()) return
    try {
      const res: any = await api.players.search({ q: playerSearchQuery })
      setPlayerResults(res.data || [])
    } catch (_) {}
  }

  const handleAdjust = async () => {
    if (!adjustForm.playerId) { toast.error('请选择球员'); return }
    try {
      await api.points.adjust({
        playerId: adjustForm.playerId,
        playerName: adjustForm.playerName,
        amount: adjustForm.amount,
        description: adjustForm.description,
      })
      toast.success('积分调整成功')
      setShowAdjust(false)
      setAdjustForm({ playerId: '', playerName: '', amount: 0, description: '' })
      loadData()
    } catch (e: any) { toast.error('调整失败') }
  }

  const filtered = typeFilter
    ? transactions.filter(t => t.type === typeFilter)
    : transactions

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '累计发放', value: stats.totalEarned?.toLocaleString() || '0', icon: ArrowUpRight, cls: 'text-success', bg: 'bg-success/10' },
            { label: '累计消费', value: stats.totalRedeemed?.toLocaleString() || '0', icon: ArrowDownRight, cls: 'text-red-500', bg: 'bg-red-50' },
            { label: '累计过期', value: stats.totalExpired?.toLocaleString() || '0', icon: Clock, cls: 'text-muted-foreground', bg: 'bg-secondary/50' },
            { label: '净积分', value: stats.netPoints?.toLocaleString() || '0', icon: Wallet, cls: 'text-blue-600', bg: 'bg-blue-50' },
          ].map((kpi, i) => {
            const Icon = kpi.icon
            return (
              <div key={i} className={`${kpi.bg} rounded-xl p-4 flex items-start gap-3`}>
                <Icon className={`w-5 h-5 ${kpi.cls} mt-0.5`} />
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className={`text-xl font-bold ${kpi.cls} mt-0.5`}>{kpi.value}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center gap-3">
        <select className="px-3 py-2 border rounded-lg text-sm bg-card" value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}>
          <option value="">全部类型</option>
          {Object.entries(POINT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => setShowAdjust(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-primary-foreground rounded-lg text-sm hover:bg-amber-700">
          <Edit3 className="w-4 h-4" /> 手动调整
        </button>
        <button onClick={loadData} className="ml-auto p-2 text-muted-foreground hover:text-muted-foreground">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 流水列表 */}
      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs">
            <tr>
              <th className="text-left px-4 py-3">时间</th>
              <th className="text-left px-4 py-3">球员</th>
              <th className="text-left px-4 py-3">类型</th>
              <th className="text-right px-4 py-3">积分变动</th>
              <th className="text-right px-4 py-3">余额</th>
              <th className="text-left px-4 py-3">描述</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((t, i) => (
              <tr key={t._id || i} className="hover:bg-secondary/50">
                <td className="px-4 py-3 text-xs text-muted-foreground">{t.createdAt?.slice(0, 16).replace('T', ' ')}</td>
                <td className="px-4 py-3 text-foreground">{t.playerName}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.amount > 0 ? 'bg-success/10 text-success' : 'bg-red-50 text-red-600'}`}>
                    {POINT_TYPE_LABELS[t.type] || t.type}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-medium ${t.amount > 0 ? 'text-success' : 'text-red-500'}`}>
                  {t.amount > 0 ? '+' : ''}{t.amount}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{t.balanceAfter}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{t.description}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">暂无积分记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 手动调整弹窗 */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdjust(false)}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">手动调整积分</h2>

            <div className="mb-4">
              <label className="text-sm font-medium text-foreground mb-1 block">选择球员</label>
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="搜索球员"
                  value={playerSearchQuery} onChange={e => setPlayerSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchPlayer()} />
                <button onClick={handleSearchPlayer} className="px-3 py-2 bg-secondary rounded-lg hover:bg-secondary">
                  <Search className="w-4 h-4" />
                </button>
              </div>
              {playerResults.length > 0 && (
                <div className="mt-2 border rounded-lg max-h-32 overflow-auto">
                  {playerResults.map((p: any) => (
                    <button key={p._id} onClick={() => {
                      setAdjustForm({ ...adjustForm, playerId: p._id, playerName: p.name || p.nickName || '' })
                      setPlayerResults([])
                      setPlayerSearchQuery('')
                    }}
                      className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm border-b last:border-0">
                      {p.name || p.nickName} - {p.phone}
                    </button>
                  ))}
                </div>
              )}
              {adjustForm.playerId && (
                <div className="mt-2 px-3 py-2 bg-amber-50 rounded text-sm">已选：<strong>{adjustForm.playerName}</strong></div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-foreground">调整数额 (正数=增加，负数=扣减)</label>
              <input type="number" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={adjustForm.amount}
                onChange={e => setAdjustForm({ ...adjustForm, amount: Number(e.target.value) })} />
            </div>

            <div className="mb-6">
              <label className="text-sm font-medium text-foreground">原因说明</label>
              <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={adjustForm.description}
                onChange={e => setAdjustForm({ ...adjustForm, description: e.target.value })} placeholder="如：活动赠送/系统修正" />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAdjust(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={handleAdjust} className="px-4 py-2 bg-amber-600 text-primary-foreground rounded-lg text-sm hover:bg-amber-700">确认调整</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ===================================================================
 * Tab 4: 会籍报表
 * =================================================================== */
function ReportTab() {
  const [overview, setOverview] = useState<any>(null)
  const [plansSummary, setPlansSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [oRes, pRes]: any[] = await Promise.all([
        api.memberships.getStats(),
        api.membershipPlans.getStats(),
      ])
      setOverview(oRes.data || null)
      setPlansSummary(pRes.data || null)
    } catch (e: any) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <div className="space-y-6">
      {/* KPI 大卡片 */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: '活跃会籍', value: overview.active || 0, icon: Users, cls: 'text-success', bg: 'bg-success/10' },
            { label: '即将到期', value: overview.expiring || 0, icon: AlertTriangle, cls: 'text-amber-600', bg: 'bg-amber-50' },
            { label: '会籍总收入', value: `¥${(overview.totalRevenue || 0).toLocaleString()}`, icon: TrendingUp, cls: 'text-blue-600', bg: 'bg-blue-50' },
            { label: '续费收入', value: `¥${(overview.renewalRevenue || 0).toLocaleString()}`, icon: RotateCcw, cls: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((kpi, i) => {
            const Icon = kpi.icon
            return (
              <div key={i} className={`${kpi.bg} rounded-xl p-5`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-5 h-5 ${kpi.cls}`} />
                  <span className="text-sm text-muted-foreground">{kpi.label}</span>
                </div>
                <p className={`text-2xl font-bold ${kpi.cls}`}>{kpi.value}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* 状态分布 */}
      {overview?.byStatus && (
        <div className="bg-card rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">会籍状态分布</h3>
          <div className="space-y-2">
            {Object.entries(overview.byStatus).map(([status, count]: any) => {
              const pct = overview.total > 0 ? Math.round((count / overview.total) * 100) : 0
              const label = STATUS_LABELS[status]?.label || status
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-muted-foreground">{label}</span>
                  <div className="flex-1 bg-secondary rounded-full h-3">
                    <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right text-sm font-medium">{count}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 套餐销售概况 */}
      {plansSummary && (
        <div className="bg-card rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">套餐销售概况</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">在售套餐数</p>
              <p className="text-xl font-bold text-foreground">{plansSummary.activePlans || 0}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">已售会籍数</p>
              <p className="text-xl font-bold text-foreground">{plansSummary.totalMemberships || 0}</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">总销售额</p>
              <p className="text-xl font-bold text-amber-600">¥{(plansSummary.totalRevenue || 0).toLocaleString()}</p>
            </div>
          </div>

          {plansSummary.byCategory && Object.keys(plansSummary.byCategory).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">按类型</h4>
              <div className="space-y-1.5">
                {Object.entries(plansSummary.byCategory).map(([cat, data]: any) => (
                  <div key={cat} className="flex items-center justify-between text-sm bg-secondary/50 rounded px-3 py-2">
                    <span className="text-muted-foreground">{CATEGORY_LABELS[cat] || cat}</span>
                    <span className="text-muted-foreground">{data.count} 人 · ¥{(data.revenue || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-center py-8 text-muted-foreground">加载中...</div>}
    </div>
  )
}
