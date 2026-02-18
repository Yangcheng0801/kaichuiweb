import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Users, Tag, MessageSquare, ListTodo, PieChart,
  Search, Plus, X, Phone, BarChart3, Megaphone,
  AlertCircle, CheckCircle2, Clock,
  Edit2, Trash2, RefreshCw, Eye, Zap, TrendingUp,
  Send, Calendar, Target, Activity
} from 'lucide-react'
import { api } from '@/utils/api'

/* ═══════════════════════════════════════════════════════════
 *  类型
 * ═══════════════════════════════════════════════════════════ */
interface CrmTag { _id: string; name: string; color: string; category: string; autoRule?: any }
interface Customer {
  _id: string; profileId: string; name: string; phoneNumber: string; playerNo: string
  memberType: string; memberLevel: number; memberLevelName: string
  balance: number; points: number; totalRounds: number; totalConsumption: number
  lastVisitDate: string; tags: string[]; consumeCardNo: string; registeredAt: string
}
interface Interaction {
  _id: string; playerId: string; playerName: string; type: string
  direction: string; content: string; summary: string
  staffName: string; followUpRequired: boolean; followUpId?: string; createTime: any
}
interface Followup {
  _id: string; playerId: string; playerName: string; title: string; content: string
  assigneeName: string; priority: string; status: string; dueDate: string
  completedAt: string; completedNote: string; createTime: any; autoType?: string
}
interface Segment {
  _id: string; name: string; description: string; type: string
  rules: { field: string; operator: string; value: string }[]
  manualPlayerIds: string[]; playerCount: number; lastRefreshedAt: any
}
interface Campaign {
  _id: string; name: string; description: string; type: string
  segmentId: string; targetTags: string[]; channel: string; content: string
  budget: number; status: string; scheduledAt: string
  stats: { targetCount: number; sentCount: number; openedCount: number; respondedCount: number; convertedCount: number; revenue: number }
  createTime: any
}

type TabKey = 'overview' | 'interactions' | 'followups' | 'segments' | 'campaigns' | 'insights'

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'overview',     label: '客户总览', icon: Users },
  { key: 'interactions', label: '互动记录', icon: MessageSquare },
  { key: 'followups',    label: '跟进任务', icon: ListTodo },
  { key: 'segments',     label: '客户分群', icon: PieChart },
  { key: 'campaigns',    label: '营销活动', icon: Megaphone },
  { key: 'insights',     label: '数据洞察', icon: BarChart3 },
]

const LEVEL_NAMES: Record<number, string> = { 0: '非会员', 1: '普通会员', 2: '金卡会员', 3: '钻石会员', 4: '白金会员' }
const LEVEL_COLORS: Record<number, string> = { 0: 'bg-gray-100 text-gray-600', 1: 'bg-blue-100 text-blue-700', 2: 'bg-yellow-100 text-yellow-700', 3: 'bg-purple-100 text-purple-700', 4: 'bg-emerald-100 text-emerald-700' }
const INTERACTION_TYPES: Record<string, { label: string; color: string }> = {
  call: { label: '电话', color: 'bg-blue-100 text-blue-700' },
  visit: { label: '到访', color: 'bg-green-100 text-green-700' },
  complaint: { label: '投诉', color: 'bg-red-100 text-red-700' },
  feedback: { label: '反馈', color: 'bg-amber-100 text-amber-700' },
  note: { label: '备注', color: 'bg-gray-100 text-gray-600' },
}
const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'text-gray-500' }, medium: { label: '中', color: 'text-blue-600' },
  high: { label: '高', color: 'text-orange-600' }, urgent: { label: '紧急', color: 'text-red-600' },
}
const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  in_progress: { label: '进行中', color: 'bg-blue-100 text-blue-700', icon: RefreshCw },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-500', icon: X },
}
const CAMPAIGN_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-600' },
  running: { label: '进行中', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-600' },
}
const CAMPAIGN_TYPES: Record<string, string> = {
  promotion: '促销优惠', event_invite: '赛事邀请', membership: '会籍推广',
  birthday: '生日关怀', reactivation: '沉睡唤醒', newsletter: '新品推荐',
}

const SEGMENT_FIELDS = [
  { value: 'memberLevel', label: '会员等级' },
  { value: 'account.totalRounds', label: '总打球轮次' },
  { value: 'account.totalConsumption', label: '总消费金额' },
  { value: 'account.balance', label: '账户余额' },
  { value: 'account.points', label: '积分' },
  { value: 'lastVisitDate', label: '最后到访日期' },
]
const SEGMENT_OPERATORS = [
  { value: 'eq', label: '等于' }, { value: 'neq', label: '不等于' },
  { value: 'gt', label: '大于' }, { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' }, { value: 'lte', label: '小于等于' },
  { value: 'daysSince_gte', label: '距今天数 >=' }, { value: 'daysSince_lte', label: '距今天数 <=' },
]

/* ═══════════════════════════════════════════════════════════
 *  主页面
 * ═══════════════════════════════════════════════════════════ */
export default function CRM() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [tags, setTags] = useState<CrmTag[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerData, setDrawerData] = useState<any>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<CrmTag | null>(null)
  const [tagForm, setTagForm] = useState({ name: '', color: '#10b981', category: '通用' })
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [interactionDialogOpen, setInteractionDialogOpen] = useState(false)
  const [interactionForm, setInteractionForm] = useState({ playerId: '', playerName: '', type: 'call', direction: 'outbound', content: '', summary: '', followUpRequired: false })
  const [followups, setFollowups] = useState<Followup[]>([])
  const [followupDialogOpen, setFollowupDialogOpen] = useState(false)
  const [followupForm, setFollowupForm] = useState({ playerId: '', playerName: '', title: '', content: '', assigneeName: '', priority: 'medium', dueDate: '' })
  const [followupFilter, setFollowupFilter] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false)
  const [segmentForm, setSegmentForm] = useState<{ name: string; description: string; type: string; rules: { field: string; operator: string; value: string }[] }>({ name: '', description: '', type: 'auto', rules: [{ field: 'account.totalRounds', operator: 'gte', value: '' }] })
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false)
  const [campaignForm, setCampaignForm] = useState({ name: '', description: '', type: 'promotion', segmentId: '', targetTags: [] as string[], channel: 'wechat', content: '', budget: 0 })
  const [insights, setInsights] = useState<any>(null)

  const loadTags = useCallback(async () => { try { const r: any = await api.crm.getTags(); setTags(r.data || []) } catch {} }, [])
  const loadCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (searchQ) params.q = searchQ
      if (filterTag) params.tag = filterTag
      if (filterLevel) params.memberLevel = filterLevel
      const r: any = await api.crm.getCustomers(params)
      setCustomers(r.data || [])
    } catch {} finally { setLoading(false) }
  }, [searchQ, filterTag, filterLevel])
  const loadInteractions = useCallback(async () => { try { const r: any = await api.crm.getInteractions(); setInteractions(r.data || []) } catch {} }, [])
  const loadFollowups = useCallback(async () => {
    try { const params: any = {}; if (followupFilter) params.status = followupFilter; const r: any = await api.crm.getFollowups(params); setFollowups(r.data || []) } catch {}
  }, [followupFilter])
  const loadSegments = useCallback(async () => { try { const r: any = await api.crm.getSegments(); setSegments(r.data || []) } catch {} }, [])
  const loadCampaigns = useCallback(async () => { try { const r: any = await api.crm.getCampaigns(); setCampaigns(r.data || []) } catch {} }, [])
  const loadInsights = useCallback(async () => { try { const r: any = await api.crm.getInsights(); setInsights(r.data) } catch {} }, [])

  useEffect(() => { loadTags() }, [loadTags])
  useEffect(() => { loadCustomers() }, [loadCustomers])
  useEffect(() => { if (activeTab === 'interactions') loadInteractions() }, [activeTab, loadInteractions])
  useEffect(() => { if (activeTab === 'followups') loadFollowups() }, [activeTab, loadFollowups])
  useEffect(() => { if (activeTab === 'segments') loadSegments() }, [activeTab, loadSegments])
  useEffect(() => { if (activeTab === 'campaigns') loadCampaigns() }, [activeTab, loadCampaigns])
  useEffect(() => { if (activeTab === 'insights') loadInsights() }, [activeTab, loadInsights])

  const open360 = async (id: string) => {
    setDrawerOpen(true); setDrawerLoading(true)
    try { const r: any = await api.crm.getCustomer360(id); setDrawerData(r.data) }
    catch { toast.error('加载客户详情失败') } finally { setDrawerLoading(false) }
  }

  const openTagDialog = (tag?: CrmTag) => {
    if (tag) { setEditingTag(tag); setTagForm({ name: tag.name, color: tag.color, category: tag.category }) }
    else { setEditingTag(null); setTagForm({ name: '', color: '#10b981', category: '通用' }) }
    setTagDialogOpen(true)
  }
  const saveTag = async () => {
    if (!tagForm.name) return toast.error('标签名称不能为空')
    try { if (editingTag) { await api.crm.updateTag(editingTag._id, tagForm); toast.success('标签已更新') } else { await api.crm.createTag(tagForm); toast.success('标签已创建') }; setTagDialogOpen(false); loadTags() } catch {}
  }
  const deleteTag = async (id: string) => { if (!confirm('确认删除此标签？')) return; try { await api.crm.deleteTag(id); toast.success('标签已删除'); loadTags() } catch {} }
  const toggleTag = async (customerId: string, tagName: string, current: string[]) => {
    const has = current.includes(tagName)
    try { await api.crm.updateTags(customerId, { tags: [tagName], action: has ? 'remove' : 'add' }); toast.success(has ? '已移除标签' : '已添加标签'); loadCustomers(); if (drawerData?.player?._id === customerId) open360(customerId) } catch {}
  }
  const openInteractionDialog = (customer?: Customer) => {
    setInteractionForm({ playerId: customer?._id || '', playerName: customer?.name || '', type: 'call', direction: 'outbound', content: '', summary: '', followUpRequired: false })
    setInteractionDialogOpen(true)
  }
  const saveInteraction = async () => {
    if (!interactionForm.playerId || !interactionForm.content) return toast.error('请填写客户和互动内容')
    try { await api.crm.createInteraction(interactionForm); toast.success('互动记录已创建'); setInteractionDialogOpen(false); loadInteractions() } catch {}
  }
  const openFollowupDialog = (customer?: Customer) => {
    setFollowupForm({ playerId: customer?._id || '', playerName: customer?.name || '', title: '', content: '', assigneeName: '', priority: 'medium', dueDate: '' })
    setFollowupDialogOpen(true)
  }
  const saveFollowup = async () => {
    if (!followupForm.playerId || !followupForm.title) return toast.error('请填写客户和任务标题')
    try { await api.crm.createFollowup(followupForm); toast.success('跟进任务已创建'); setFollowupDialogOpen(false); loadFollowups() } catch {}
  }
  const updateFollowupStatus = async (id: string, status: string) => { try { await api.crm.updateFollowup(id, { status }); toast.success('状态已更新'); loadFollowups() } catch {} }

  const openSegmentDialog = () => { setSegmentForm({ name: '', description: '', type: 'auto', rules: [{ field: 'account.totalRounds', operator: 'gte', value: '' }] }); setSegmentDialogOpen(true) }
  const saveSegment = async () => { if (!segmentForm.name) return toast.error('请填写分群名称'); try { await api.crm.createSegment(segmentForm); toast.success('分群已创建'); setSegmentDialogOpen(false); loadSegments() } catch {} }
  const refreshSegment = async (id: string) => { try { const r: any = await api.crm.refreshSegment(id); toast.success(`匹配 ${r.data?.playerCount || 0} 位客户`); loadSegments() } catch {} }
  const deleteSegment = async (id: string) => { if (!confirm('确认删除？')) return; try { await api.crm.deleteSegment(id); toast.success('已删除'); loadSegments() } catch {} }

  const openCampaignDialog = () => { setCampaignForm({ name: '', description: '', type: 'promotion', segmentId: '', targetTags: [], channel: 'wechat', content: '', budget: 0 }); setCampaignDialogOpen(true) }
  const saveCampaign = async () => {
    if (!campaignForm.name) return toast.error('请填写活动名称')
    try { await api.crm.createCampaign(campaignForm); toast.success('活动已创建'); setCampaignDialogOpen(false); loadCampaigns() } catch {}
  }
  const launchCampaign = async (id: string) => { if (!confirm('确认启动此活动？')) return; try { const r: any = await api.crm.launchCampaign(id); toast.success(r.message || '已启动'); loadCampaigns() } catch {} }
  const deleteCampaign = async (id: string) => { if (!confirm('确认删除？')) return; try { await api.crm.deleteCampaign(id); toast.success('已删除'); loadCampaigns() } catch {} }

  const runRFM = async () => { try { const r: any = await api.crm.calculateRFM(); toast.success(r.message || 'RFM 计算完成'); loadCustomers(); loadInsights() } catch {} }
  const runAutoFollowups = async () => { try { const r: any = await api.crm.generateAutoFollowups(); toast.success(r.message || '自动跟进已生成'); loadFollowups() } catch {} }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-b shrink-0">
        <Users className="w-5 h-5 text-emerald-600" />
        <h1 className="text-lg font-bold">CRM 客户关系管理</h1>
        <div className="flex-1" />
        <button onClick={runAutoFollowups} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50" title="扫描生日/到期/沉睡客户生成跟进"><Zap className="w-3.5 h-3.5 text-amber-500" />自动跟进</button>
        <button onClick={runRFM} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50" title="重新计算全部客户 RFM 评分"><TrendingUp className="w-3.5 h-3.5 text-blue-500" />计算RFM</button>
      </div>

      <div className="flex gap-1 px-4 pt-3 bg-white border-b shrink-0 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon; const active = activeTab === t.key
          return <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${active ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            <Icon className="w-4 h-4" />{t.label}
          </button>
        })}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'overview' && <OverviewTab customers={customers} tags={tags} loading={loading} searchQ={searchQ} setSearchQ={setSearchQ} filterTag={filterTag} setFilterTag={setFilterTag} filterLevel={filterLevel} setFilterLevel={setFilterLevel} onOpen360={open360} onToggleTag={toggleTag} openTagDialog={openTagDialog} onNewInteraction={openInteractionDialog} onNewFollowup={openFollowupDialog} />}
        {activeTab === 'interactions' && <InteractionTab interactions={interactions} customers={customers} onNew={openInteractionDialog} onRefresh={loadInteractions} onCreateFollowup={(i: Interaction) => { const c = customers.find(c => c._id === i.playerId); openFollowupDialog(c) }} />}
        {activeTab === 'followups' && <FollowupTab followups={followups} filter={followupFilter} setFilter={setFollowupFilter} onNew={openFollowupDialog} onRefresh={loadFollowups} onUpdateStatus={updateFollowupStatus} />}
        {activeTab === 'segments' && <SegmentTab segments={segments} onNew={openSegmentDialog} onRefresh={refreshSegment} onDelete={deleteSegment} />}
        {activeTab === 'campaigns' && <CampaignTab campaigns={campaigns} segments={segments} onNew={openCampaignDialog} onLaunch={launchCampaign} onDelete={deleteCampaign} onRefresh={loadCampaigns} />}
        {activeTab === 'insights' && <InsightsTab data={insights} onRefresh={loadInsights} />}
      </div>

      {drawerOpen && <Customer360Drawer data={drawerData} loading={drawerLoading} tags={tags} onClose={() => { setDrawerOpen(false); setDrawerData(null) }} onToggleTag={toggleTag} />}

      {tagDialogOpen && <Dialog title={editingTag ? '编辑标签' : '新增标签'} onClose={() => setTagDialogOpen(false)}>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">名称<input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={tagForm.name} onChange={e => setTagForm(p => ({ ...p, name: e.target.value }))} /></label>
          <label className="block text-sm font-medium text-gray-700">颜色<input type="color" className="mt-1 block w-12 h-8 border rounded cursor-pointer" value={tagForm.color} onChange={e => setTagForm(p => ({ ...p, color: e.target.value }))} /></label>
          <label className="block text-sm font-medium text-gray-700">分类<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={tagForm.category} onChange={e => setTagForm(p => ({ ...p, category: e.target.value }))}>{['通用', '身份', '行为', '消费', '风险', '偏好', '来源'].map(c => <option key={c}>{c}</option>)}</select></label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setTagDialogOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button onClick={saveTag} className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">保存</button>
          </div>
          {!editingTag && tags.length > 0 && <div className="pt-3 border-t mt-3"><p className="text-xs text-gray-500 mb-2">已有标签</p><div className="flex flex-wrap gap-2">{tags.map(t => <span key={t._id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ backgroundColor: t.color + '20', color: t.color }}>{t.name}<button onClick={() => openTagDialog(t)} className="hover:opacity-70"><Edit2 className="w-3 h-3" /></button><button onClick={() => deleteTag(t._id)} className="hover:opacity-70"><Trash2 className="w-3 h-3" /></button></span>)}</div></div>}
        </div>
      </Dialog>}

      {interactionDialogOpen && <Dialog title="新增互动记录" onClose={() => setInteractionDialogOpen(false)}>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">客户<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={interactionForm.playerId} onChange={e => { const c = customers.find(c => c._id === e.target.value); setInteractionForm(p => ({ ...p, playerId: e.target.value, playerName: c?.name || '' })) }}><option value="">请选择客户</option>{customers.map(c => <option key={c._id} value={c._id}>{c.name} ({c.playerNo})</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-gray-700">类型<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={interactionForm.type} onChange={e => setInteractionForm(p => ({ ...p, type: e.target.value }))}>{Object.entries(INTERACTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label className="block text-sm font-medium text-gray-700">方向<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={interactionForm.direction} onChange={e => setInteractionForm(p => ({ ...p, direction: e.target.value }))}><option value="outbound">主动联系</option><option value="inbound">客户来访</option></select></label>
          </div>
          <label className="block text-sm font-medium text-gray-700">内容<textarea className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={interactionForm.content} onChange={e => setInteractionForm(p => ({ ...p, content: e.target.value }))} /></label>
          <label className="block text-sm font-medium text-gray-700">摘要<input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={interactionForm.summary} onChange={e => setInteractionForm(p => ({ ...p, summary: e.target.value }))} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={interactionForm.followUpRequired} onChange={e => setInteractionForm(p => ({ ...p, followUpRequired: e.target.checked }))} />需要跟进</label>
          <div className="flex justify-end gap-2 pt-2"><button onClick={() => setInteractionDialogOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button><button onClick={saveInteraction} className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">保存</button></div>
        </div>
      </Dialog>}

      {followupDialogOpen && <Dialog title="新增跟进任务" onClose={() => setFollowupDialogOpen(false)}>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">客户<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={followupForm.playerId} onChange={e => { const c = customers.find(c => c._id === e.target.value); setFollowupForm(p => ({ ...p, playerId: e.target.value, playerName: c?.name || '' })) }}><option value="">请选择客户</option>{customers.map(c => <option key={c._id} value={c._id}>{c.name} ({c.playerNo})</option>)}</select></label>
          <label className="block text-sm font-medium text-gray-700">标题<input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={followupForm.title} onChange={e => setFollowupForm(p => ({ ...p, title: e.target.value }))} /></label>
          <label className="block text-sm font-medium text-gray-700">内容<textarea className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={followupForm.content} onChange={e => setFollowupForm(p => ({ ...p, content: e.target.value }))} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-gray-700">优先级<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={followupForm.priority} onChange={e => setFollowupForm(p => ({ ...p, priority: e.target.value }))}>{Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label className="block text-sm font-medium text-gray-700">到期日<input type="date" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={followupForm.dueDate} onChange={e => setFollowupForm(p => ({ ...p, dueDate: e.target.value }))} /></label>
          </div>
          <label className="block text-sm font-medium text-gray-700">负责人<input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="员工姓名" value={followupForm.assigneeName} onChange={e => setFollowupForm(p => ({ ...p, assigneeName: e.target.value }))} /></label>
          <div className="flex justify-end gap-2 pt-2"><button onClick={() => setFollowupDialogOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button><button onClick={saveFollowup} className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">保存</button></div>
        </div>
      </Dialog>}

      {segmentDialogOpen && <Dialog title="新建客户分群" onClose={() => setSegmentDialogOpen(false)} wide>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">名称<input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={segmentForm.name} onChange={e => setSegmentForm(p => ({ ...p, name: e.target.value }))} /></label>
          <label className="block text-sm font-medium text-gray-700">描述<input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={segmentForm.description} onChange={e => setSegmentForm(p => ({ ...p, description: e.target.value }))} /></label>
          <div><p className="text-sm font-medium text-gray-700 mb-2">筛选规则</p>
            {segmentForm.rules.map((rule, i) => <div key={i} className="flex gap-2 mb-2 items-center">
              <select className="border rounded-lg px-2 py-1.5 text-sm flex-1" value={rule.field} onChange={e => { const rules = [...segmentForm.rules]; rules[i] = { ...rules[i], field: e.target.value }; setSegmentForm(p => ({ ...p, rules })) }}>{SEGMENT_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
              <select className="border rounded-lg px-2 py-1.5 text-sm" value={rule.operator} onChange={e => { const rules = [...segmentForm.rules]; rules[i] = { ...rules[i], operator: e.target.value }; setSegmentForm(p => ({ ...p, rules })) }}>{SEGMENT_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              <input className="border rounded-lg px-2 py-1.5 text-sm w-24" placeholder="值" value={rule.value} onChange={e => { const rules = [...segmentForm.rules]; rules[i] = { ...rules[i], value: e.target.value }; setSegmentForm(p => ({ ...p, rules })) }} />
              {segmentForm.rules.length > 1 && <button onClick={() => setSegmentForm(p => ({ ...p, rules: p.rules.filter((_, j) => j !== i) }))} className="text-red-500"><X className="w-4 h-4" /></button>}
            </div>)}
            <button onClick={() => setSegmentForm(p => ({ ...p, rules: [...p.rules, { field: 'account.totalRounds', operator: 'gte', value: '' }] }))} className="text-sm text-emerald-600">+ 添加条件</button>
          </div>
          <div className="flex justify-end gap-2 pt-2"><button onClick={() => setSegmentDialogOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button><button onClick={saveSegment} className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">保存</button></div>
        </div>
      </Dialog>}

      {campaignDialogOpen && <Dialog title="新建营销活动" onClose={() => setCampaignDialogOpen(false)} wide>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">活动名称<input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={campaignForm.name} onChange={e => setCampaignForm(p => ({ ...p, name: e.target.value }))} /></label>
          <label className="block text-sm font-medium text-gray-700">描述<input className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={campaignForm.description} onChange={e => setCampaignForm(p => ({ ...p, description: e.target.value }))} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-gray-700">类型<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={campaignForm.type} onChange={e => setCampaignForm(p => ({ ...p, type: e.target.value }))}>{Object.entries(CAMPAIGN_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block text-sm font-medium text-gray-700">渠道<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={campaignForm.channel} onChange={e => setCampaignForm(p => ({ ...p, channel: e.target.value }))}><option value="wechat">微信推送</option><option value="sms">短信</option><option value="phone">电话</option><option value="email">邮件</option></select></label>
          </div>
          <label className="block text-sm font-medium text-gray-700">目标分群<select className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={campaignForm.segmentId} onChange={e => setCampaignForm(p => ({ ...p, segmentId: e.target.value }))}><option value="">全部客户</option>{segments.map(s => <option key={s._id} value={s._id}>{s.name} ({s.playerCount}人)</option>)}</select></label>
          <label className="block text-sm font-medium text-gray-700">活动内容<textarea className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={campaignForm.content} onChange={e => setCampaignForm(p => ({ ...p, content: e.target.value }))} /></label>
          <label className="block text-sm font-medium text-gray-700">预算 (元)<input type="number" className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" value={campaignForm.budget} onChange={e => setCampaignForm(p => ({ ...p, budget: Number(e.target.value) }))} /></label>
          <div className="flex justify-end gap-2 pt-2"><button onClick={() => setCampaignDialogOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button><button onClick={saveCampaign} className="px-4 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">保存</button></div>
        </div>
      </Dialog>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  Tab 1: 客户总览
 * ═══════════════════════════════════════════════════════════ */
function OverviewTab({ customers, tags, loading, searchQ, setSearchQ, filterTag, setFilterTag, filterLevel, setFilterLevel, onOpen360, onToggleTag, openTagDialog, onNewInteraction, onNewFollowup }: any) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" placeholder="搜索姓名/电话/编号..." value={searchQ} onChange={e => setSearchQ(e.target.value)} /></div>
        <select className="border rounded-lg px-3 py-2 text-sm" value={filterTag} onChange={e => setFilterTag(e.target.value)}><option value="">全部标签</option>{tags.map((t: CrmTag) => <option key={t._id} value={t.name}>{t.name}</option>)}</select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={filterLevel} onChange={e => setFilterLevel(e.target.value)}><option value="">全部等级</option>{Object.entries(LEVEL_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button onClick={() => openTagDialog()} className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"><Tag className="w-4 h-4" />标签管理</button>
      </div>
      {loading ? <div className="text-center py-20 text-gray-400">加载中...</div> : customers.length === 0 ? <div className="text-center py-20 text-gray-400">暂无客户数据</div> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600"><tr><th className="text-left px-4 py-3 font-medium">客户</th><th className="text-left px-4 py-3 font-medium">等级</th><th className="text-left px-4 py-3 font-medium">标签</th><th className="text-right px-4 py-3 font-medium">总消费</th><th className="text-right px-4 py-3 font-medium">总轮次</th><th className="text-right px-4 py-3 font-medium">余额</th><th className="text-center px-4 py-3 font-medium">操作</th></tr></thead>
            <tbody className="divide-y">{customers.map((c: Customer) => (
              <tr key={c._id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpen360(c._id)}>
                <td className="px-4 py-3"><div className="font-medium text-gray-900">{c.name || '未命名'}</div><div className="text-xs text-gray-400">{c.playerNo} {c.phoneNumber && `· ${c.phoneNumber}`}</div></td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[c.memberLevel] || LEVEL_COLORS[0]}`}>{LEVEL_NAMES[c.memberLevel] || '非会员'}</span></td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{(c.tags || []).slice(0, 3).map((t: string) => { const td = tags.find((x: CrmTag) => x.name === t); return <span key={t} className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: (td?.color || '#6b7280') + '20', color: td?.color || '#6b7280' }}>{t}</span> })}{(c.tags || []).length > 3 && <span className="text-xs text-gray-400">+{c.tags.length - 3}</span>}</div></td>
                <td className="px-4 py-3 text-right font-mono">{(c.totalConsumption || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{c.totalRounds || 0}</td>
                <td className="px-4 py-3 text-right font-mono">{(c.balance || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}><div className="flex justify-center gap-1">
                  <button onClick={() => onOpen360(c._id)} className="p-1 rounded hover:bg-gray-100" title="查看详情"><Eye className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => onNewInteraction(c)} className="p-1 rounded hover:bg-gray-100" title="新增互动"><MessageSquare className="w-4 h-4 text-blue-500" /></button>
                  <button onClick={() => onNewFollowup(c)} className="p-1 rounded hover:bg-gray-100" title="新增跟进"><ListTodo className="w-4 h-4 text-orange-500" /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  Tab 2: 互动记录
 * ═══════════════════════════════════════════════════════════ */
function InteractionTab({ interactions, customers, onNew, onRefresh, onCreateFollowup }: any) {
  return (<div className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold text-gray-700">互动记录</h2>
      <div className="flex gap-2"><button onClick={onRefresh} className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" />刷新</button><button onClick={() => onNew()} className="flex items-center gap-1 px-3 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"><Plus className="w-4 h-4" />新增互动</button></div>
    </div>
    {interactions.length === 0 ? <div className="text-center py-20 text-gray-400">暂无互动记录</div> : <div className="space-y-3">{interactions.map((item: Interaction) => {
      const typeInfo = INTERACTION_TYPES[item.type] || INTERACTION_TYPES.note
      return <div key={item._id} className="bg-white rounded-xl border p-4">
        <div className="flex items-start justify-between"><div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>{typeInfo.label}</span><span className="text-xs text-gray-400">{item.direction === 'inbound' ? '客户来访' : '主动联系'}</span><span className="font-medium text-sm text-gray-800">{item.playerName}</span></div><span className="text-xs text-gray-400">{fmtTime(item.createTime)}</span></div>
        <p className="text-sm text-gray-700 mt-2">{item.content}</p>
        {item.summary && <p className="text-xs text-gray-500 mt-1">摘要: {item.summary}</p>}
        <div className="flex items-center justify-between mt-3"><span className="text-xs text-gray-400">{item.staffName && `记录人: ${item.staffName}`}</span><div className="flex gap-2">
          {item.followUpRequired && !item.followUpId && <button onClick={() => onCreateFollowup(item)} className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"><ListTodo className="w-3 h-3" />创建跟进</button>}
          {item.followUpRequired && item.followUpId && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />已创建跟进</span>}
        </div></div>
      </div>
    })}</div>}
  </div>)
}

/* ═══════════════════════════════════════════════════════════
 *  Tab 3: 跟进任务
 * ═══════════════════════════════════════════════════════════ */
function FollowupTab({ followups, filter, setFilter, onNew, onRefresh, onUpdateStatus }: any) {
  return (<div className="space-y-4">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2"><h2 className="text-base font-semibold text-gray-700">跟进任务</h2><div className="flex gap-1">{[{ value: '', label: '全部' }, ...Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))].map(s => <button key={s.value} onClick={() => setFilter(s.value)} className={`px-2.5 py-1 text-xs rounded-full ${filter === s.value ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>{s.label}</button>)}</div></div>
      <div className="flex gap-2"><button onClick={onRefresh} className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" />刷新</button><button onClick={() => onNew()} className="flex items-center gap-1 px-3 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"><Plus className="w-4 h-4" />新增任务</button></div>
    </div>
    {followups.length === 0 ? <div className="text-center py-20 text-gray-400">暂无跟进任务</div> : <div className="space-y-3">{followups.map((item: Followup) => {
      const si = STATUS_MAP[item.status] || STATUS_MAP.pending; const pi = PRIORITY_MAP[item.priority] || PRIORITY_MAP.medium; const SI = si.icon
      const overdue = item.dueDate && item.status !== 'completed' && item.status !== 'cancelled' && new Date(item.dueDate) < new Date()
      return <div key={item._id} className={`bg-white rounded-xl border p-4 ${overdue ? 'border-red-300' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap"><SI className={`w-4 h-4 ${si.color.split(' ')[1]}`} /><span className="font-medium text-sm text-gray-800">{item.title}</span><span className={`text-xs font-medium ${pi.color}`}>[{pi.label}]</span>{overdue && <span className="text-xs text-red-600 font-medium flex items-center gap-0.5"><AlertCircle className="w-3 h-3" />已逾期</span>}{item.autoType && <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">自动</span>}</div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${si.color}`}>{si.label}</span>
        </div>
        {item.content && <p className="text-sm text-gray-600 mt-2">{item.content}</p>}
        <div className="flex items-center justify-between mt-3 text-xs text-gray-400"><div className="flex gap-3"><span>客户: {item.playerName}</span>{item.assigneeName && <span>负责人: {item.assigneeName}</span>}{item.dueDate && <span>到期: {item.dueDate}</span>}</div>
          <div className="flex gap-2">{item.status === 'pending' && <button onClick={() => onUpdateStatus(item._id, 'in_progress')} className="text-blue-600 hover:text-blue-700">开始处理</button>}{item.status === 'in_progress' && <button onClick={() => onUpdateStatus(item._id, 'completed')} className="text-green-600 hover:text-green-700">标记完成</button>}{(item.status === 'pending' || item.status === 'in_progress') && <button onClick={() => onUpdateStatus(item._id, 'cancelled')} className="text-gray-400 hover:text-gray-600">取消</button>}</div>
        </div>
      </div>
    })}</div>}
  </div>)
}

/* ═══════════════════════════════════════════════════════════
 *  Tab 4: 客户分群
 * ═══════════════════════════════════════════════════════════ */
function SegmentTab({ segments, onNew, onRefresh, onDelete }: any) {
  return (<div className="space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-700">客户分群</h2><button onClick={onNew} className="flex items-center gap-1 px-3 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"><Plus className="w-4 h-4" />新建分群</button></div>
    {segments.length === 0 ? <div className="text-center py-20 text-gray-400">暂无分群</div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{segments.map((seg: Segment) => <div key={seg._id} className="bg-white rounded-xl border p-4">
      <div className="flex items-start justify-between"><div><h3 className="font-medium text-gray-800">{seg.name}</h3><p className="text-xs text-gray-500 mt-0.5">{seg.description || '无描述'}</p></div><span className={`px-2 py-0.5 rounded-full text-xs ${seg.type === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{seg.type === 'auto' ? '自动' : '手动'}</span></div>
      <div className="mt-3"><span className="text-gray-600 text-sm"><span className="font-semibold text-lg text-gray-800">{seg.playerCount || 0}</span> 位客户</span></div>
      {seg.rules?.length > 0 && <div className="mt-2 space-y-1">{seg.rules.map((r: any, i: number) => <p key={i} className="text-xs text-gray-500">{SEGMENT_FIELDS.find(f => f.value === r.field)?.label || r.field} {SEGMENT_OPERATORS.find(o => o.value === r.operator)?.label || r.operator} {r.value}</p>)}</div>}
      <div className="flex items-center justify-between mt-3 pt-3 border-t"><span className="text-xs text-gray-400">{seg.lastRefreshedAt ? `刷新: ${fmtTime(seg.lastRefreshedAt)}` : '未刷新'}</span><div className="flex gap-2">{seg.type === 'auto' && <button onClick={() => onRefresh(seg._id)} className="text-xs text-blue-600 flex items-center gap-1"><RefreshCw className="w-3 h-3" />刷新</button>}<button onClick={() => onDelete(seg._id)} className="text-xs text-red-500"><Trash2 className="w-3 h-3" /></button></div></div>
    </div>)}</div>}
  </div>)
}

/* ═══════════════════════════════════════════════════════════
 *  Tab 5: 营销活动
 * ═══════════════════════════════════════════════════════════ */
function CampaignTab({ campaigns, segments, onNew, onLaunch, onDelete, onRefresh }: any) {
  return (<div className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold text-gray-700">营销活动</h2>
      <div className="flex gap-2"><button onClick={onRefresh} className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" />刷新</button><button onClick={onNew} className="flex items-center gap-1 px-3 py-2 text-sm text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"><Plus className="w-4 h-4" />新建活动</button></div>
    </div>
    {campaigns.length === 0 ? <div className="text-center py-20 text-gray-400">暂无营销活动</div> : <div className="space-y-4">{campaigns.map((c: Campaign) => {
      const si = CAMPAIGN_STATUS[c.status] || CAMPAIGN_STATUS.draft
      return <div key={c._id} className="bg-white rounded-xl border p-5">
        <div className="flex items-start justify-between">
          <div><h3 className="font-semibold text-gray-800">{c.name}</h3><p className="text-xs text-gray-500 mt-0.5">{c.description || CAMPAIGN_TYPES[c.type] || c.type}</p></div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${si.color}`}>{si.label}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatMini label="目标客户" value={c.stats?.targetCount || 0} icon={Target} />
          <StatMini label="已送达" value={c.stats?.sentCount || 0} icon={Send} />
          <StatMini label="已打开" value={c.stats?.openedCount || 0} icon={Eye} />
          <StatMini label="已转化" value={c.stats?.convertedCount || 0} icon={CheckCircle2} />
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t text-xs">
          <div className="flex gap-3 text-gray-400"><span>渠道: {c.channel}</span>{c.budget > 0 && <span>预算: ¥{c.budget.toLocaleString()}</span>}<span>{fmtTime(c.createTime)}</span></div>
          <div className="flex gap-2">{c.status === 'draft' && <button onClick={() => onLaunch(c._id)} className="text-blue-600 hover:text-blue-700 flex items-center gap-1"><Send className="w-3 h-3" />启动</button>}<button onClick={() => onDelete(c._id)} className="text-red-500 hover:text-red-600"><Trash2 className="w-3 h-3" /></button></div>
        </div>
      </div>
    })}</div>}
  </div>)
}

/* ═══════════════════════════════════════════════════════════
 *  Tab 6: 数据洞察
 * ═══════════════════════════════════════════════════════════ */
function InsightsTab({ data, onRefresh }: any) {
  if (!data) return <div className="text-center py-20 text-gray-400">加载中...</div>
  const ov = data.overview || {}
  const rfmDist = data.rfmLevelDistribution || {}
  const memberDist = data.memberLevelDistribution || {}
  const topTags = data.topTags || []

  const rfmEntries = Object.entries(rfmDist).sort((a: any, b: any) => b[1] - a[1])
  const rfmTotal = rfmEntries.reduce((s, [, c]: any) => s + c, 0) || 1
  const memberEntries = Object.entries(memberDist).sort((a: any, b: any) => b[1] - a[1])
  const memberTotal = memberEntries.reduce((s, [, c]: any) => s + c, 0) || 1

  const RFM_COLORS: Record<string, string> = {
    '重要价值客户': '#10b981', '重要发展客户': '#3b82f6', '重要保持客户': '#f59e0b',
    '重要挽留客户': '#ef4444', '一般价值客户': '#6366f1', '新客户': '#06b6d4', '低价值/流失客户': '#9ca3af'
  }

  return (<div className="space-y-6">
    <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-700">数据洞察</h2><button onClick={onRefresh} className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" />刷新</button></div>

    {/* KPI */}
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <KpiCard label="总客户" value={ov.totalCustomers || 0} icon={Users} color="text-emerald-600 bg-emerald-50" />
      <KpiCard label="活跃客户" value={ov.activeCount || 0} icon={Activity} color="text-blue-600 bg-blue-50" sub="60天内到场" />
      <KpiCard label="沉睡客户" value={ov.dormantCount || 0} icon={Clock} color="text-amber-600 bg-amber-50" sub=">60天未到场" />
      <KpiCard label="流失风险" value={ov.churnRisk || 0} icon={AlertCircle} color="text-red-600 bg-red-50" sub="R评分<=2" />
      <KpiCard label="总消费额" value={`¥${((ov.totalConsumption || 0) / 10000).toFixed(1)}万`} icon={TrendingUp} color="text-purple-600 bg-purple-50" />
      <KpiCard label="总储值余额" value={`¥${((ov.totalBalance || 0) / 10000).toFixed(1)}万`} icon={Target} color="text-cyan-600 bg-cyan-50" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* RFM 分布 */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-700 mb-4">RFM 客户分层</h3>
        {rfmEntries.length === 0 ? <p className="text-sm text-gray-400">请先点击顶部「计算RFM」按钮</p> :
          <div className="space-y-3">{rfmEntries.map(([level, count]: any) => (
            <div key={level}>
              <div className="flex justify-between text-sm mb-1"><span style={{ color: RFM_COLORS[level] || '#6b7280' }} className="font-medium">{level}</span><span className="text-gray-500">{count} 人 ({((count / rfmTotal) * 100).toFixed(0)}%)</span></div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${(count / rfmTotal) * 100}%`, backgroundColor: RFM_COLORS[level] || '#6b7280' }} /></div>
            </div>
          ))}</div>}
      </div>

      {/* 会员等级分布 */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-700 mb-4">会员等级分布</h3>
        <div className="space-y-3">{memberEntries.map(([level, count]: any) => {
          const lvl = parseInt(level); const name = LEVEL_NAMES[lvl] || `等级${level}`
          const colors = ['#9ca3af', '#3b82f6', '#eab308', '#a855f7', '#10b981']
          return <div key={level}>
            <div className="flex justify-between text-sm mb-1"><span className="font-medium">{name}</span><span className="text-gray-500">{count} 人 ({((count / memberTotal) * 100).toFixed(0)}%)</span></div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(count / memberTotal) * 100}%`, backgroundColor: colors[lvl] || '#6b7280' }} /></div>
          </div>
        })}</div>
      </div>
    </div>

    {/* 热门标签 */}
    {topTags.length > 0 && <div className="bg-white rounded-xl border p-5">
      <h3 className="font-semibold text-gray-700 mb-4">热门标签 Top 10</h3>
      <div className="flex flex-wrap gap-3">{topTags.map((t: any) => <span key={t.name} className="px-3 py-1.5 bg-gray-50 rounded-lg text-sm"><span className="font-medium">{t.name}</span> <span className="text-gray-400 ml-1">{t.count}人</span></span>)}</div>
    </div>}
  </div>)
}

/* ═══════════════════════════════════════════════════════════
 *  客户 360 详情抽屉（增强版）
 * ═══════════════════════════════════════════════════════════ */
function Customer360Drawer({ data, loading, tags, onClose, onToggleTag }: any) {
  if (!data && !loading) return null
  const player = data?.player || {}; const summary = data?.summary || {}
  const rfm = data?.rfm
  const recentBookings = data?.recentBookings || []
  const recentInteractions = data?.recentInteractions || []
  const pendingFollowups = data?.pendingFollowups || []
  const currentTags: string[] = summary.tags || []

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[500px] bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
          <h2 className="font-bold text-lg">客户 360</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        {loading ? <div className="flex items-center justify-center h-64 text-gray-400">加载中...</div> : (
          <div className="p-5 space-y-5">
            {/* 基础信息 */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-bold">{(player.name || '?')[0]}</div>
              <div>
                <h3 className="font-semibold text-lg">{player.name || '未命名'}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500"><span>{player.playerNo}</span>{player.phoneNumber && <><span>·</span><Phone className="w-3 h-3" /><span>{player.phoneNumber}</span></>}</div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium mt-1 inline-block ${LEVEL_COLORS[summary.memberLevel] || LEVEL_COLORS[0]}`}>{LEVEL_NAMES[summary.memberLevel] || '非会员'}</span>
              </div>
            </div>

            {/* RFM 评分卡 */}
            {rfm && <div className="rounded-xl p-4" style={{ backgroundColor: rfm.color + '10', borderLeft: `4px solid ${rfm.color}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm" style={{ color: rfm.color }}>{rfm.level}</span>
                <span className="text-xs text-gray-500">总分 {rfm.totalScore}/15</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-xs text-gray-500">R (最近消费)</div><div className="text-lg font-bold" style={{ color: rfm.color }}>{rfm.rScore}</div><div className="text-xs text-gray-400">{rfm.rValue}天前</div></div>
                <div><div className="text-xs text-gray-500">F (消费频次)</div><div className="text-lg font-bold" style={{ color: rfm.color }}>{rfm.fScore}</div><div className="text-xs text-gray-400">近半年{rfm.fValue}次</div></div>
                <div><div className="text-xs text-gray-500">M (消费金额)</div><div className="text-lg font-bold" style={{ color: rfm.color }}>{rfm.mScore}</div><div className="text-xs text-gray-400">¥{(rfm.mValue || 0).toLocaleString()}</div></div>
              </div>
              <p className="text-xs mt-2" style={{ color: rfm.color }}>策略: {rfm.strategy}</p>
            </div>}

            {/* 流失风险 */}
            {summary.churnRiskDays !== null && summary.churnRiskDays !== undefined && <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${summary.churnRiskDays > 60 ? 'bg-red-50 text-red-700' : summary.churnRiskDays > 30 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
              <AlertCircle className="w-4 h-4" />
              {summary.churnRiskDays > 60 ? `高流失风险：已 ${summary.churnRiskDays} 天未到场` : summary.churnRiskDays > 30 ? `注意：${summary.churnRiskDays} 天未到场` : `活跃：${summary.churnRiskDays} 天前到场`}
            </div>}

            {/* 消费概览 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '总消费', value: `¥${(summary.totalConsumption || 0).toLocaleString()}` },
                { label: '总轮次', value: summary.totalRounds || 0 },
                { label: '账户余额', value: `¥${(summary.balance || 0).toLocaleString()}` },
                { label: '积分', value: (summary.points || 0).toLocaleString() },
              ].map(s => <div key={s.label} className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">{s.label}</p><p className="text-lg font-semibold text-gray-800">{s.value}</p></div>)}
            </div>

            {/* 标签管理 */}
            <div><p className="text-sm font-medium text-gray-700 mb-2">客户标签</p>
              <div className="flex flex-wrap gap-2">{tags.map((t: CrmTag) => {
                const active = currentTags.includes(t.name)
                return <button key={t._id} onClick={() => onToggleTag(player._id, t.name, currentTags)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${active ? 'font-medium' : 'opacity-40 hover:opacity-70'}`}
                  style={{ borderColor: t.color, backgroundColor: active ? t.color + '20' : 'transparent', color: t.color }}>{t.name}</button>
              })}{tags.length === 0 && <span className="text-xs text-gray-400">暂无标签</span>}</div>
            </div>

            {/* 待办跟进 */}
            {pendingFollowups.length > 0 && <div><p className="text-sm font-medium text-gray-700 mb-2">待办跟进</p><div className="space-y-2">{pendingFollowups.map((f: any) => {
              const si = STATUS_MAP[f.status] || STATUS_MAP.pending
              return <div key={f._id} className="bg-orange-50 rounded-lg p-3 text-sm"><div className="flex items-center justify-between"><span className="font-medium">{f.title}</span><span className={`px-1.5 py-0.5 rounded text-xs ${si.color}`}>{si.label}</span></div>{f.dueDate && <p className="text-xs text-gray-500 mt-1">到期: {f.dueDate}</p>}</div>
            })}</div></div>}

            {/* 互动时间线 */}
            {recentInteractions.length > 0 && <div><p className="text-sm font-medium text-gray-700 mb-2">最近互动</p><div className="space-y-2">{recentInteractions.map((item: any) => {
              const typeInfo = INTERACTION_TYPES[item.type] || INTERACTION_TYPES.note
              return <div key={item._id} className="flex gap-3 text-sm"><div className="flex flex-col items-center"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${typeInfo.color}`}>{typeInfo.label[0]}</div><div className="flex-1 w-px bg-gray-200 mt-1" /></div>
                <div className="pb-3 flex-1"><p className="text-gray-700">{item.content.length > 60 ? item.content.slice(0, 60) + '...' : item.content}</p><p className="text-xs text-gray-400 mt-0.5">{fmtTime(item.createTime)} {item.staffName && `· ${item.staffName}`}</p></div></div>
            })}</div></div>}

            {/* 最近预订 */}
            {recentBookings.length > 0 && <div><p className="text-sm font-medium text-gray-700 mb-2">最近预订</p><div className="space-y-2">{recentBookings.slice(0, 5).map((b: any) => <div key={b._id} className="bg-gray-50 rounded-lg p-3 text-sm flex justify-between items-center"><div><span className="font-medium">{b.courseName || b.orderNo || '-'}</span><span className="text-xs text-gray-400 ml-2">{b.teeTime || ''}</span></div><span className="text-xs text-gray-500">{b.status || ''}</span></div>)}</div></div>}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
 *  通用组件
 * ═══════════════════════════════════════════════════════════ */
function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-2xl p-6 ${wide ? 'w-[560px]' : 'w-[420px]'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button></div>
      {children}
    </div>
  </div>
}

function KpiCard({ label, value, icon: Icon, color, sub }: { label: string; value: any; icon: any; color: string; sub?: string }) {
  return <div className="bg-white rounded-xl border p-4">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}><Icon className="w-4 h-4" /></div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-xl font-bold text-gray-800">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
}

function StatMini({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return <div className="text-center"><Icon className="w-4 h-4 mx-auto text-gray-400 mb-1" /><p className="text-lg font-semibold text-gray-800">{value}</p><p className="text-xs text-gray-500">{label}</p></div>
}

function fmtTime(t: any): string {
  if (!t) return ''
  const d = typeof t === 'string' ? new Date(t) : t instanceof Date ? t : t.$date ? new Date(t.$date) : new Date(t)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
