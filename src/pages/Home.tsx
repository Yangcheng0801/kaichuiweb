import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  CalendarDays, Layers, Car, UserRound, Settings,
  UserCircle, ChevronDown, Menu, X,
  CalendarCheck, DollarSign, Clock, Users,
  BarChart3, RefreshCw, ArrowRight, TrendingUp,
  Armchair, BedDouble, CreditCard, Bike,
  Receipt, UtensilsCrossed, Moon, Crown, Trophy, Bell, Store, ClipboardCheck, Heart, Flag
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { selectUserInfo, selectIsLoggedIn, logout, fetchUserInfo } from '@/store/authSlice'
import type { AppDispatch } from '@/store'
import { api } from '@/utils/api'
import NotificationCenter from '@/components/NotificationCenter'
import { ThemeToggle } from '@/components/ThemeToggle'

/* ========== 侧边栏导航项 ========== */
const navItems = [
  { key: 'bookings',        label: '预订管理', path: '/bookings',        icon: CalendarDays, color: 'bg-secondary text-foreground' },
  { key: 'starter',         label: '出发台',   path: '/starter',         icon: Flag,         color: 'bg-secondary text-foreground' },
  { key: 'folios',          label: '账单管理', path: '/folios',          icon: Receipt,      color: 'bg-secondary text-foreground' },
  { key: 'resources',       label: '资源管理', path: '/resources',       icon: Layers,       color: 'bg-secondary text-foreground' },
  { key: 'dining',          label: '餐饮管理', path: '/dining',          icon: UtensilsCrossed, color: 'bg-secondary text-foreground' },
  { key: 'cart-management', label: '球车管理', path: '/cart-management', icon: Car,          color: 'bg-secondary text-foreground' },
  { key: 'players',         label: '球员管理', path: '/players',         icon: UserRound,    color: 'bg-secondary text-foreground' },
  { key: 'memberships',     label: '会籍管理', path: '/memberships',     icon: Crown,        color: 'bg-secondary text-foreground' },
  { key: 'tournaments',    label: '赛事管理', path: '/tournaments',    icon: Trophy,       color: 'bg-secondary text-foreground' },
  { key: 'notifications',  label: '通知中心', path: '/notifications',  icon: Bell,         color: 'bg-secondary text-foreground' },
  { key: 'inventory',      label: '库存/专卖店', path: '/inventory',      icon: Store,        color: 'bg-secondary text-foreground' },
  { key: 'crm',             label: '客户关系', path: '/crm',             icon: Heart,          color: 'bg-secondary text-foreground' },
  { key: 'staff',           label: '排班考勤', path: '/staff',           icon: ClipboardCheck, color: 'bg-secondary text-foreground' },
  { key: 'reports',         label: '报表分析', path: '/reports',         icon: BarChart3,    color: 'bg-secondary text-foreground' },
  { key: 'daily-close',     label: '日结/夜审', path: '/daily-close',     icon: Moon,         color: 'bg-secondary text-foreground' },
  { key: 'settings',        label: '系统设置', path: '/settings',        icon: Settings,     color: 'bg-secondary text-muted-foreground' },
]

/* ========== 预订状态中文映射 ========== */
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:    { label: '待确认', cls: 'bg-warning/10 text-warning border border-warning/20' },
  confirmed:  { label: '已确认', cls: 'bg-info/10 text-info border border-info/20' },
  checked_in: { label: '已签到', cls: 'bg-success/10 text-success border border-success/20' },
  dispatched: { label: '已出发', cls: 'bg-info/10 text-info border border-info/20' },
  front_9:    { label: '前9洞',  cls: 'bg-success/10 text-success border border-success/20' },
  turning:    { label: '转场中', cls: 'bg-warning/10 text-warning border border-warning/20' },
  back_9:     { label: '后9洞',  cls: 'bg-info/10 text-info border border-info/20' },
  returned:   { label: '已回场', cls: 'bg-secondary text-muted-foreground' },
  completed:  { label: '已完赛', cls: 'bg-secondary text-muted-foreground' },
  settled:    { label: '已结账', cls: 'bg-success/10 text-success border border-success/20' },
  cancelled:  { label: '已取消', cls: 'bg-destructive/10 text-destructive border border-destructive/20' },
  no_show:    { label: '未到场', cls: 'bg-warning/10 text-warning border border-warning/20' },
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
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const userInfo = useSelector(selectUserInfo)
  const isLoggedIn = useSelector(selectIsLoggedIn)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
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
      console.error('Dashboard fetch failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  const handleLogout = () => {
    dispatch(logout())
    toast.success('已退出登录')
    navigate('/login')
  }

  const closeDrawer = () => setDrawerOpen(false)
  const kpi = data?.kpi
  const res = data?.resources
  const recent = data?.recentBookings || []

  /* ---------- 侧边栏内容 ---------- */
  const sidebarContent = (
    <>
      <div className="h-[70px] flex items-center border-b border-border px-5">
        <div>
          <h3 className="m-0 text-lg font-semibold text-foreground tracking-wide">开锤后台</h3>
          <p className="m-0 text-[12px] text-muted-foreground">KAICHUI ADMIN</p>
        </div>
      </div>
      <nav className="flex-1 py-4 px-4 space-y-1">
        {/* 首页（当前页） */}
        <button
          onClick={() => {}}
          className="relative w-full flex items-center gap-3 px-4 py-3 text-sm text-left bg-secondary/50 text-foreground shadow-inner shadow-border font-semibold rounded-xl"
        >
          <span className="absolute left-2 top-1/2 h-7 w-1 rounded-full bg-foreground -translate-y-1/2" />
          <span className="flex items-center justify-center rounded-full bg-primary/10 text-primary p-1.5">
            <BarChart3 size={16} />
          </span>
          <span>管理驾驶舱</span>
        </button>
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => { navigate(item.path); closeDrawer() }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-all rounded-xl"
          >
            <span className={`flex items-center justify-center rounded-full p-1.5 ${item.color}`}>
              <item.icon size={16} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  )

  /* ---------- 资源使用率进度条 ---------- */
  const ResourceBar = ({ label, icon: Icon, used, total, color }: {
    label: string; icon: any; used: number; total: number; color: string
  }) => {
    const pct = total > 0 ? Math.round((used / total) * 100) : 0
    return (
      <div className="bg-card rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon size={18} className={color} />
            <span className="text-sm font-medium text-foreground">{label}</span>
          </div>
          <span className="text-xs text-muted-foreground">{used}/{total}</span>
        </div>
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-amber-400' : 'bg-success'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>使用率 {pct}%</span>
          <span className="text-success font-medium">{total - used} 可用</span>
        </div>
      </div>
    )
  }

  /* ---------- 骨架屏 ---------- */
  const Skeleton = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse bg-secondary rounded-2xl ${className}`} />
  )

  /* ========== 渲染 ========== */
  return (
    <div className="min-h-screen bg-page-bg flex">
      {/* 桌面侧边栏 */}
      <div
        className="hidden lg:block fixed left-0 top-0 z-20 h-full overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: sidebarOpen ? 230 : 8 }}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      >
        <div className="h-full w-[230px] flex flex-col bg-card rounded-r-2xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] border border-l-0 border-white/80">
          {sidebarContent}
        </div>
      </div>

      {/* 移动端抽屉 */}
      {drawerOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={closeDrawer} />
          <aside className="lg:hidden fixed left-0 top-0 z-40 h-full w-[260px] max-w-[85vw] bg-card rounded-r-2xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] flex flex-col animate-slide-in-left">
            <div className="h-[70px] flex items-center justify-between border-b border-border px-5">
              <h3 className="m-0 text-lg font-semibold text-foreground">开锤后台</h3>
              <button className="p-2 rounded-full hover:bg-secondary text-muted-foreground" onClick={closeDrawer}><X size={20} /></button>
            </div>
            <nav className="flex-1 py-4 px-4 space-y-1 overflow-auto">
              <button className="relative w-full flex items-center gap-3 px-4 py-3 text-sm text-left bg-secondary/50 text-foreground font-semibold rounded-xl">
                <span className="absolute left-2 top-1/2 h-7 w-1 rounded-full bg-foreground -translate-y-1/2" />
                <span className="flex items-center justify-center rounded-full bg-primary/10 text-primary p-1.5"><BarChart3 size={16} /></span>
                <span>管理驾驶舱</span>
              </button>
              {navItems.map(item => (
                <button key={item.key} onClick={() => { navigate(item.path); closeDrawer() }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-all rounded-xl">
                  <span className={`flex items-center justify-center rounded-full p-1.5 ${item.color}`}><item.icon size={16} /></span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>
        </>
      )}

      {/* 主内容区 */}
      <div className={`flex-1 flex flex-col min-w-0 transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ml-0 ${sidebarOpen ? 'lg:ml-[230px]' : 'lg:ml-[8px]'}`}>
        <div className="min-h-screen pt-0 pb-6 px-4 sm:px-5 lg:px-5">
          <div className="flex flex-col gap-6">
            <div className="flex-1 flex flex-col overflow-hidden rounded-[32px] bg-card shadow-[0_25px_80px_rgba(15,23,42,0.12)] border border-white/80">

              {/* 顶部导航 */}
              <header className="border-b border-border flex items-center justify-between px-6 py-4 sm:px-8 sm:h-[70px]">
                <div className="flex items-center gap-3">
                  <button className="lg:hidden p-2 rounded-full hover:bg-secondary text-muted-foreground" onClick={() => setDrawerOpen(true)}>
                    <Menu size={22} />
                  </button>
                  <nav className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span>首页</span>
                    <span className="mx-1">/</span>
                    <span className="text-foreground font-medium">管理驾驶舱</span>
                  </nav>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={fetchDashboard}
                    disabled={loading}
                    className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-muted-foreground transition-colors disabled:opacity-50"
                    title="刷新数据"
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                  <NotificationCenter recipientRole="admin" pollInterval={30000} />
                  <ThemeToggle />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 text-sm text-foreground hover:text-foreground cursor-pointer bg-secondary/50 px-3 py-2 rounded-full shadow-inner shadow-white/40">
                        <UserCircle size={18} />
                        <span>{userInfo?.nickname || userInfo?.openid || '用户'}</span>
                        <ChevronDown size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toast.info('个人信息功能开发中...')}>个人信息</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-red-500 focus:text-red-500">退出登录</DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>提示</AlertDialogTitle>
                            <AlertDialogDescription>确定要退出登录吗？</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={handleLogout}>确定</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </header>

              {/* 仪表盘主体 */}
              <main className="flex-1 overflow-auto p-6 sm:p-8 bg-gradient-to-b from-white to-secondary/50/30 space-y-6">

                {/* ──── 第一行：核心 KPI（4 大卡） ──── */}
                {loading && !data ? (
                  <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
                  </div>
                ) : (
                  <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    {/* 今日预订 */}
                    <div className="bg-gradient-to-br from-success to-success rounded-2xl p-5 text-white shadow-lg shadow-success/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold tracking-tight">{kpi?.todayBookings ?? 0}</div>
                          <div className="text-white/70 text-sm mt-1">今日预订</div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-card/20 flex items-center justify-center">
                          <CalendarDays size={24} />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-white/60 flex items-center gap-3">
                        <span>{kpi?.todayPlayers ?? 0} 人</span>
                        <span>·</span>
                        <span>未到 {kpi?.notArrivedCount ?? 0}</span>
                        <span>·</span>
                        <span>已签到 {kpi?.todayCheckedIn ?? 0}</span>
                      </div>
                    </div>

                    {/* 场上 */}
                    <div className="bg-card rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-foreground tracking-tight">{kpi?.onCourseCount ?? 0}<span className="text-lg font-normal text-muted-foreground ml-1">组</span></div>
                          <div className="text-muted-foreground text-sm mt-1">场上进行中</div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground">
                          <Flag size={24} />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                        <Users size={12} className="text-teal-500" />
                        <span>{kpi?.onCoursePlayers ?? 0} 人在场</span>
                        <span className="ml-2">完赛 {kpi?.todayCompleted ?? 0}</span>
                      </div>
                    </div>

                    {/* 今日营收 */}
                    <div className="bg-card rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-foreground tracking-tight">
                            <span className="text-lg font-normal text-muted-foreground mr-0.5">¥</span>
                            {((kpi?.todayRevenue ?? 0) / 1).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-muted-foreground text-sm mt-1">今日营收</div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground">
                          <DollarSign size={24} />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground flex items-center gap-3">
                        <span className="text-success">已收 ¥{(kpi?.todayPaid ?? 0).toLocaleString()}</span>
                        {(kpi?.todayPendingFee ?? 0) > 0 && (
                          <span className="text-amber-600">待收 ¥{(kpi?.todayPendingFee ?? 0).toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    {/* 未结账单 */}
                    <div className="bg-card rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-foreground tracking-tight">{data?.folios?.openCount ?? 0}</div>
                          <div className="text-muted-foreground text-sm mt-1">未结账单</div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground">
                          <Receipt size={24} />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground flex items-center gap-3">
                        {(data?.folios?.openBalance ?? 0) > 0 && (
                          <span className="text-orange-600">¥{(data?.folios?.openBalance ?? 0).toLocaleString()}</span>
                        )}
                        <button onClick={() => navigate('/folios')}
                          className="text-success hover:text-success/80 font-medium flex items-center gap-1 ml-auto">
                          查看 <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ──── 第二行：预订漏斗 + 资源概况 ──── */}
                <div className="grid gap-6 grid-cols-1 xl:grid-cols-5">
                  {/* 预订状态漏斗 */}
                  <div className="xl:col-span-2 bg-card rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-border p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <CalendarCheck size={16} className="text-muted-foreground" />
                      今日预订状态
                    </h3>
                    {(() => {
                      const sc = kpi?.statusCounts || {}
                      const funnelItems = [
                        { label: '待确认', count: sc.pending || 0, color: 'bg-warning' },
                        { label: '已确认', count: sc.confirmed || 0, color: 'bg-info' },
                        { label: '已签到', count: sc.checked_in || 0, color: 'bg-success' },
                        { label: '已出发', count: sc.dispatched || 0, color: 'bg-info' },
                        { label: '前9洞', count: sc.front_9 || 0, color: 'bg-success' },
                        { label: '转场中', count: sc.turning || 0, color: 'bg-warning' },
                        { label: '后9洞', count: sc.back_9 || 0, color: 'bg-info' },
                        { label: '已回场', count: sc.returned || 0, color: 'bg-muted' },
                        { label: '已完赛', count: sc.completed || 0, color: 'bg-secondary' },
                        { label: '已结账', count: sc.settled || 0, color: 'bg-green-400' },
                        { label: '已取消', count: sc.cancelled || 0, color: 'bg-red-300' },
                      ]
                      const maxCount = Math.max(...funnelItems.map(f => f.count), 1)
                      return (
                        <div className="space-y-2">
                          {funnelItems.map(f => (
                            <div key={f.label} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-12 text-right flex-shrink-0">{f.label}</span>
                              <div className="flex-1 h-5 bg-secondary/50 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${f.color} transition-all duration-700`}
                                  style={{ width: `${Math.max((f.count / maxCount) * 100, f.count > 0 ? 8 : 0)}%` }} />
                              </div>
                              <span className="text-xs font-bold text-foreground w-6 text-right">{f.count}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>

                  {/* 资源使用概况 */}
                  <div className="xl:col-span-3">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Layers size={16} className="text-muted-foreground" />
                      资源使用概况
                    </h3>
                    {loading && !data ? (
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                        {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
                      </div>
                    ) : (
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                        <ResourceBar label="球车" icon={Car}         used={res?.carts?.inUse ?? 0}     total={res?.carts?.total ?? 0}    color="text-amber-500" />
                        <ResourceBar label="球童" icon={Users}       used={res?.caddies?.busy ?? 0}    total={res?.caddies?.total ?? 0}  color="text-purple-500" />
                        <ResourceBar label="更衣柜" icon={Armchair}  used={res?.lockers?.occupied ?? 0} total={res?.lockers?.total ?? 0}  color="text-blue-500" />
                        <ResourceBar label="客房" icon={BedDouble}   used={res?.rooms?.occupied ?? 0}   total={res?.rooms?.total ?? 0}    color="text-success" />
                        <ResourceBar label="消费卡" icon={CreditCard} used={res?.tempCards?.inUse ?? 0}  total={res?.tempCards?.total ?? 0} color="text-rose-500" />
                      </div>
                    )}
                  </div>
                </div>

                {/* ──── 第三行：近期预订 + 快捷入口 ──── */}
                <div className="grid gap-6 grid-cols-1 xl:grid-cols-3">
                  {/* 近期预订列表 */}
                  <div className="xl:col-span-2 bg-card rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">近期预订动态</h4>
                      <button onClick={() => navigate('/bookings')} className="text-xs text-success hover:text-success/80 font-medium flex items-center gap-1">
                        查看全部 <ArrowRight size={12} />
                      </button>
                    </div>
                    {loading && !data ? (
                      <div className="p-6 space-y-3">
                        {[1,2,3,4].map(i => <Skeleton key={i} className="h-12" />)}
                      </div>
                    ) : recent.length === 0 ? (
                      <div className="p-12 text-center text-muted-foreground text-sm">暂无预订数据</div>
                    ) : (
                      <div className="divide-y divide-border/50">
                        {recent.map(b => {
                          const st = STATUS_MAP[b.status] || { label: b.status, cls: 'bg-secondary text-muted-foreground' }
                          return (
                            <div key={b._id} className="px-6 py-3.5 flex items-center gap-4 hover:bg-secondary/50/50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground truncate">{b.playerName || '未知球员'}</span>
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                  <span>{b.date}</span>
                                  <span>{b.teeTime}</span>
                                  {b.courseName && <span>· {b.courseName}</span>}
                                  {b.orderNo && <span className="text-muted-foreground">#{b.orderNo}</span>}
                                </div>
                              </div>
                              {b.totalFee > 0 && (
                                <span className="text-sm font-medium text-foreground whitespace-nowrap">¥{b.totalFee.toLocaleString()}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* 快捷入口 */}
                  <div className="bg-card rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-border p-6">
                    <h4 className="text-sm font-semibold text-foreground mb-4">快捷操作</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {navItems.slice(0, 9).map(item => (
                        <button key={item.key} onClick={() => navigate(item.path)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-secondary/50 transition-colors group">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}>
                            <item.icon size={18} />
                          </div>
                          <span className="text-[11px] text-muted-foreground font-medium">{item.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Folio 速览 */}
                    <div className="mt-5 pt-4 border-t border-border">
                      <h5 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">账务速览</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>开放 Folio</span>
                          <span className="font-medium text-foreground">{data?.folios?.openCount ?? 0} 张</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>未结余额</span>
                          <span className="font-medium text-orange-600">¥{(data?.folios?.openBalance ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>今日应收</span>
                          <span className="font-medium text-foreground">¥{(kpi?.todayRevenue ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>今日已收</span>
                          <span className="font-medium text-success">¥{(kpi?.todayPaid ?? 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
