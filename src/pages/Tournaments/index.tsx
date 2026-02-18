/**
 * 赛事与活动管理页面
 *
 * 6 个 Tab：
 *   1. 赛事列表 — 查看全部赛事、状态筛选、快捷操作
 *   2. 创建赛事 — 表单创建（赛制/场地/日期/费用/奖项/规则）
 *   3. 报名管理 — 查看/审核/新增报名、候补递补
 *   4. 分组编排 — 自动/手动分组、发球顺序
 *   5. 成绩录入 — 逐人录入总杆、逐洞记分
 *   6. 排行榜   — 实时 Leaderboard、颁奖
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Trophy, Plus, Users, Grid3X3, ClipboardList, BarChart3,
  Calendar, MapPin, DollarSign, Hash, ChevronRight, RefreshCw,
  Search, UserPlus, Shuffle, Award, Flag, Clock, X, Check,
  ArrowUpDown, Star, Trash2, Edit, Eye, Play, Pause, Archive
} from 'lucide-react'
import { api } from '@/utils/api'

/* ─── 常量 ─── */
const FORMATS: Record<string, string> = {
  stroke: '比杆赛', match: '比洞赛', stableford: '斯特布福德',
  scramble: '乱拉赛', best_ball: '最佳球', shotgun: '鸣枪同发',
}
const STATUSES: Record<string, { label: string; color: string }> = {
  draft:        { label: '草稿',   color: 'bg-gray-100 text-gray-600' },
  registration: { label: '报名中', color: 'bg-blue-100 text-blue-700' },
  closed:       { label: '报名截止', color: 'bg-yellow-100 text-yellow-700' },
  grouping:     { label: '分组中', color: 'bg-purple-100 text-purple-700' },
  in_progress:  { label: '进行中', color: 'bg-green-100 text-green-700' },
  scoring:      { label: '记分中', color: 'bg-emerald-100 text-emerald-700' },
  completed:    { label: '已完赛', color: 'bg-indigo-100 text-indigo-700' },
  archived:     { label: '已归档', color: 'bg-gray-200 text-gray-500' },
}

const STATUS_ACTIONS: Record<string, { next: string; label: string; icon: any }[]> = {
  draft:        [{ next: 'registration', label: '开放报名', icon: Play }],
  registration: [{ next: 'closed', label: '截止报名', icon: Pause }],
  closed:       [{ next: 'grouping', label: '开始分组', icon: Grid3X3 }],
  grouping:     [{ next: 'in_progress', label: '开始比赛', icon: Flag }],
  in_progress:  [{ next: 'scoring', label: '进入记分', icon: ClipboardList }],
  scoring:      [],
  completed:    [{ next: 'archived', label: '归档', icon: Archive }],
}

const tabs = [
  { key: 'list',         label: '赛事列表', icon: Trophy },
  { key: 'create',       label: '创建赛事', icon: Plus },
  { key: 'registration', label: '报名管理', icon: Users },
  { key: 'grouping',     label: '分组编排', icon: Grid3X3 },
  { key: 'scoring',      label: '成绩录入', icon: ClipboardList },
  { key: 'leaderboard',  label: '排行榜',   icon: BarChart3 },
]

export default function Tournaments() {
  const [activeTab, setActiveTab] = useState('list')
  const [tournaments, setTournaments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTournament, setSelectedTournament] = useState<any>(null)

  // 加载赛事列表
  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await api.tournaments.getList()
      setTournaments(res.data || [])
    } catch (e: any) { toast.error('加载失败: ' + e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  // 选中赛事详情
  const selectTournament = useCallback(async (id: string) => {
    setSelectedId(id)
    try {
      const res: any = await api.tournaments.getDetail(id)
      setSelectedTournament(res.data)
    } catch { /* ignore */ }
  }, [])

  // 变更赛事状态
  const changeStatus = async (id: string, status: string) => {
    try {
      await api.tournaments.updateStatus(id, { status })
      toast.success('状态已变更')
      loadList()
      if (id === selectedId) selectTournament(id)
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 顶部 Tab 栏 */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-1 overflow-x-auto shrink-0">
        {tabs.map(t => {
          const Icon = t.icon
          const active = activeTab === t.key
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                active ? 'bg-emerald-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
        <div className="flex-1" />
        <button onClick={loadList} className="p-2 text-gray-400 hover:text-gray-600" title="刷新">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'list' && (
          <TournamentList
            tournaments={tournaments} loading={loading}
            onSelect={(id: string) => { selectTournament(id); setActiveTab('registration') }}
            onChangeStatus={changeStatus}
            onDelete={async (id: string) => {
              if (!confirm('确认删除？')) return
              try { await api.tournaments.delete(id); toast.success('已删除'); loadList() }
              catch (e: any) { toast.error(e.message) }
            }}
          />
        )}
        {activeTab === 'create' && (
          <CreateTournament onCreated={(t) => { loadList(); setSelectedId(t._id); setActiveTab('list'); toast.success('赛事创建成功') }} />
        )}
        {activeTab === 'registration' && (
          <RegistrationTab
            tournaments={tournaments}
            selectedId={selectedId} onSelectId={setSelectedId}
            selectedTournament={selectedTournament} onRefresh={() => selectedId && selectTournament(selectedId)}
          />
        )}
        {activeTab === 'grouping' && (
          <GroupingTab
            tournaments={tournaments}
            selectedId={selectedId} onSelectId={setSelectedId}
          />
        )}
        {activeTab === 'scoring' && (
          <ScoringTab
            tournaments={tournaments}
            selectedId={selectedId} onSelectId={setSelectedId}
          />
        )}
        {activeTab === 'leaderboard' && (
          <LeaderboardTab
            tournaments={tournaments}
            selectedId={selectedId} onSelectId={setSelectedId}
            onFinalize={async (id: string) => {
              try { await api.tournaments.finalize(id); toast.success('赛事已完赛，积分已发放'); loadList() }
              catch (e: any) { toast.error(e.message) }
            }}
          />
        )}
      </div>
    </div>
  )
}

/* ══════════════════ 1. 赛事列表 ══════════════════ */
function TournamentList({ tournaments, loading, onSelect, onChangeStatus, onDelete }: any) {
  const [filter, setFilter] = useState('')
  const filtered = tournaments.filter((t: any) =>
    !filter || t.status === filter
  )

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium ${!filter ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 border'}`}>
          全部 ({tournaments.length})
        </button>
        {Object.entries(STATUSES).map(([k, v]) => {
          const cnt = tournaments.filter((t: any) => t.status === k).length
          if (cnt === 0) return null
          return (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === k ? 'bg-emerald-600 text-white' : `${v.color} border`}`}>
              {v.label} ({cnt})
            </button>
          )
        })}
      </div>

      {/* 赛事卡片 */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">暂无赛事</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t: any) => {
            const st = STATUSES[t.status] || STATUSES.draft
            const actions = STATUS_ACTIONS[t.status] || []
            return (
              <div key={t._id} className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                {/* 头部 */}
                <div className="p-4 border-b">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-base text-gray-900">{t.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{t.tournamentNo}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                    <span className="flex items-center gap-1"><Calendar size={12} />{t.startDate}{t.endDate && t.endDate !== t.startDate ? ` ~ ${t.endDate}` : ''}</span>
                    <span className="flex items-center gap-1"><MapPin size={12} />{t.courseName || '未指定'}</span>
                  </div>
                </div>
                {/* 数据 */}
                <div className="p-4 grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <div className="text-lg font-bold text-gray-800">{t.registeredCount || 0}</div>
                    <div className="text-gray-400">已报名</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-800">{t.maxPlayers}</div>
                    <div className="text-gray-400">上限</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-800">{t.totalHoles}</div>
                    <div className="text-gray-400">洞数</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-emerald-600">¥{t.entryFee || 0}</div>
                    <div className="text-gray-400">报名费</div>
                  </div>
                </div>
                {/* 操作 */}
                <div className="px-4 pb-3 flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    t.format === 'stroke' ? 'bg-blue-50 text-blue-600' :
                    t.format === 'stableford' ? 'bg-amber-50 text-amber-600' :
                    'bg-purple-50 text-purple-600'
                  }`}>{FORMATS[t.format] || t.format}</span>
                  {t.memberOnly && <span className="px-2 py-0.5 rounded text-xs bg-red-50 text-red-500">仅会员</span>}
                  <div className="flex-1" />
                  {actions.map((a: any) => {
                    const AIcon = a.icon
                    return (
                      <button key={a.next} onClick={() => onChangeStatus(t._id, a.next)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                        <AIcon size={12} />{a.label}
                      </button>
                    )
                  })}
                  <button onClick={() => onSelect(t._id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">
                    <Eye size={12} />详情
                  </button>
                  {['draft', 'archived'].includes(t.status) && (
                    <button onClick={() => onDelete(t._id)}
                      className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════ 2. 创建赛事 ══════════════════ */
function CreateTournament({ onCreated }: { onCreated: (t: any) => void }) {
  const [form, setForm] = useState({
    name: '', format: 'stroke', startDate: '', endDate: '',
    holes: 18, courseId: '', courseName: '', maxPlayers: 72,
    entryFee: 0, description: '', registrationDeadline: '',
    memberOnly: false, handicapMin: '', handicapMax: '',
    contactName: '', contactPhone: '',
    groupSize: 4, startType: 'tee_times',
  })
  const [courses, setCourses] = useState<any[]>([])
  const [awards, setAwards] = useState([
    { position: 1, title: '总杆冠军', points: 100 },
    { position: 2, title: '总杆亚军', points: 70 },
    { position: 3, title: '总杆季军', points: 50 },
    { position: 4, title: '净杆冠军', points: 80 },
    { position: 5, title: '最近洞奖', points: 30 },
    { position: 6, title: '最远开球奖', points: 30 },
  ])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.resources.courses.getList().then((r: any) => setCourses(r.data?.data ?? [])).catch(() => {})
  }, [])

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name) return toast.error('请填写赛事名称')
    if (!form.startDate) return toast.error('请选择开始日期')
    setSubmitting(true)
    try {
      const res: any = await api.tournaments.create({
        ...form,
        holes: Number(form.holes),
        maxPlayers: Number(form.maxPlayers),
        entryFee: Number(form.entryFee),
        handicapMin: form.handicapMin ? Number(form.handicapMin) : null,
        handicapMax: form.handicapMax ? Number(form.handicapMax) : null,
        awards,
        rules: { groupSize: Number(form.groupSize), startType: form.startType },
      })
      onCreated(res.data)
    } catch (e: any) { toast.error(e.message) }
    finally { setSubmitting(false) }
  }

  const inputCls = 'w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Trophy size={20} className="text-emerald-600" />创建新赛事</h2>

        {/* 基本信息 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><label className={labelCls}>赛事名称 *</label>
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="如：2026年春季会员杯" /></div>
          <div><label className={labelCls}>赛制 *</label>
            <select className={inputCls} value={form.format} onChange={e => set('format', e.target.value)}>
              {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className={labelCls}>比赛洞数</label>
            <select className={inputCls} value={form.holes} onChange={e => set('holes', e.target.value)}>
              <option value={18}>18洞（1轮）</option>
              <option value={36}>36洞（2轮）</option>
              <option value={54}>54洞（3轮）</option>
              <option value={72}>72洞（4轮）</option>
            </select></div>
          <div><label className={labelCls}>开始日期 *</label>
            <input type="date" className={inputCls} value={form.startDate} onChange={e => set('startDate', e.target.value)} /></div>
          <div><label className={labelCls}>结束日期</label>
            <input type="date" className={inputCls} value={form.endDate} onChange={e => set('endDate', e.target.value)} /></div>
          <div><label className={labelCls}>球场</label>
            <select className={inputCls} value={form.courseId} onChange={e => {
              set('courseId', e.target.value)
              const c = courses.find((c: any) => c._id === e.target.value)
              if (c) set('courseName', c.name)
            }}>
              <option value="">请选择</option>
              {courses.map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select></div>
          <div><label className={labelCls}>报名上限</label>
            <input type="number" className={inputCls} value={form.maxPlayers} onChange={e => set('maxPlayers', e.target.value)} /></div>
          <div><label className={labelCls}>报名费（¥）</label>
            <input type="number" className={inputCls} value={form.entryFee} onChange={e => set('entryFee', e.target.value)} /></div>
          <div><label className={labelCls}>报名截止日</label>
            <input type="date" className={inputCls} value={form.registrationDeadline} onChange={e => set('registrationDeadline', e.target.value)} /></div>
        </div>

        {/* 规则 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div><label className={labelCls}>每组人数</label>
            <select className={inputCls} value={form.groupSize} onChange={e => set('groupSize', e.target.value)}>
              <option value={2}>2人</option><option value={3}>3人</option><option value={4}>4人</option>
            </select></div>
          <div><label className={labelCls}>发球方式</label>
            <select className={inputCls} value={form.startType} onChange={e => set('startType', e.target.value)}>
              <option value="tee_times">依次发球</option><option value="shotgun">鸣枪同发</option>
            </select></div>
          <div><label className={labelCls}>差点下限</label>
            <input type="number" className={inputCls} value={form.handicapMin} onChange={e => set('handicapMin', e.target.value)} placeholder="无限制" /></div>
          <div><label className={labelCls}>差点上限</label>
            <input type="number" className={inputCls} value={form.handicapMax} onChange={e => set('handicapMax', e.target.value)} placeholder="无限制" /></div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="memberOnly" checked={form.memberOnly} onChange={e => set('memberOnly', e.target.checked)} className="rounded" />
          <label htmlFor="memberOnly" className="text-sm text-gray-600">仅限会员报名</label>
        </div>

        {/* 联系人 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className={labelCls}>联系人</label>
            <input className={inputCls} value={form.contactName} onChange={e => set('contactName', e.target.value)} /></div>
          <div><label className={labelCls}>联系电话</label>
            <input className={inputCls} value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></div>
        </div>

        {/* 描述 */}
        <div><label className={labelCls}>赛事描述</label>
          <textarea className={inputCls + ' h-24'} value={form.description} onChange={e => set('description', e.target.value)} placeholder="赛事简介、注意事项等" /></div>

        {/* 奖项 */}
        <div>
          <label className={labelCls}>奖项设置</label>
          <div className="space-y-2 mt-1">
            {awards.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="w-12 px-2 py-1 border rounded text-xs text-center" type="number"
                  value={a.position} onChange={e => {
                    const na = [...awards]; na[i] = { ...na[i], position: Number(e.target.value) }; setAwards(na)
                  }} />
                <input className="flex-1 px-2 py-1 border rounded text-sm" value={a.title}
                  onChange={e => { const na = [...awards]; na[i] = { ...na[i], title: e.target.value }; setAwards(na) }}
                  placeholder="奖项名称" />
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Star size={12} />
                  <input className="w-16 px-2 py-1 border rounded text-xs" type="number" value={a.points}
                    onChange={e => { const na = [...awards]; na[i] = { ...na[i], points: Number(e.target.value) }; setAwards(na) }}
                    placeholder="积分" />
                </div>
                <button onClick={() => setAwards(awards.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500">
                  <X size={14} /></button>
              </div>
            ))}
            <button onClick={() => setAwards([...awards, { position: awards.length + 1, title: '', points: 0 }])}
              className="text-xs text-emerald-600 hover:underline">+ 添加奖项</button>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={submitting}
          className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50">
          {submitting ? '创建中...' : '创建赛事'}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════ 3. 报名管理 ══════════════════ */
function RegistrationTab({ tournaments, selectedId, onSelectId, selectedTournament, onRefresh }: any) {
  const [regs, setRegs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ playerName: '', phoneNumber: '', handicap: '24', identityCode: 'walkin', isGuest: false, note: '' })

  const loadRegs = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const res: any = await api.tournaments.getRegistrations(selectedId)
      setRegs(res.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [selectedId])

  useEffect(() => { loadRegs() }, [loadRegs])

  const handleRegister = async () => {
    if (!form.playerName) return toast.error('请填写球员姓名')
    try {
      await api.tournaments.register(selectedId, {
        ...form,
        handicap: Number(form.handicap),
      })
      toast.success('报名成功')
      setShowAdd(false)
      setForm({ playerName: '', phoneNumber: '', handicap: '24', identityCode: 'walkin', isGuest: false, note: '' })
      loadRegs()
      onRefresh?.()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleCancel = async (regId: string) => {
    if (!confirm('确认取消该球员报名？')) return
    try {
      await api.tournaments.cancelReg(selectedId, regId)
      toast.success('已取消')
      loadRegs()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      {/* 赛事选择器 */}
      <TournamentSelector tournaments={tournaments} selectedId={selectedId} onSelect={onSelectId} />

      {selectedId ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">
              报名列表
              <span className="ml-2 text-sm font-normal text-gray-400">
                {regs.filter(r => r.status === 'confirmed').length} 人已确认
                {regs.filter(r => r.status === 'waitlisted').length > 0 && ` / ${regs.filter(r => r.status === 'waitlisted').length} 人候补`}
              </span>
            </h3>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
              <UserPlus size={14} />新增报名
            </button>
          </div>

          {/* 报名列表 */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">姓名</th>
                  <th className="px-4 py-2 text-left">电话</th>
                  <th className="px-4 py-2 text-center">差点</th>
                  <th className="px-4 py-2 text-center">身份</th>
                  <th className="px-4 py-2 text-center">分组</th>
                  <th className="px-4 py-2 text-center">状态</th>
                  <th className="px-4 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">加载中...</td></tr>
                ) : regs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">暂无报名</td></tr>
                ) : regs.map((r: any, i: number) => (
                  <tr key={r._id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{r.playerName}</td>
                    <td className="px-4 py-2 text-gray-500">{r.phoneNumber || '-'}</td>
                    <td className="px-4 py-2 text-center">{r.handicap}</td>
                    <td className="px-4 py-2 text-center text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${r.isGuest ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                        {r.isGuest ? '嘉宾' : (r.identityCode?.startsWith('member') ? '会员' : '散客')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-gray-400">{r.groupNo ? `第${r.groupNo}组` : '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        r.status === 'waitlisted' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>{r.status === 'confirmed' ? '已确认' : r.status === 'waitlisted' ? '候补' : r.status === 'cancelled' ? '已取消' : r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {r.status !== 'cancelled' && (
                        <button onClick={() => handleCancel(r._id)} className="text-xs text-red-500 hover:underline">取消</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 新增报名弹窗 */}
          {showAdd && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-gray-800 mb-4">新增报名</h3>
                <div className="space-y-3">
                  <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="球员姓名 *"
                    value={form.playerName} onChange={e => setForm(p => ({ ...p, playerName: e.target.value }))} />
                  <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="电话号码"
                    value={form.phoneNumber} onChange={e => setForm(p => ({ ...p, phoneNumber: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="差点" type="number"
                      value={form.handicap} onChange={e => setForm(p => ({ ...p, handicap: e.target.value }))} />
                    <select className="w-full px-3 py-2 border rounded-lg text-sm"
                      value={form.identityCode} onChange={e => setForm(p => ({ ...p, identityCode: e.target.value }))}>
                      <option value="walkin">散客</option>
                      <option value="guest">嘉宾</option>
                      <option value="member_1">会员</option>
                    </select>
                  </div>
                  <textarea className="w-full px-3 py-2 border rounded-lg text-sm h-16" placeholder="备注"
                    value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border rounded-lg text-sm text-gray-600">取消</button>
                  <button onClick={handleRegister} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">确认报名</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20 text-gray-400">请先选择一个赛事</div>
      )}
    </div>
  )
}

/* ══════════════════ 4. 分组编排 ══════════════════ */
function GroupingTab({ tournaments, selectedId, onSelectId }: any) {
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadGroups = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const res: any = await api.tournaments.getGroups(selectedId)
      setGroups(res.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [selectedId])

  useEffect(() => { loadGroups() }, [loadGroups])

  const handleAutoGroup = async (method: string) => {
    try {
      const res: any = await api.tournaments.autoGroup(selectedId, { method, groupSize: 4 })
      toast.success(res.message || '分组完成')
      loadGroups()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      <TournamentSelector tournaments={tournaments} selectedId={selectedId} onSelect={onSelectId} />

      {selectedId ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">分组编排 <span className="text-sm font-normal text-gray-400">{groups.length} 组</span></h3>
            <div className="flex gap-2">
              <button onClick={() => handleAutoGroup('handicap')}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                <ArrowUpDown size={12} />按差点分组
              </button>
              <button onClick={() => handleAutoGroup('random')}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700">
                <Shuffle size={12} />随机分组
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20 text-gray-400">加载中...</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-20 text-gray-400">尚未分组，请点击上方按钮自动分组</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {groups.map((g: any) => (
                <div key={g._id} className="bg-white rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 flex items-center justify-center bg-emerald-100 text-emerald-700 font-bold rounded-full text-sm">
                        {g.groupNo}
                      </span>
                      <span className="text-sm font-medium text-gray-800">第{g.groupNo}组</span>
                    </div>
                    {g.teeTime && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock size={12} />{g.teeTime}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(g.players || []).map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                        <span className="w-5 h-5 flex items-center justify-center text-xs text-gray-400 bg-white rounded-full border">
                          {p.orderInGroup}
                        </span>
                        <span className="text-sm font-medium text-gray-800 flex-1">{p.playerName}</span>
                        <span className="text-xs text-gray-400">HCP {p.handicap}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20 text-gray-400">请先选择一个赛事</div>
      )}
    </div>
  )
}

/* ══════════════════ 5. 成绩录入 ══════════════════ */
function ScoringTab({ tournaments, selectedId, onSelectId }: any) {
  const [scores, setScores] = useState<any[]>([])
  const [regs, setRegs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ regId: '', playerName: '', handicap: 0, round: 1, grossScore: '' })

  const loadData = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const [sRes, rRes]: any = await Promise.all([
        api.tournaments.getScores(selectedId),
        api.tournaments.getRegistrations(selectedId, { status: 'confirmed' }),
      ])
      setScores(sRes.data || [])
      setRegs(rRes.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [selectedId])

  useEffect(() => { loadData() }, [loadData])

  const handleSubmit = async () => {
    if (!form.regId) return toast.error('请选择球员')
    if (!form.grossScore) return toast.error('请输入总杆')
    try {
      const reg = regs.find(r => r._id === form.regId)
      await api.tournaments.submitScore(selectedId, {
        regId: form.regId,
        playerId: reg?.playerId,
        playerName: reg?.playerName || form.playerName,
        handicap: Number(reg?.handicap || form.handicap),
        round: Number(form.round),
        grossScore: Number(form.grossScore),
      })
      toast.success('成绩已录入')
      setForm(p => ({ ...p, regId: '', grossScore: '' }))
      loadData()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      <TournamentSelector tournaments={tournaments} selectedId={selectedId} onSelect={onSelectId} />

      {selectedId ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 录入表单 */}
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="font-bold text-gray-800 text-sm">录入成绩</h3>
            <select className="w-full px-3 py-2 border rounded-lg text-sm"
              value={form.regId} onChange={e => {
                const r = regs.find(r => r._id === e.target.value)
                setForm(p => ({ ...p, regId: e.target.value, playerName: r?.playerName || '', handicap: r?.handicap || 0 }))
              }}>
              <option value="">选择球员</option>
              {regs.filter(r => r.status === 'confirmed').map(r => (
                <option key={r._id} value={r._id}>{r.playerName} (HCP {r.handicap})</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">轮次</label>
                <select className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={form.round} onChange={e => setForm(p => ({ ...p, round: Number(e.target.value) }))}>
                  <option value={1}>第1轮</option><option value={2}>第2轮</option>
                  <option value={3}>第3轮</option><option value={4}>第4轮</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">总杆</label>
                <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={form.grossScore} onChange={e => setForm(p => ({ ...p, grossScore: e.target.value }))}
                  placeholder="如 82" />
              </div>
            </div>
            <button onClick={handleSubmit} className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
              提交成绩
            </button>
          </div>

          {/* 已录入列表 */}
          <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-bold text-gray-800 text-sm">已录入成绩 ({scores.length})</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">球员</th>
                  <th className="px-4 py-2 text-center">差点</th>
                  <th className="px-4 py-2 text-center">轮次</th>
                  <th className="px-4 py-2 text-center">总杆</th>
                  <th className="px-4 py-2 text-center">净杆</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-400">加载中...</td></tr>
                ) : scores.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-400">暂无成绩</td></tr>
                ) : scores.map((s: any) => (
                  <tr key={s._id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{s.playerName}</td>
                    <td className="px-4 py-2 text-center text-gray-500">{s.handicap}</td>
                    <td className="px-4 py-2 text-center text-gray-500">R{s.round}</td>
                    <td className="px-4 py-2 text-center font-bold">{s.grossScore}</td>
                    <td className="px-4 py-2 text-center text-emerald-600 font-bold">{s.netScore ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 text-gray-400">请先选择一个赛事</div>
      )}
    </div>
  )
}

/* ══════════════════ 6. 排行榜 ══════════════════ */
function LeaderboardTab({ tournaments, selectedId, onSelectId, onFinalize }: any) {
  const [data, setData] = useState<any>(null)
  const [sortBy, setSortBy] = useState('net')
  const [loading, setLoading] = useState(false)

  const loadLB = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const res: any = await api.tournaments.getLeaderboard(selectedId, { sortBy })
      setData(res.data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [selectedId, sortBy])

  useEffect(() => { loadLB() }, [loadLB])

  const lb = data?.leaderboard || []
  const t = data?.tournament

  return (
    <div className="space-y-4">
      <TournamentSelector tournaments={tournaments} selectedId={selectedId} onSelect={onSelectId} />

      {selectedId && data ? (
        <>
          {/* 赛事信息 + 操作 */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-800 text-lg">{t?.name}</h3>
              <p className="text-xs text-gray-400">{FORMATS[t?.format] || t?.format} | {t?.totalHoles}洞 | {lb.length}位参赛</p>
            </div>
            <div className="flex items-center gap-2">
              <select className="px-3 py-1.5 border rounded-lg text-xs"
                value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="net">按净杆排名</option>
                <option value="gross">按总杆排名</option>
                <option value="stableford">按斯特布福德排名</option>
              </select>
              {t?.status === 'scoring' && (
                <button onClick={() => onFinalize(selectedId)}
                  className="flex items-center gap-1 px-4 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">
                  <Award size={14} />确认成绩 & 颁奖
                </button>
              )}
            </div>
          </div>

          {/* 排行榜 */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-center w-16">名次</th>
                  <th className="px-4 py-3 text-left">球员</th>
                  <th className="px-4 py-3 text-center">差点</th>
                  <th className="px-4 py-3 text-center">轮数</th>
                  <th className="px-4 py-3 text-center">总杆</th>
                  <th className="px-4 py-3 text-center">净杆</th>
                  {t?.format === 'stableford' && <th className="px-4 py-3 text-center">积分</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">加载中...</td></tr>
                ) : lb.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">暂无成绩</td></tr>
                ) : lb.map((p: any, i: number) => (
                  <tr key={i} className={`border-t hover:bg-gray-50 ${p.rank <= 3 ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      {p.rank === 1 ? <span className="inline-flex items-center justify-center w-7 h-7 bg-amber-400 text-white rounded-full font-bold text-xs">1</span> :
                       p.rank === 2 ? <span className="inline-flex items-center justify-center w-7 h-7 bg-gray-300 text-white rounded-full font-bold text-xs">2</span> :
                       p.rank === 3 ? <span className="inline-flex items-center justify-center w-7 h-7 bg-amber-700 text-white rounded-full font-bold text-xs">3</span> :
                       <span className="text-gray-500 font-medium">{p.rankDisplay}</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{p.playerName}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{p.handicap}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{p.roundCount}</td>
                    <td className="px-4 py-3 text-center font-bold">{p.totalGross}</td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-600">{p.totalNet}</td>
                    {t?.format === 'stableford' && <td className="px-4 py-3 text-center font-bold text-amber-600">{p.totalStableford}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : selectedId ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : (
        <div className="text-center py-20 text-gray-400">请先选择一个赛事</div>
      )}
    </div>
  )
}

/* ══════════════════ 通用：赛事选择器 ══════════════════ */
function TournamentSelector({ tournaments, selectedId, onSelect }: any) {
  return (
    <div className="flex items-center gap-2 bg-white rounded-xl border p-3">
      <Trophy size={16} className="text-emerald-600 shrink-0" />
      <select className="flex-1 px-2 py-1 text-sm border-none outline-none bg-transparent"
        value={selectedId || ''} onChange={e => onSelect(e.target.value || null)}>
        <option value="">选择赛事...</option>
        {tournaments.map((t: any) => {
          const st = STATUSES[t.status]
          return <option key={t._id} value={t._id}>[{st?.label}] {t.name} ({t.tournamentNo})</option>
        })}
      </select>
    </div>
  )
}
