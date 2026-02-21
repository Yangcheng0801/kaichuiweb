import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  CalendarDays, Layers, Car, UserRound, Settings,
  UserCircle, ChevronDown, Menu, X, BarChart3,
  Receipt, UtensilsCrossed, Crown, Trophy, Moon,
  Bell, Store, ClipboardCheck, Heart, Flag, LogOut, User
} from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { selectUserInfo, logout } from '@/store/authSlice'
import type { AppDispatch } from '@/store'
import NotificationCenter from '@/components/NotificationCenter'
import { cn } from '@/lib/utils'

/* ========== 导航项配置 ========== */
const navItems = [
  { key: 'home',            label: '管理驾驶舱', path: '/home',            icon: BarChart3,       color: 'text-primary' },
  { key: 'bookings',        label: '预订管理',   path: '/bookings',        icon: CalendarDays,    color: 'text-emerald-400' },
  { key: 'starter',         label: '出发台',     path: '/starter',         icon: Flag,            color: 'text-teal-400' },
  { key: 'folios',          label: '账单管理',   path: '/folios',          icon: Receipt,         color: 'text-orange-400' },
  { key: 'resources',       label: '资源管理',   path: '/resources',       icon: Layers,          color: 'text-blue-400' },
  { key: 'dining',          label: '餐饮管理',   path: '/dining',          icon: UtensilsCrossed, color: 'text-rose-400' },
  { key: 'cart-management', label: '球车管理',   path: '/cart-management', icon: Car,             color: 'text-amber-400' },
  { key: 'players',         label: '球员管理',   path: '/players',         icon: UserRound,       color: 'text-purple-400' },
  { key: 'memberships',     label: '会籍管理',   path: '/memberships',     icon: Crown,           color: 'text-yellow-400' },
  { key: 'tournaments',     label: '赛事管理',   path: '/tournaments',     icon: Trophy,          color: 'text-amber-400' },
  { key: 'notifications',   label: '通知中心',   path: '/notifications',   icon: Bell,            color: 'text-blue-400' },
  { key: 'inventory',       label: '库存管理',   path: '/inventory',       icon: Store,           color: 'text-orange-400' },
  { key: 'crm',             label: '客户关系',   path: '/crm',             icon: Heart,           color: 'text-pink-400' },
  { key: 'staff',           label: '排班考勤',   path: '/staff',           icon: ClipboardCheck,  color: 'text-violet-400' },
  { key: 'reports',         label: '报表分析',   path: '/reports',         icon: BarChart3,       color: 'text-cyan-400' },
  { key: 'daily-close',     label: '日结夜审',   path: '/daily-close',     icon: Moon,            color: 'text-indigo-400' },
  { key: 'settings',        label: '系统设置',   path: '/settings',        icon: Settings,        color: 'text-foreground-muted' },
]

interface LayoutProps {
  children: React.ReactNode
  title?: string
}

export default function Layout({ children, title = '开锤后台管理' }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch<AppDispatch>()
  const userInfo = useSelector(selectUserInfo)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // 当前路由
  const currentPath = location.pathname
  const currentNav = navItems.find(item => item.path === currentPath)

  const handleLogout = () => {
    dispatch(logout())
    toast.success('已退出登录')
    navigate('/login')
  }

  const closeMobileMenu = () => setMobileMenuOpen(false)

  // 侧边栏导航内容
  const sidebarContent = (
    <>
      {/* Logo 区域 */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 text-primary">
            <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
              <path d="M12 8v32M12 24l12-16M12 24l12 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className={cn(
            "transition-opacity duration-200",
            sidebarOpen ? "opacity-100" : "opacity-0 lg:opacity-0"
          )}>
            <h3 className="text-base font-bold text-foreground">开锤后台</h3>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider">Kaichui Admin</p>
          </div>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const isActive = currentPath === item.path
          const Icon = item.icon
          
          return (
            <button
              key={item.key}
              onClick={() => { 
                navigate(item.path)
                closeMobileMenu()
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all relative group",
                isActive 
                  ? "bg-background-hover text-foreground font-medium" 
                  : "text-foreground-muted hover:bg-background-hover hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
              )}
              <Icon size={18} className={cn(
                "flex-shrink-0 transition-colors",
                isActive ? item.color : "text-foreground-subtle group-hover:text-foreground-muted"
              )} />
              <span className={cn(
                "transition-opacity duration-200 whitespace-nowrap",
                sidebarOpen ? "opacity-100" : "opacity-0 lg:opacity-0"
              )}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </>
  )

  return (
    <div className="min-h-screen bg-background flex">
      {/* 桌面端侧边栏 */}
      <aside
        className={cn(
          "hidden lg:block fixed left-0 top-0 z-30 h-full transition-all duration-300 ease-out",
          sidebarOpen ? "w-56" : "w-16"
        )}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      >
        <div className="h-full flex flex-col bg-background-card border-r border-border">
          {sidebarContent}
        </div>
      </aside>

      {/* 移动端侧边栏遮罩 */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={closeMobileMenu}
        />
      )}

      {/* 移动端侧边栏抽屉 */}
      <aside
        className={cn(
          "lg:hidden fixed left-0 top-0 z-50 h-full w-64 bg-background-card border-r border-border flex flex-col transition-transform duration-300",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 text-primary">
              <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
                <path d="M12 8v32M12 24l12-16M12 24l12 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">开锤后台</h3>
              <p className="text-[10px] text-foreground-subtle uppercase tracking-wider">Kaichui Admin</p>
            </div>
          </div>
          <button 
            onClick={closeMobileMenu}
            className="p-2 rounded-lg hover:bg-background-hover text-foreground-muted"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const isActive = currentPath === item.path
            const Icon = item.icon
            
            return (
              <button
                key={item.key}
                onClick={() => { 
                  navigate(item.path)
                  closeMobileMenu()
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all relative",
                  isActive 
                    ? "bg-background-hover text-foreground font-medium" 
                    : "text-foreground-muted hover:bg-background-hover hover:text-foreground"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                )}
                <Icon size={18} className={cn(isActive ? item.color : "text-foreground-subtle")} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* 主内容区 */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300",
        "lg:ml-16"
      )}>
        {/* 顶部导航栏 */}
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-4 sm:px-6 bg-background-card/80 backdrop-blur-xl border-b border-border">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-background-hover text-foreground-muted"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-foreground-subtle">首页</span>
              {currentNav && (
                <>
                  <span className="text-foreground-subtle">/</span>
                  <span className="text-foreground font-medium">{currentNav.label}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <NotificationCenter recipientRole="admin" pollInterval={30000} />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background-hover text-foreground text-sm transition-colors">
                  <UserCircle size={18} className="text-foreground-muted" />
                  <span className="hidden sm:inline">{userInfo?.nickname || userInfo?.openid || '用户'}</span>
                  <ChevronDown size={14} className="text-foreground-subtle" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => toast.info('个人信息功能开发中...')}>
                  <User size={16} className="mr-2" />
                  个人信息
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-error focus:text-error">
                      <LogOut size={16} className="mr-2" />
                      退出登录
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认退出</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要退出登录吗？您需要重新扫码才能登录。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={handleLogout} className="bg-error text-white hover:bg-error/90">
                        确定退出
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
