import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, ChevronLeft, ChevronRight, RefreshCw,
  Users, UserCheck, PlayCircle, RotateCcw, Flag, CheckCircle2,
  Banknote, Clock, Search, Plus, Package, Columns3,
  ChevronDown, ChevronUp, Truck,
} from 'lucide-react'
import { api } from '@/utils/api'

// ─── 常量 ──────────────────────────────────────────────────────────────────────

type TabKey = 'queue' | 'onCourse' | 'returned' | 'bags' | 'timeline'

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: 'queue',    label: '待出发',   icon: Clock },
  { key: 'onCourse', label: '场上动态', icon: PlayCircle },
  { key: 'returned', label: '已回场',   icon: Flag },
  { key: 'bags',     label: '球包管理', icon: Package },
  { key: 'timeline', label: '时间轴',   icon: Columns3 },
]

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  checked_in: { label: '已签到',  color: 'text-blue-700 bg-blue-50 border-blue-200',     dot: 'bg-blue-400' },
  dispatched: { label: '已出发',  color: 'text-teal-700 bg-teal-50 border-teal-200',     dot: 'bg-teal-400' },
  front_9:    { label: '前9洞',   color: 'text-success bg-success/10 border-success/20', dot: 'bg-success' },
  turning:    { label: '转场中',  color: 'text-amber-700 bg-amber-50 border-amber-200',  dot: 'bg-amber-400' },
  back_9:     { label: '后9洞',   color: 'text-indigo-700 bg-indigo-50 border-indigo-200', dot: 'bg-indigo-400' },
  returned:   { label: '已回场',  color: 'text-muted-foreground bg-secondary/50 border-border',      dot: 'bg-muted' },
  completed:  { label: '已完赛',  color: 'text-muted-foreground bg-secondary/50 border-border',      dot: 'bg-secondary' },
  settled:    { label: '已结账',  color: 'text-green-600 bg-green-50 border-green-200',    dot: 'bg-green-400' },
}

const DASHBOARD_CARDS = [
  { key: 'totalBookings', label: '总预订', icon: Users,        bg: 'bg-slate-50',   text: 'text-slate-700' },
  { key: 'totalPlayers',  label: '总人数', icon: Users,          bg: 'bg-slate-50',   text: 'text-slate-600' },
  { key: 'notArrived',    label: '未到场', icon: Clock,         bg: 'bg-amber-50',   text: 'text-amber-600' },
  { key: 'checked_in',    label: '已签到', icon: UserCheck,     bg: 'bg-blue-50',    text: 'text-blue-600' },
  { key: 'onCourse',      label: '场上',   icon: PlayCircle,    bg: 'bg-success/10', text: 'text-success' },
  { key: 'returned',      label: '已回场', icon: RotateCcw,     bg: 'bg-secondary/50',    text: 'text-muted-foreground' },
  { key: 'completed',     label: '已完赛', icon: CheckCircle2,  bg: 'bg-secondary/50',    text: 'text-muted-foreground' },
  { key: 'settled',       label: '已结账', icon: Banknote,      bg: 'bg-green-50',   text: 'text-green-600' },
]

function fmtDate(d: string) {
  const dt = new Date(d)
  const w = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()]
  return `${d}  周${w}`
}
function shiftDate(d: string, offset: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + offset)
  return dt.toISOString().slice(0, 10)
}

// ─── 主组件 ────────────────────────────────────────────────────────────────────

export default function StarterStation() {
  const navigate = useNavigate()
  const todayStr = new Date().toISOString().slice(0, 10)

  const [date, setDate]       = useState(todayStr)
  const [tab, setTab]         = useState<TabKey>('queue')
  const [dashboard, setDash]  = useState<any>(null)
  const [resStats, setResStats] = useState<any>(null)
  const [refreshKey, setRK]   = useState(0)

  const refresh = useCallback(() => setRK(k => k + 1), [])

  useEffect(() => {
    api.starter.dashboard({ date }).then((r: any) => setDash(r.data))
      .catch(() => toast.error('看板数据加载失败'))
    api.dashboard.getData().then((r: any) => setResStats(r.data?.resources))
      .catch(() => {})
  }, [date, refreshKey])

  const dashVal = (key: string) => {
    if (!dashboard) return '–'
    if (key === 'totalBookings' || key === 'notArrived' || key === 'onCourse' || key === 'totalPlayers') return dashboard[key] ?? 0
    return dashboard.counts?.[key] ?? 0
  }

  return (
    <div className="min-h-screen bg-secondary/50/80">
      {/* ── 顶栏 ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <button onClick={() => navigate('/home')} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <ArrowLeft size={20} className="text-muted-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">出发台管理</h1>
            <p className="text-xs text-muted-foreground">Starter Station</p>
          </div>

          {/* 日期选择 */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1 border border-border">
            <button onClick={() => setDate(d => shiftDate(d, -1))} className="p-1.5 rounded-lg hover:bg-white transition-colors">
              <ChevronLeft size={16} className="text-muted-foreground" />
            </button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="bg-transparent text-sm font-medium text-foreground px-1 py-1 w-[130px] outline-none" />
            <button onClick={() => setDate(d => shiftDate(d, 1))} className="p-1.5 rounded-lg hover:bg-white transition-colors">
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
            {date !== todayStr && (
              <button onClick={() => setDate(todayStr)} className="text-xs text-success font-medium px-2 hover:bg-success/10 rounded-lg transition-colors">今天</button>
            )}
          </div>

          <button onClick={refresh} className="p-2 rounded-xl hover:bg-secondary transition-colors" title="刷新">
            <RefreshCw size={18} className="text-muted-foreground" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* ── 日期 + 看板 ── */}
        <div className="text-sm text-muted-foreground mb-1">{fmtDate(date)}</div>

        <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {DASHBOARD_CARDS.map(c => (
            <div key={c.key} className={`${c.bg} rounded-xl p-3 border border-transparent`}>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <c.icon size={13} />
                {c.label}
              </div>
              <div className={`text-xl font-bold ${c.text}`}>{dashVal(c.key)}</div>
            </div>
          ))}
        </div>

        {/* ── 资源利用率 ── */}
        {resStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '球童', used: resStats.caddies?.busy ?? 0, total: resStats.caddies?.total ?? 0, color: 'bg-purple-400' },
              { label: '球车', used: resStats.carts?.inUse ?? 0, total: resStats.carts?.total ?? 0, color: 'bg-amber-400' },
              { label: '更衣柜', used: resStats.lockers?.occupied ?? 0, total: resStats.lockers?.total ?? 0, color: 'bg-blue-400' },
              { label: '客房', used: resStats.rooms?.occupied ?? 0, total: resStats.rooms?.total ?? 0, color: 'bg-success' },
            ].map(r => {
              const pct = r.total > 0 ? Math.round((r.used / r.total) * 100) : 0
              return (
                <div key={r.label} className="bg-white rounded-xl p-3 border border-border">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-medium text-foreground">{r.used}/{r.total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${r.color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 text-right">{pct}%</div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Tab 切换 ── */}
        <div className="flex gap-2 border-b border-border pb-px overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-success text-success'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab 内容 ── */}
        {tab === 'queue'    && <QueuePanel date={date} refreshKey={refreshKey} onRefresh={refresh} />}
        {tab === 'onCourse' && <OnCoursePanel date={date} refreshKey={refreshKey} onRefresh={refresh} />}
        {tab === 'returned' && <ReturnedPanel date={date} refreshKey={refreshKey} onRefresh={refresh} />}
        {tab === 'bags'     && <BagsPanel refreshKey={refreshKey} onRefresh={refresh} />}
        {tab === 'timeline' && <TimelinePanel date={date} refreshKey={refreshKey} />}
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  待出发队列
// ═══════════════════════════════════════════════════════════════════════════════

function QueuePanel({ date, refreshKey, onRefresh }: { date: string; refreshKey: number; onRefresh: () => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandId, setExpandId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.starter.queue({ date }).then((r: any) => setList(r.data || []))
      .catch(() => toast.error('队列加载失败'))
      .finally(() => setLoading(false))
  }, [date, refreshKey])

  const [dispatchForm, setDispatchForm] = useState<any>(null)

  const openDispatch = (b: any) => {
    const des = b.caddyDesignation
    const isDesignated = des?.type === 'designated' && des?.caddyId
    setDispatchForm({
      bookingId: b._id,
      caddyId: isDesignated ? des.caddyId : (b.caddyId || ''),
      caddyName: isDesignated ? `${des.caddyNo || ''}号 ${des.caddyName || ''}` : (b.caddyName || ''),
      cartId: b.cartId || '',
      cartNo: b.cartNo || '',
      startHole: 1,
      isDesignated,
    })
  }

  const submitDispatch = async () => {
    if (!dispatchForm) return
    try {
      await api.starter.dispatch(dispatchForm.bookingId, {
        caddyId: dispatchForm.caddyId || undefined,
        caddyName: dispatchForm.caddyName || undefined,
        cartId: dispatchForm.cartId || undefined,
        cartNo: dispatchForm.cartNo || undefined,
        startHole: dispatchForm.startHole,
      })
      toast.success('出发调度成功')
      setDispatchForm(null)
      onRefresh()
    } catch { toast.error('调度失败') }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
  if (list.length === 0) return <div className="text-center py-16 text-muted-foreground"><div className="text-3xl mb-2">🏌️</div><p className="text-sm">暂无待出发预订</p></div>

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{list.length} 组待出发</div>

      {list.map(b => {
        const players = b.players || []
        const isExpanded = expandId === b._id
        return (
          <div key={b._id} className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-secondary/50/50 transition-colors"
              onClick={() => setExpandId(isExpanded ? null : b._id)}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="text-lg font-bold text-success w-14 text-center flex-shrink-0">{b.teeTime}</div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{b.courseName || '未指定'} · {players.length}人</div>
                  <div className="text-xs text-muted-foreground truncate">{players.map((p: any) => p.name).join('、')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {b.caddyDesignation?.type === 'designated' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">点</span>
                )}
                {b.orderNo && <span className="text-[11px] font-mono text-muted-foreground">{b.orderNo}</span>}
                <button onClick={e => { e.stopPropagation(); openDispatch(b) }}
                  className="px-3 py-1.5 bg-success text-white text-xs font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center gap-1">
                  <Truck size={13} /> 调度
                </button>
                {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
              </div>
            </div>

            {isExpanded && (
              <div className="px-4 pb-3 pt-1 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {b.caddyName && <div><span className="text-muted-foreground">预约球童</span><div className="font-medium text-foreground mt-0.5">{b.caddyName}</div></div>}
                {b.cartNo && <div><span className="text-muted-foreground">预约球车</span><div className="font-medium text-foreground mt-0.5">{b.cartNo}</div></div>}
                {b.note && <div className="col-span-2 sm:col-span-4"><span className="text-muted-foreground">备注</span><div className="font-medium text-foreground mt-0.5">{b.note}</div></div>}
                {players.length > 0 && (
                  <div className="col-span-2 sm:col-span-4">
                    <span className="text-muted-foreground">球员</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {players.map((p: any, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-secondary/50 rounded-lg border border-border">
                          <span className="font-medium text-foreground">{p.name}</span>
                          {p.memberLevelName && <span className="text-[10px] text-success bg-success/10 px-1 rounded">{p.memberLevelName}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* 调度弹窗 */}
      {dispatchForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setDispatchForm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-4">出发调度</h3>
            {dispatchForm.isDesignated && (
              <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <span className="font-medium">点号订单</span>：指定球童已预填，更换将取消点号费
              </div>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">球童</label>
                  <input value={dispatchForm.caddyName} onChange={e => setDispatchForm((f: any) => ({ ...f, caddyName: e.target.value }))}
                    className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:border-success ${dispatchForm.isDesignated ? 'border-amber-200 bg-amber-50/50' : 'border-border'}`}
                    placeholder={dispatchForm.isDesignated ? '点号球童' : '选填'} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">球车号</label>
                  <input value={dispatchForm.cartNo} onChange={e => setDispatchForm((f: any) => ({ ...f, cartNo: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-success" placeholder="选填" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">出发洞</label>
                <select value={dispatchForm.startHole} onChange={e => setDispatchForm((f: any) => ({ ...f, startHole: Number(e.target.value) }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-success">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(h => (
                    <option key={h} value={h}>第 {h} 洞</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDispatchForm(null)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-secondary/50 transition-colors">取消</button>
              <button onClick={submitDispatch} className="flex-1 px-4 py-2.5 text-sm font-medium bg-success text-white rounded-xl hover:bg-success/90 transition-colors">确认出发</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  场上动态
// ═══════════════════════════════════════════════════════════════════════════════

function OnCoursePanel({ date, refreshKey, onRefresh }: { date: string; refreshKey: number; onRefresh: () => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.starter.onCourse({ date }).then((r: any) => setList(r.data || []))
      .catch(() => toast.error('场上动态加载失败'))
      .finally(() => setLoading(false))
  }, [date, refreshKey])

  const handleProgress = async (id: string, status: string) => {
    try {
      if (status === 'returned') {
        await api.starter.return(id)
      } else {
        await api.starter.progress(id, { status })
      }
      toast.success(`状态已更新`)
      onRefresh()
    } catch { toast.error('操作失败') }
  }

  const nextActions = (status: string): { label: string; target: string; color: string }[] => {
    switch (status) {
      case 'dispatched': return [{ label: '开始前9洞', target: 'front_9', color: 'bg-success hover:bg-success/90 text-white' }]
      case 'front_9':    return [
        { label: '转场', target: 'turning', color: 'bg-amber-500 hover:bg-amber-600 text-white' },
        { label: '回场(9洞)', target: 'returned', color: 'bg-secondary/500 hover:bg-foreground text-white' },
      ]
      case 'turning':    return [{ label: '开始后9洞', target: 'back_9', color: 'bg-indigo-600 hover:bg-indigo-700 text-white' }]
      case 'back_9':     return [{ label: '回场', target: 'returned', color: 'bg-foreground hover:bg-foreground/90 text-white' }]
      default: return []
    }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
  if (list.length === 0) return <div className="text-center py-16 text-muted-foreground"><div className="text-3xl mb-2">⛳</div><p className="text-sm">当前场上无球员</p></div>

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{list.length} 组在场上</div>

      {list.map(b => {
        const sc = STATUS_LABELS[b.status] || STATUS_LABELS.dispatched
        const d = b.dispatch || {}
        const players = b.players || []
        const actions = nextActions(b.status)

        return (
          <div key={b._id} className="bg-white rounded-xl border border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-success">{b.teeTime}</span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${sc.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                    {sc.label}
                  </span>
                  {d.startHole && d.startHole !== 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-600 border border-violet-200 rounded-full">第{d.startHole}洞出发</span>
                  )}
                </div>
                <div className="mt-1 text-sm text-foreground">{b.courseName} · {players.length}人 · {players.map((p: any) => p.name).join('、')}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  {d.caddyName && <span>球童: {d.caddyName}</span>}
                  {d.cartNo && <span>球车: {d.cartNo}</span>}
                  {b.orderNo && <span className="font-mono">{b.orderNo}</span>}
                </div>
              </div>

              <div className="flex gap-1.5 flex-shrink-0">
                {actions.map(a => (
                  <button key={a.target} onClick={() => handleProgress(b._id, a.target)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${a.color}`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  已回场
// ═══════════════════════════════════════════════════════════════════════════════

function ReturnedPanel({ date, refreshKey, onRefresh }: { date: string; refreshKey: number; onRefresh: () => void }) {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.starter.returned({ date }).then((r: any) => setList(r.data || []))
      .catch(() => toast.error('已回场列表加载失败'))
      .finally(() => setLoading(false))
  }, [date, refreshKey])

  const handleAction = async (id: string, action: string) => {
    try {
      if (action === 'complete') await api.starter.complete(id)
      else if (action === 'settle') await api.starter.settle(id)
      toast.success(action === 'complete' ? '已标记完赛' : '已标记结账')
      onRefresh()
    } catch { toast.error('操作失败') }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
  if (list.length === 0) return <div className="text-center py-16 text-muted-foreground"><div className="text-3xl mb-2">🏠</div><p className="text-sm">暂无回场记录</p></div>

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{list.length} 组已回场/完赛/结账</div>

      {list.map(b => {
        const sc = STATUS_LABELS[b.status] || STATUS_LABELS.returned
        const players = b.players || []
        const pricing = b.pricing || {}
        const totalFee = pricing.totalFee || 0

        return (
          <div key={b._id} className="bg-white rounded-xl border border-border px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{b.teeTime}</span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${sc.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {sc.label}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{b.courseName} · {players.map((p: any) => p.name).join('、')}</div>
              {totalFee > 0 && <div className="mt-0.5 text-xs font-medium text-muted-foreground">¥{totalFee.toLocaleString()}</div>}
            </div>

            <div className="flex gap-1.5 flex-shrink-0">
              {b.status === 'returned' && (
                <button onClick={() => handleAction(b._id, 'complete')}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  完赛确认
                </button>
              )}
              {b.status === 'completed' && (
                <button onClick={() => handleAction(b._id, 'settle')}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                  结账
                </button>
              )}
              {b.status === 'settled' && (
                <span className="text-xs text-green-500 font-medium px-2">✓ 已结清</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  球包管理
// ═══════════════════════════════════════════════════════════════════════════════

const BAG_STATUS: Record<string, { label: string; color: string }> = {
  stored:   { label: '在库', color: 'text-success bg-success/10' },
  out:      { label: '已取出', color: 'text-amber-700 bg-amber-50' },
  returned: { label: '已归还', color: 'text-muted-foreground bg-secondary/50' },
}

function BagsPanel({ refreshKey, onRefresh }: { refreshKey: number; onRefresh: () => void }) {
  const [bags, setBags] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ playerName: '', bagNo: '', location: '', brand: '', note: '' })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.starter.bags.getList({ pageSize: 100, keyword: keyword || undefined }),
      api.starter.bags.getStats(),
    ]).then(([r1, r2]: any) => {
      setBags(r1.data || [])
      setStats(r2.data)
    }).catch(() => toast.error('球包数据加载失败'))
      .finally(() => setLoading(false))
  }, [keyword, refreshKey])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.playerName || !form.bagNo) return toast.error('请填写球员和球包编号')
    try {
      await api.starter.bags.create(form)
      toast.success('球包入库成功')
      setFormOpen(false)
      setForm({ playerName: '', bagNo: '', location: '', brand: '', note: '' })
      onRefresh()
    } catch { toast.error('入库失败') }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.starter.bags.update(id, { status: newStatus })
      toast.success('状态已更新')
      onRefresh()
    } catch { toast.error('操作失败') }
  }

  return (
    <div className="space-y-4">
      {/* 统计 + 操作栏 */}
      <div className="flex flex-wrap items-center gap-3">
        {stats && (
          <div className="flex gap-3 text-xs">
            <span className="px-2.5 py-1 bg-success/10 text-success rounded-lg font-medium">在库 {stats.stored}</span>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg font-medium">已取出 {stats.out}</span>
            <span className="px-2.5 py-1 bg-secondary/50 text-muted-foreground rounded-lg font-medium">已归还 {stats.returned}</span>
          </div>
        )}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)}
            placeholder="搜索球员/编号"
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary/50 border border-border rounded-lg outline-none focus:border-success" />
        </div>
        <button onClick={() => setFormOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-success text-white text-xs font-medium rounded-lg hover:bg-success/90 transition-colors ml-auto">
          <Plus size={14} /> 球包入库
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
      ) : bags.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><div className="text-3xl mb-2">🎒</div><p className="text-sm">暂无球包记录</p></div>
      ) : (
        <div className="space-y-2">
          {bags.map(b => {
            const bs = BAG_STATUS[b.status] || BAG_STATUS.stored
            return (
              <div key={b._id} className="bg-white rounded-xl border border-border px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{b.playerName}</span>
                    <span className="text-xs font-mono text-muted-foreground">#{b.bagNo}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${bs.color}`}>{bs.label}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {b.brand && `${b.brand} · `}
                    {b.location && `位置: ${b.location}`}
                    {b.checkInTime && ` · 入库: ${b.checkInTime.slice(0, 16).replace('T', ' ')}`}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {b.status === 'stored' && (
                    <button onClick={() => handleStatusChange(b._id, 'out')}
                      className="px-2.5 py-1 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors">取出</button>
                  )}
                  {b.status === 'out' && (
                    <button onClick={() => handleStatusChange(b._id, 'stored')}
                      className="px-2.5 py-1 text-xs font-medium bg-success text-white rounded-lg hover:bg-success/90 transition-colors">归还入库</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 入库弹窗 */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setFormOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-4">球包入库</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">球员姓名 *</label>
                  <input value={form.playerName} onChange={e => setForm(f => ({ ...f, playerName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-success" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">球包编号 *</label>
                  <input value={form.bagNo} onChange={e => setForm(f => ({ ...f, bagNo: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-success" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">存放位置</label>
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-success" placeholder="例: A-12" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">品牌</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-success" placeholder="选填" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">备注</label>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-success" placeholder="选填" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setFormOpen(false)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-secondary/50 transition-colors">取消</button>
              <button onClick={handleCreate} className="flex-1 px-4 py-2.5 text-sm font-medium bg-success text-white rounded-xl hover:bg-success/90 transition-colors">确认入库</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  时间轴 / 甘特图
// ═══════════════════════════════════════════════════════════════════════════════

function TimelinePanel({ date, refreshKey }: { date: string; refreshKey: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'caddy' | 'cart'>('caddy')

  useEffect(() => {
    setLoading(true)
    api.starter.timeline({ date }).then((r: any) => setData(r.data))
      .catch(() => toast.error('时间轴加载失败'))
      .finally(() => setLoading(false))
  }, [date, refreshKey])

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">加载中...</div>
  if (!data) return <div className="text-center py-16 text-muted-foreground"><p className="text-sm">无数据</p></div>

  const slots = viewMode === 'caddy' ? data.caddySlots : data.cartSlots
  const slotEntries = Object.entries(slots || {}) as [string, any[]][]

  const HOUR_START = 6
  const HOUR_END = 19
  const TOTAL_HOURS = HOUR_END - HOUR_START
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i)

  const timeToPercent = (isoStr: string) => {
    if (!isoStr) return null
    const tPart = isoStr.includes('T') ? isoStr.split('T')[1] : isoStr
    const [h, m] = tPart.split(':').map(Number)
    const minutes = (h - HOUR_START) * 60 + (m || 0)
    return Math.max(0, Math.min(100, (minutes / (TOTAL_HOURS * 60)) * 100))
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'dispatched': return 'bg-teal-400'
      case 'front_9': return 'bg-success/100'
      case 'turning': return 'bg-amber-400'
      case 'back_9': return 'bg-indigo-500'
      case 'returned': case 'completed': return 'bg-muted'
      case 'settled': return 'bg-green-400'
      default: return 'bg-secondary'
    }
  }

  return (
    <div className="space-y-4">
      {/* 视图切换 */}
      <div className="flex gap-2">
        <button onClick={() => setViewMode('caddy')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${viewMode === 'caddy' ? 'bg-success text-white border-success' : 'bg-white text-muted-foreground border-border hover:bg-secondary/50'}`}>
          球童视图
        </button>
        <button onClick={() => setViewMode('cart')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${viewMode === 'cart' ? 'bg-success text-white border-success' : 'bg-white text-muted-foreground border-border hover:bg-secondary/50'}`}>
          球车视图
        </button>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {[
          { label: '已出发', color: 'bg-teal-400' },
          { label: '前9洞', color: 'bg-success/100' },
          { label: '转场', color: 'bg-amber-400' },
          { label: '后9洞', color: 'bg-indigo-500' },
          { label: '回场/完赛', color: 'bg-muted' },
          { label: '已结账', color: 'bg-green-400' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1">
            <span className={`w-3 h-2 rounded-sm ${l.color}`} /> {l.label}
          </span>
        ))}
      </div>

      {slotEntries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          暂无{viewMode === 'caddy' ? '球童' : '球车'}调度数据
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* 时间刻度 */}
          <div className="flex border-b border-border">
            <div className="w-24 flex-shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground bg-secondary/50 border-r border-border">
              {viewMode === 'caddy' ? '球童' : '球车'}
            </div>
            <div className="flex-1 relative h-8">
              {hours.map(h => {
                const left = ((h - HOUR_START) / TOTAL_HOURS) * 100
                return (
                  <div key={h} className="absolute top-0 bottom-0 border-l border-border" style={{ left: `${left}%` }}>
                    <span className="text-[10px] text-muted-foreground ml-1">{String(h).padStart(2, '0')}:00</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 行 */}
          {slotEntries.map(([name, items]) => (
            <div key={name} className="flex border-b border-border/50 last:border-0 hover:bg-secondary/50/50">
              <div className="w-24 flex-shrink-0 px-3 py-2.5 text-xs font-medium text-foreground border-r border-border truncate">{name}</div>
              <div className="flex-1 relative h-10">
                {items.map((slot: any, i: number) => {
                  const startPct = timeToPercent(slot.startTime)
                  const endPct = slot.endTime ? timeToPercent(slot.endTime) : null
                  if (startPct === null) return null
                  const width = endPct !== null ? Math.max(endPct - startPct, 2) : 8
                  return (
                    <div key={i}
                      className={`absolute top-1.5 h-7 rounded ${statusColor(slot.status)} opacity-85 hover:opacity-100 transition-opacity cursor-default group`}
                      style={{ left: `${startPct}%`, width: `${width}%`, minWidth: '20px' }}
                      title={`${slot.players} · ${slot.teeTime} · ${STATUS_LABELS[slot.status]?.label || slot.status}`}>
                      <span className="text-[10px] text-white font-medium px-1 truncate block leading-7">
                        {slot.players || slot.orderNo}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
