import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, List } from 'lucide-react'
import TeeSheet from './TeeSheet'
import BookingForm from './BookingForm'

type ViewKey = 'teesheet' | 'list'

const VIEWS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'teesheet', label: '发球表', icon: <CalendarDays size={16} /> },
  { key: 'list',     label: '预订列表', icon: <List size={16} /> },
]

export default function Bookings() {
  const navigate = useNavigate()
  const [activeView, setActiveView]   = useState<ViewKey>('teesheet')
  const [formOpen, setFormOpen]       = useState(false)
  const [formDate, setFormDate]       = useState('')   // 从发球表点击新增时带入日期
  const [refreshKey, setRefreshKey]   = useState(0)   // 触发子组件刷新

  const handleNewBooking = (date: string) => {
    setFormDate(date)
    setFormOpen(true)
  }

  const handleFormSuccess = () => {
    setRefreshKey(k => k + 1)
  }

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-6 h-[60px] flex items-center gap-4 shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="h-4 w-px bg-secondary" />
        <h1 className="text-base font-semibold text-foreground">预订管理</h1>
      </header>

      <div className="flex-1 flex flex-col px-6 py-6 gap-4">
        {/* 视图切换 Tabs */}
        <div className="flex gap-1 bg-card rounded-xl p-1 shadow-sm border border-border w-fit">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeView === v.key
                  ? 'bg-success text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>

        {/* 内容区：撐满剩余高度 */}
        <div className="flex-1 bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8">
          {activeView === 'teesheet' && (
            <TeeSheet
              key={refreshKey}
              onNewBooking={handleNewBooking}
              onStatusChange={handleFormSuccess}
            />
          )}
          {activeView === 'list' && (
            <BookingList key={refreshKey} onNewBooking={handleNewBooking} />
          )}
        </div>
      </div>

      {/* 新建预订弹窗 */}
      {formOpen && (
        <BookingForm
          initialDate={formDate}
          onClose={() => setFormOpen(false)}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  )
}

// ─── 预订列表视图（完整版） ───────────────────────────────────────────────────

import { useEffect, useRef, useCallback as useCallbackReact } from 'react'
import { toast } from 'sonner'
import {
  Plus, Search, ChevronLeft, ChevronRight, Check,
  UserCheck, Ban, DollarSign, Clock, Users as UsersIcon
} from 'lucide-react'
import { api } from '@/utils/api'

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:    { label: '待确认', color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',   dot: 'bg-amber-400' },
  confirmed:  { label: '已确认', color: 'text-success', bg: 'bg-success/10 border-success/20', dot: 'bg-success' },
  checked_in: { label: '已签到', color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      dot: 'bg-blue-400' },
  completed:  { label: '已完赛', color: 'text-muted-foreground',    bg: 'bg-secondary/50 border-border',      dot: 'bg-muted' },
  cancelled:  { label: '已取消', color: 'text-red-400',     bg: 'bg-red-50 border-red-200',        dot: 'bg-red-300' },
}

const STATUS_TABS = [
  { value: '', label: '全部', icon: UsersIcon },
  { value: 'pending', label: '待确认', icon: Clock },
  { value: 'confirmed', label: '已确认', icon: Check },
  { value: 'checked_in', label: '已签到', icon: UserCheck },
  { value: 'completed', label: '已完赛', icon: Check },
  { value: 'cancelled', label: '已取消', icon: Ban },
]

function fmtDate(d: string) {
  const dt = new Date(d)
  const w = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()]
  return `${d}  周${w}`
}

function shiftDate(d: string, offset: number) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + offset)
  return dt.toISOString().slice(0, 10)
}

function BookingList({ onNewBooking }: { onNewBooking: (date: string) => void }) {
  const today = new Date().toISOString().slice(0, 10)

  const [list, setList]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [date, setDate]           = useState(today)
  const [status, setStatus]       = useState('')
  const [keyword, setKeyword]     = useState('')
  const [searchText, setSearchText] = useState('')
  const [detailId, setDetailId]   = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallbackReact(() => {
    setLoading(true)
    const params: Record<string, string> = { date, pageSize: '100' }
    if (status) params.status = status
    if (keyword) params.keyword = keyword
    api.bookings.getList(params).then((res: any) => {
      let items = res.data || []
      if (keyword) {
        const kw = keyword.toLowerCase()
        items = items.filter((b: any) =>
          b.orderNo?.toLowerCase().includes(kw) ||
          b.players?.some((p: any) => p.name?.toLowerCase().includes(kw) || p.phone?.includes(kw))
        )
      }
      setList(items)
    }).catch(() => toast.error('加载预订列表失败'))
      .finally(() => setLoading(false))
  }, [date, status, keyword])

  useEffect(() => { load() }, [load])

  const handleSearch = (v: string) => {
    setSearchText(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setKeyword(v.trim()), 400)
  }

  const statusCounts = list.reduce((acc: Record<string, number>, b: any) => {
    acc[b.status] = (acc[b.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const totalPlayers = list.reduce((s: number, b: any) => s + (b.players?.length || b.playerCount || 0), 0)

  const filteredList = status ? list.filter(b => b.status === status) : list
  const grouped: Record<string, any[]> = {}
  filteredList.forEach(b => {
    const t = b.teeTime || '未定'
    if (!grouped[t]) grouped[t] = []
    grouped[t].push(b)
  })
  const timeSlots = Object.keys(grouped).sort()

  const handleAction = async (id: string, action: string) => {
    try {
      if (action === 'confirm') await api.bookings.confirm(id)
      else if (action === 'cancel') await api.bookings.cancel(id, '')
      toast.success(action === 'confirm' ? '已确认' : '已取消')
      load()
    } catch { toast.error('操作失败') }
  }

  return (
    <div className="space-y-4">
      {/* ── 顶部：日期 + 搜索 + 新增 ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1 border border-border">
          <button onClick={() => setDate(d => shiftDate(d, -1))} className="p-1.5 rounded-lg hover:bg-card transition-colors">
            <ChevronLeft size={16} className="text-muted-foreground" />
          </button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-transparent text-sm font-medium text-foreground px-2 py-1 w-[140px] outline-none" />
          <button onClick={() => setDate(d => shiftDate(d, 1))} className="p-1.5 rounded-lg hover:bg-card transition-colors">
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          {date !== today && (
            <button onClick={() => setDate(today)} className="text-xs text-success font-medium px-2 py-1 hover:bg-success/10 rounded-lg transition-colors">
              今天
            </button>
          )}
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchText} onChange={e => handleSearch(e.target.value)}
            placeholder="搜索球员/手机/订单号"
            className="w-full pl-9 pr-3 py-2 text-sm bg-secondary/50 border border-border rounded-xl outline-none focus:border-success focus:ring-1 focus:ring-ring/10 transition-all" />
        </div>

        <div className="ml-auto">
          <button onClick={() => onNewBooking(date)}
            className="flex items-center gap-1.5 px-4 py-2 bg-success text-primary-foreground text-sm font-medium rounded-xl hover:bg-success/90 transition-colors shadow-sm">
            <Plus size={15} /> 新增预订
          </button>
        </div>
      </div>

      {/* ── 日期标题 + 汇总 ── */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{fmtDate(date)}</div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground text-sm">{list.length}</strong> 组</span>
          <span><strong className="text-foreground text-sm">{totalPlayers}</strong> 人</span>
        </div>
      </div>

      {/* ── 状态统计条 ── */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(tab => {
          const cnt = tab.value === '' ? list.length : (statusCounts[tab.value] || 0)
          const active = status === tab.value
          return (
            <button key={tab.value} onClick={() => setStatus(tab.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                active
                  ? 'bg-success text-primary-foreground border-success shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:border-border hover:bg-secondary/50'
              }`}>
              <tab.icon size={13} />
              {tab.label}
              <span className={`ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                active ? 'bg-card/20 text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}>{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* ── 预订列表（按时段分组） ── */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">加载中...</div>
      ) : filteredList.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">⛳</div>
          <p className="text-sm">{keyword ? '未找到匹配的预订' : '当日暂无预订'}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {timeSlots.map(time => (
            <div key={time}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-base font-bold text-success">{time}</div>
                <div className="flex-1 h-px bg-secondary" />
                <div className="text-xs text-muted-foreground">{grouped[time].length} 组</div>
              </div>

              <div className="space-y-2">
                {grouped[time].map((b: any) => {
                  const sc = STATUS_CFG[b.status] || STATUS_CFG.pending
                  const pricing = b.pricing || {}
                  const totalFee = pricing.totalFee || b.totalFee || 0
                  const paidFee = pricing.paidFee || 0
                  const pending = totalFee - paidFee
                  const playerNames = b.players?.map((p: any) => p.name).filter(Boolean).join('、') || ''
                  const playerCount = b.players?.length || b.playerCount || 0
                  const res = b.assignedResources || {}

                  return (
                    <div key={b._id}
                      onClick={() => setDetailId(detailId === b._id ? null : b._id)}
                      className={`rounded-xl border px-4 py-3 cursor-pointer transition-all hover:shadow-sm ${
                        detailId === b._id ? 'border-success/30 bg-success/10/30 shadow-sm' : 'border-border bg-card hover:border-border'
                      }`}>
                      <div className="flex items-start justify-between gap-3">
                        {/* 左侧信息 */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">{b.orderNo || ''}</span>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                              {sc.label}
                            </span>
                            {b.source === 'miniapp' && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-600 border border-violet-200 rounded-full">小程序</span>
                            )}
                          </div>

                          <div className="mt-1.5 flex items-center gap-2 text-sm">
                            <span className="font-semibold text-foreground">{b.courseName || '未指定球场'}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">{playerCount}人</span>
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground truncate">
                            {playerNames || '暂无球员信息'}
                          </div>
                        </div>

                        {/* 右侧金额+操作 */}
                        <div className="flex-shrink-0 text-right space-y-1.5">
                          {totalFee > 0 && (
                            <div>
                              <div className="text-sm font-bold text-foreground">¥{totalFee.toLocaleString()}</div>
                              {pending > 0 ? (
                                <div className="text-[11px] text-amber-600 font-medium">待收 ¥{pending.toLocaleString()}</div>
                              ) : totalFee > 0 ? (
                                <div className="text-[11px] text-success font-medium">已付清</div>
                              ) : null}
                            </div>
                          )}
                          <div className="flex gap-1 justify-end">
                            {b.status === 'pending' && (
                              <button onClick={e => { e.stopPropagation(); handleAction(b._id, 'confirm') }}
                                className="text-[11px] px-2.5 py-1 bg-success text-primary-foreground rounded-lg hover:bg-success/90 transition-colors font-medium">
                                确认
                              </button>
                            )}
                            {(b.status === 'pending' || b.status === 'confirmed') && (
                              <button onClick={e => { e.stopPropagation(); handleAction(b._id, 'cancel') }}
                                className="text-[11px] px-2.5 py-1 bg-card text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium">
                                取消
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 展开详情 */}
                      {detailId === b._id && (
                        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          {b.caddyName && (
                            <div><span className="text-muted-foreground">球童</span><div className="font-medium text-foreground mt-0.5">{b.caddyName}</div></div>
                          )}
                          {(res.cartNo || b.cartNo) && (
                            <div><span className="text-muted-foreground">球车</span><div className="font-medium text-foreground mt-0.5">{res.cartNo || b.cartNo}</div></div>
                          )}
                          {res.lockers?.length > 0 && (
                            <div><span className="text-muted-foreground">更衣柜</span><div className="font-medium text-foreground mt-0.5">{res.lockers.map((l: any) => l.lockerNo).join(', ')}</div></div>
                          )}
                          {b.stayType && b.stayType !== 'day' && (
                            <div><span className="text-muted-foreground">住宿</span><div className="font-medium text-foreground mt-0.5">{b.stayType === 'overnight_1' ? '一晚' : b.stayType === 'overnight_2' ? '两晚' : b.stayType}</div></div>
                          )}
                          {b.note && (
                            <div className="col-span-2 sm:col-span-4"><span className="text-muted-foreground">备注</span><div className="font-medium text-foreground mt-0.5">{b.note}</div></div>
                          )}
                          {b.players?.length > 0 && (
                            <div className="col-span-2 sm:col-span-4">
                              <span className="text-muted-foreground">球员明细</span>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {b.players.map((p: any, i: number) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-secondary/50 rounded-lg border border-border">
                                    <span className="font-medium text-foreground">{p.name}</span>
                                    {p.memberLevelName && <span className="text-[10px] text-success bg-success/10 px-1 rounded">{p.memberLevelName}</span>}
                                    {p.phone && <span className="text-muted-foreground">{p.phone}</span>}
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
