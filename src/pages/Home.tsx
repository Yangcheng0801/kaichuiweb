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
  Receipt, UtensilsCrossed, Moon, Crown, Trophy, Bell, Store, ClipboardCheck
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

/* ========== 侧边栏导航项 ========== */
const navItems = [
  { key: 'bookings',        label: '预订管理', path: '/bookings',        icon: CalendarDays, color: 'bg-emerald-50 text-emerald-600' },
  { key: 'folios',          label: '账单管理', path: '/folios',          icon: Receipt,      color: 'bg-orange-50 text-orange-600' },
  { key: 'resources',       label: '资源管理', path: '/resources',       icon: Layers,       color: 'bg-blue-50 text-blue-600' },
  { key: 'dining',          label: '餐饮管理', path: '/dining',          icon: UtensilsCrossed, color: 'bg-rose-50 text-rose-600' },
  { key: 'cart-management', label: '球车管理', path: '/cart-management', icon: Car,          color: 'bg-amber-50 text-amber-600' },
  { key: 'players',         label: '球员管理', path: '/players',         icon: UserRound,    color: 'bg-purple-50 text-purple-600' },
  { key: 'memberships',     label: '会籍管理', path: '/memberships',     icon: Crown,        color: 'bg-amber-50 text-amber-600' },
  { key: 'tournaments',    label: '赛事管理', path: '/tournaments',    icon: Trophy,       color: 'bg-yellow-50 text-yellow-600' },
  { key: 'notifications',  label: '通知中心', path: '/notifications',  icon: Bell,         color: 'bg-blue-50 text-blue-600' },
  { key: 'inventory',      label: '库存/专卖店', path: '/inventory',      icon: Store,        color: 'bg-orange-50 text-orange-600' },
  { key: 'staff',           label: '排班考勤', path: '/staff',           icon: ClipboardCheck, color: 'bg-violet-50 text-violet-600' },
  { key: 'reports',         label: '报表分析', path: '/reports',         icon: BarChart3,    color: 'bg-cyan-50 text-cyan-600' },
  { key: 'daily-close',     label: '日结/夜审', path: '/daily-close',     icon: Moon,         color: 'bg-indigo-50 text-indigo-600' },
  { key: 'settings',        label: '系统设置', path: '/settings',        icon: Settings,     color: 'bg-gray-100 text-gray-600' },
]

/* ========== 预订状态中文映射 ========== */
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:    { label: '待确认', cls: 'bg-yellow-100 text-yellow-700' },
  confirmed:  { label: '已确认', cls: 'bg-blue-100 text-blue-700' },
  checked_in: { label: '已签到', cls: 'bg-emerald-100 text-emerald-700' },
  playing:    { label: '打球中', cls: 'bg-green-100 text-green-700' },
  completed:  { label: '已完赛', cls: 'bg-gray-100 text-gray-600' },
  cancelled:  { label: '已取消', cls: 'bg-red-100 text-red-600' },
  no_show:    { label: '未到场', cls: 'bg-orange-100 text-orange-600' },
}

/* ========== 类型 ========== */
interface DashboardData {
  kpi: {
    todayBookings: number
    todayCheckedIn: number
    todayCompleted: number
    todayPending: number
    todayRevenue: number
    todayPaid: number
    todayPendingFee: number
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
    todaySettledCount: number
    todaySettledAmount: number
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
      <div className="h-[70px] flex items-center border-b border-gray-100 px-5">
        <div>
          <h3 className="m-0 text-lg font-semibold text-emerald-600 tracking-wide">开锤后台</h3>
          <p className="m-0 text-[12px] text-gray-400">KAICHUI ADMIN</p>
        </div>
      </div>
      <nav className="flex-1 py-4 px-4 space-y-1">
        {/* 首页（当前页） */}
        <button
          onClick={() => {}}
          className="relative w-full flex items-center gap-3 px-4 py-3 text-sm text-left bg-gray-50 text-gray-900 shadow-inner shadow-gray-100 font-semibold rounded-xl"
        >
          <span className="absolute left-2 top-1/2 h-7 w-1 rounded-full bg-emerald-500 -translate-y-1/2" />
          <span className="flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 p-1.5">
            <BarChart3 size={16} />
          </span>
          <span>管理驾驶舱</span>
        </button>
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => { navigate(item.path); closeDrawer() }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all rounded-xl"
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
      <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon size={18} className={color} />
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </div>
          <span className="text-xs text-gray-400">{used}/{total}</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-amber-400' : 'bg-emerald-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>使用率 {pct}%</span>
          <span className="text-emerald-600 font-medium">{total - used} 可用</span>
        </div>
      </div>
    )
  }

  /* ---------- 骨架屏 ---------- */
  const Skeleton = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse bg-gray-100 rounded-2xl ${className}`} />
  )

  /* ========== 渲染 ========== */
  return (
    <div className="min-h-screen bg-[#f4f7fb] flex">
      {/* 桌面侧边栏 */}
      <div
        className="hidden lg:block fixed left-0 top-0 z-20 h-full overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: sidebarOpen ? 230 : 8 }}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      >
        <div className="h-full w-[230px] flex flex-col bg-white rounded-r-2xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] border border-l-0 border-white/80">
          {sidebarContent}
        </div>
      </div>

      {/* 移动端抽屉 */}
      {drawerOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={closeDrawer} />
          <aside className="lg:hidden fixed left-0 top-0 z-40 h-full w-[260px] max-w-[85vw] bg-white rounded-r-2xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] flex flex-col animate-slide-in-left">
            <div className="h-[70px] flex items-center justify-between border-b border-gray-100 px-5">
              <h3 className="m-0 text-lg font-semibold text-emerald-600">开锤后台</h3>
              <button className="p-2 rounded-full hover:bg-gray-100 text-gray-500" onClick={closeDrawer}><X size={20} /></button>
            </div>
            <nav className="flex-1 py-4 px-4 space-y-1 overflow-auto">
              <button className="relative w-full flex items-center gap-3 px-4 py-3 text-sm text-left bg-gray-50 text-gray-900 font-semibold rounded-xl">
                <span className="absolute left-2 top-1/2 h-7 w-1 rounded-full bg-emerald-500 -translate-y-1/2" />
                <span className="flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 p-1.5"><BarChart3 size={16} /></span>
                <span>管理驾驶舱</span>
              </button>
              {navItems.map(item => (
                <button key={item.key} onClick={() => { navigate(item.path); closeDrawer() }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all rounded-xl">
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
            <div className="flex-1 flex flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_25px_80px_rgba(15,23,42,0.12)] border border-white/80">

              {/* 顶部导航 */}
              <header className="border-b border-gray-100 flex items-center justify-between px-6 py-4 sm:px-8 sm:h-[70px]">
                <div className="flex items-center gap-3">
                  <button className="lg:hidden p-2 rounded-full hover:bg-gray-100 text-gray-600" onClick={() => setDrawerOpen(true)}>
                    <Menu size={22} />
                  </button>
                  <nav className="flex items-center gap-1 text-sm text-gray-500">
                    <span>首页</span>
                    <span className="mx-1">/</span>
                    <span className="text-gray-900 font-medium">管理驾驶舱</span>
                  </nav>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={fetchDashboard}
                    disabled={loading}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                    title="刷新数据"
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                  <NotificationCenter recipientRole="admin" pollInterval={30000} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 cursor-pointer bg-gray-50 px-3 py-2 rounded-full shadow-inner shadow-white/40">
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
              <main className="flex-1 overflow-auto p-6 sm:p-8 bg-gradient-to-b from-white to-gray-50/30 space-y-6">

                {/* -------- 第一行：KPI 卡片 -------- */}
                {loading && !data ? (
                  <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
                  </div>
                ) : (
                  <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    {/* 今日预订 */}
                    <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold tracking-tight">{kpi?.todayBookings ?? 0}</div>
                          <div className="text-emerald-100 text-sm mt-1">今日预订</div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                          <CalendarDays size={24} />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-emerald-200 flex items-center gap-3">
                        <span>待处理 {kpi?.todayPending ?? 0}</span>
                        <span>·</span>
                        <span>已签到 {kpi?.todayCheckedIn ?? 0}</span>
                        <span>·</span>
                        <span>已完赛 {kpi?.todayCompleted ?? 0}</span>
                      </div>
                    </div>

                    {/* 已签到 */}
                    <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-gray-900 tracking-tight">{kpi?.todayCheckedIn ?? 0}</div>
                          <div className="text-gray-500 text-sm mt-1">今日签到</div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500">
                          <CalendarCheck size={24} />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-400 flex items-center gap-1">
                        <TrendingUp size={12} className="text-emerald-500" />
                        <span>签到率 {(kpi?.todayBookings ?? 0) > 0 ? Math.round(((kpi?.todayCheckedIn ?? 0) + (kpi?.todayCompleted ?? 0)) / (kpi?.todayBookings ?? 1) * 100) : 0}%</span>
                      </div>
                    </div>

                    {/* 今日营收 */}
                    <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-gray-900 tracking-tight">
                            <span className="text-lg font-normal text-gray-400 mr-0.5">¥</span>
                            {((kpi?.todayRevenue ?? 0) / 1).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-gray-500 text-sm mt-1">今日营收</div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
                          <DollarSign size={24} />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-400 flex items-center gap-3">
                        <span className="text-emerald-600">已收 ¥{(kpi?.todayPaid ?? 0).toLocaleString()}</span>
                        {(kpi?.todayPendingFee ?? 0) > 0 && (
                          <span className="text-amber-600">待收 ¥{(kpi?.todayPendingFee ?? 0).toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    {/* 未结算账单 */}
                    <div className="bg-white rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-gray-900 tracking-tight">{data?.folios?.openCount ?? kpi?.todayPending ?? 0}</div>
                          <div className="text-gray-500 text-sm mt-1">未结算账单</div>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500">
                          <Receipt size={24} />
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-400 flex items-center gap-3">
                        {(data?.folios?.openBalance ?? 0) > 0 && (
                          <span className="text-orange-600">待收 ¥{(data?.folios?.openBalance ?? 0).toLocaleString()}</span>
                        )}
                        <button
                          onClick={() => navigate('/folios')}
                          className="text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 ml-auto"
                        >
                          查看 <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* -------- 第二行：资源使用概况 -------- */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <Layers size={16} className="text-gray-400" />
                    资源使用概况
                  </h3>
                  {loading && !data ? (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
                      {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-28" />)}
                    </div>
                  ) : (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
                      <ResourceBar label="球车" icon={Car}         used={res?.carts?.inUse ?? 0}     total={res?.carts?.total ?? 0}    color="text-amber-500" />
                      <ResourceBar label="球童" icon={Users}       used={res?.caddies?.busy ?? 0}    total={res?.caddies?.total ?? 0}  color="text-purple-500" />
                      <ResourceBar label="更衣柜" icon={Armchair}  used={res?.lockers?.occupied ?? 0} total={res?.lockers?.total ?? 0}  color="text-blue-500" />
                      <ResourceBar label="客房" icon={BedDouble}   used={res?.rooms?.occupied ?? 0}   total={res?.rooms?.total ?? 0}    color="text-emerald-500" />
                      <ResourceBar label="消费卡" icon={CreditCard} used={res?.tempCards?.inUse ?? 0}  total={res?.tempCards?.total ?? 0} color="text-rose-500" />
                    </div>
                  )}
                </div>

                {/* -------- 第三行：近期预订 + 快捷入口 -------- */}
                <div className="grid gap-6 grid-cols-1 xl:grid-cols-3">
                  {/* 近期预订列表 */}
                  <div className="xl:col-span-2 bg-white rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-700">近期预订动态</h4>
                      <button onClick={() => navigate('/bookings')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                        查看全部 <ArrowRight size={12} />
                      </button>
                    </div>
                    {loading && !data ? (
                      <div className="p-6 space-y-3">
                        {[1,2,3,4].map(i => <Skeleton key={i} className="h-12" />)}
                      </div>
                    ) : recent.length === 0 ? (
                      <div className="p-12 text-center text-gray-400 text-sm">暂无预订数据</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {recent.map(b => {
                          const st = STATUS_MAP[b.status] || { label: b.status, cls: 'bg-gray-100 text-gray-600' }
                          return (
                            <div key={b._id} className="px-6 py-3.5 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 truncate">{b.playerName || '未知球员'}</span>
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                                  <span>{b.date}</span>
                                  <span>{b.teeTime}</span>
                                  {b.courseName && <span>· {b.courseName}</span>}
                                  {b.orderNo && <span className="text-gray-300">#{b.orderNo}</span>}
                                </div>
                              </div>
                              {b.totalFee > 0 && (
                                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">¥{b.totalFee.toLocaleString()}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* 快捷入口 */}
                  <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-gray-100 p-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4">快捷操作</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {navItems.map(item => (
                        <button
                          key={item.key}
                          onClick={() => navigate(item.path)}
                          className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-gray-50 transition-colors group"
                        >
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}>
                            <item.icon size={20} />
                          </div>
                          <span className="text-xs text-gray-600 font-medium">{item.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* 今日概要 */}
                    <div className="mt-6 pt-5 border-t border-gray-100">
                      <h5 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">今日概要</h5>
                      <div className="space-y-2.5 text-sm">
                        <div className="flex items-center justify-between text-gray-600">
                          <span>球车使用中</span>
                          <span className="font-medium text-gray-900">{res?.carts?.inUse ?? 0} / {res?.carts?.total ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600">
                          <span>球童工作中</span>
                          <span className="font-medium text-gray-900">{res?.caddies?.busy ?? 0} / {res?.caddies?.total ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600">
                          <span>更衣柜占用</span>
                          <span className="font-medium text-gray-900">{res?.lockers?.occupied ?? 0} / {res?.lockers?.total ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600">
                          <span>客房入住</span>
                          <span className="font-medium text-gray-900">{res?.rooms?.occupied ?? 0} / {res?.rooms?.total ?? 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-600">
                          <span>消费卡使用中</span>
                          <span className="font-medium text-gray-900">{res?.tempCards?.inUse ?? 0} / {res?.tempCards?.total ?? 0}</span>
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
