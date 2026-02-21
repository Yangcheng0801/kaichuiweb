import { useState, useEffect, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  CalendarCheck, DollarSign, Users, Receipt, RefreshCw,
  Car, Armchair, BedDouble, Bike, CreditCard, Flag, TrendingUp, ArrowUpRight
} from 'lucide-react'
import { selectUserInfo, selectIsLoggedIn, fetchUserInfo } from '@/store/authSlice'
import type { AppDispatch } from '@/store'
import { api } from '@/utils/api'
import Layout from '@/components/Layout'
import { cn } from '@/lib/utils'

/* ========== 预订状态映射 ========== */
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: '待确认', color: 'text-warning' },
  confirmed:  { label: '已确认', color: 'text-info' },
  checked_in: { label: '已签到', color: 'text-success' },
  dispatched: { label: '已出发', color: 'text-primary' },
  front_9:    { label: '前9洞',  color: 'text-emerald-400' },
  turning:    { label: '转场中', color: 'text-amber-400' },
  back_9:     { label: '后9洞',  color: 'text-indigo-400' },
  returned:   { label: '已回场', color: 'text-foreground-muted' },
  completed:  { label: '已完赛', color: 'text-foreground-subtle' },
  settled:    { label: '已结账', color: 'text-success' },
  cancelled:  { label: '已取消', color: 'text-error' },
  no_show:    { label: '未到场', color: 'text-warning' },
}

/* ========== 类型 ========== */
interface DashboardData {
  kpi: {
    todayBookings: number
    todayPlayers: number
    todayCheckedIn: number
    todayCompleted: number
    todayPending: number
    todayRevenue: number
    todayPaid: number
    todayPendingFee: number
    onCourseCount: number
    onCoursePlayers: number
    notArrivedCount: number
    statusCounts: Record<string, number>
  }
  resources: {
    carts:    { total: number; available: number; inUse: number; maintenance: number }
    lockers:  { total: number; available: number; occupied: number; maintenance: number }
    rooms:    { total: number; available: number; occupied: number; cleaning: number; maintenance: number }
    caddies:  { total: number; available: number; busy: number; off: number }
    tempCards: { total: number; available: number; inUse: number }
  }
  folios?: {
    openCount: number
    openBalance: number
    todayCharges: number
    todayPayments: number
    todaySettledCount: number
  }
  recentBookings: {
    _id: string; orderNo: string; date: string; teeTime: string
    playerName: string; playerCount: number; courseName: string
    status: string; totalFee: number; createdAt: string
  }[]
}

/* ========== 组件 ========== */
export default function Home() {
  const dispatch = useDispatch<AppDispatch>()
  const userInfo = useSelector(selectUserInfo)
  const isLoggedIn = useSelector(selectIsLoggedIn)

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  // 拉取用户信息（首次进入）
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    if (isLoggedIn && !userInfo?.userId) {
      dispatch(fetchUserInfo())
    }
  }, [isLoggedIn, userInfo, dispatch])

  // 拉取仪表盘数据
  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await api.dashboard.getData()
      setData(res.data)
    } catch (e) {
      console.error('[v0] Dashboard fetch failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  const kpi = data?.kpi
  const res = data?.resources
  const recent = data?.recentBookings || []

  /* ---------- 资源使用率卡片 ---------- */
  const ResourceCard = ({ 
    label, 
    icon: Icon, 
    used, 
    total, 
    color 
  }: {
    label: string
    icon: any
    used: number
    total: number
    color: string
  }) => {
    const pct = total > 0 ? Math.round((used / total) * 100) : 0
    const available = total - used

    return (
      <div className="bg-background-card rounded-xl p-5 border border-border hover:border-border-subtle transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", `bg-${color}-500/10`)}>
              <Icon size={20} className={color} />
            </div>
            <span className="text-sm font-medium text-foreground">{label}</span>
          </div>
          <span className="text-xs text-foreground-subtle">
            {used}/{total}
          </span>
        </div>
        
        {/* 进度条 */}
        <div className="relative w-full h-2 bg-background-elevated rounded-full overflow-hidden mb-3">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              pct > 80 ? "bg-error" : pct > 50 ? "bg-warning" : "bg-success"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-muted">使用率 {pct}%</span>
          <span className="text-success font-medium">{available} 可用</span>
        </div>
      </div>
    )
  }

  /* ---------- 骨架屏 ---------- */
  const Skeleton = ({ className = '' }: { className?: string }) => (
    <div className={cn(
      "bg-background-card rounded-xl border border-border animate-shimmer",
      "bg-gradient-to-r from-background-card via-background-hover to-background-card bg-[length:1000px_100%]",
      className
    )} />
  )

  /* ========== 渲染 ========== */
  return (
    <Layout title="管理驾驶舱">
      <div className="p-4 sm:p-6 space-y-6">
        {/* 页面标题和刷新 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">管理驾驶舱</h1>
            <p className="text-sm text-foreground-muted mt-1">实时监控球场运营数据</p>
          </div>
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              "bg-background-card border border-border hover:border-primary hover:text-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">刷新数据</span>
          </button>
        </div>

        {/* ──── 核心 KPI 卡片 ──── */}
        {loading && !data ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* 今日预订 */}
            <div className="relative bg-gradient-to-br from-primary to-primary-hover rounded-xl p-6 text-primary-foreground overflow-hidden group hover:scale-[1.02] transition-transform">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-4xl font-bold tracking-tight">{kpi?.todayBookings ?? 0}</div>
                    <div className="text-primary-foreground/80 text-sm mt-1">今日预订</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/10">
                    <CalendarCheck size={24} />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-primary-foreground/70">
                  <span>{kpi?.todayPlayers ?? 0} 人</span>
                  <span>·</span>
                  <span>签到 {kpi?.todayCheckedIn ?? 0}</span>
                  <span>·</span>
                  <span>未到 {kpi?.notArrivedCount ?? 0}</span>
                </div>
              </div>
            </div>

            {/* 场上进行中 */}
            <div className="bg-background-card rounded-xl p-6 border border-border hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-4xl font-bold text-foreground tracking-tight">
                    {kpi?.onCourseCount ?? 0}
                    <span className="text-lg font-normal text-foreground-muted ml-1">组</span>
                  </div>
                  <div className="text-foreground-muted text-sm mt-1">场上进行中</div>
                </div>
                <div className="p-3 rounded-xl bg-primary/10">
                  <Flag size={24} className="text-primary" />
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground-subtle">
                <Users size={12} className="text-primary" />
                <span>{kpi?.onCoursePlayers ?? 0} 人在场</span>
                <span className="ml-auto text-success">完赛 {kpi?.todayCompleted ?? 0}</span>
              </div>
            </div>

            {/* 今日营收 */}
            <div className="bg-background-card rounded-xl p-6 border border-border hover:border-warning/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-4xl font-bold text-foreground tracking-tight">
                    <span className="text-lg font-normal text-foreground-muted mr-0.5">¥</span>
                    {((kpi?.todayRevenue ?? 0) / 1).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-foreground-muted text-sm mt-1">今日营收</div>
                </div>
                <div className="p-3 rounded-xl bg-warning/10">
                  <DollarSign size={24} className="text-warning" />
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-success">已收 ¥{(kpi?.todayPaid ?? 0).toLocaleString()}</span>
                {(kpi?.todayPendingFee ?? 0) > 0 && (
                  <span className="text-warning">待收 ¥{(kpi?.todayPendingFee ?? 0).toLocaleString()}</span>
                )}
              </div>
            </div>

            {/* 未结账单 */}
            <div className="bg-background-card rounded-xl p-6 border border-border hover:border-accent/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-4xl font-bold text-foreground tracking-tight">{data?.folios?.openCount ?? 0}</div>
                  <div className="text-foreground-muted text-sm mt-1">未结账单</div>
                </div>
                <div className="p-3 rounded-xl bg-accent/10">
                  <Receipt size={24} className="text-accent" />
                </div>
              </div>
              <div className="text-xs text-foreground-subtle">
                余额 ¥{(data?.folios?.openBalance ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* ──── 资源使用情况 ──── */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">资源使用情况</h2>
          {loading && !data ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-36" />)}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              <ResourceCard label="球车" icon={Car} used={res?.carts.inUse ?? 0} total={res?.carts.total ?? 0} color="text-amber-400" />
              <ResourceCard label="球童" icon={Users} used={res?.caddies.busy ?? 0} total={res?.caddies.total ?? 0} color="text-emerald-400" />
              <ResourceCard label="更衣柜" icon={Armchair} used={res?.lockers.occupied ?? 0} total={res?.lockers.total ?? 0} color="text-blue-400" />
              <ResourceCard label="客房" icon={BedDouble} used={res?.rooms.occupied ?? 0} total={res?.rooms.total ?? 0} color="text-purple-400" />
              <ResourceCard label="临时卡" icon={CreditCard} used={res?.tempCards.inUse ?? 0} total={res?.tempCards.total ?? 0} color="text-pink-400" />
            </div>
          )}
        </div>

        {/* ──── 近期预订 ──── */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">近期预订</h2>
          {loading && !data ? (
            <Skeleton className="h-96" />
          ) : recent.length === 0 ? (
            <div className="bg-background-card rounded-xl p-12 border border-border text-center">
              <CalendarCheck size={48} className="mx-auto text-foreground-subtle mb-3" />
              <p className="text-foreground-muted">暂无预订记录</p>
            </div>
          ) : (
            <div className="bg-background-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-medium text-foreground-muted uppercase tracking-wider px-6 py-4">订单号</th>
                      <th className="text-left text-xs font-medium text-foreground-muted uppercase tracking-wider px-6 py-4">日期时间</th>
                      <th className="text-left text-xs font-medium text-foreground-muted uppercase tracking-wider px-6 py-4">球员</th>
                      <th className="text-left text-xs font-medium text-foreground-muted uppercase tracking-wider px-6 py-4">场地</th>
                      <th className="text-left text-xs font-medium text-foreground-muted uppercase tracking-wider px-6 py-4">状态</th>
                      <th className="text-right text-xs font-medium text-foreground-muted uppercase tracking-wider px-6 py-4">金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recent.map((booking) => {
                      const status = STATUS_MAP[booking.status] || { label: booking.status, color: 'text-foreground-muted' }
                      return (
                        <tr key={booking._id} className="hover:bg-background-hover transition-colors">
                          <td className="px-6 py-4 text-sm font-mono text-foreground">{booking.orderNo}</td>
                          <td className="px-6 py-4 text-sm text-foreground-muted">
                            {booking.date} {booking.teeTime}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-foreground">{booking.playerName}</span>
                              <span className="text-foreground-subtle">({booking.playerCount}人)</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-foreground-muted">{booking.courseName}</td>
                          <td className="px-6 py-4">
                            <span className={cn("text-xs font-medium", status.color)}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-medium text-foreground">
                            ¥{booking.totalFee.toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
