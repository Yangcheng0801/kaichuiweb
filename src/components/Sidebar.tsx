import { useNavigate, useLocation } from 'react-router-dom'
import {
  CalendarDays, Layers, Car, UserRound, Settings,
  BarChart3, Receipt, UtensilsCrossed, Moon, Crown,
  Trophy, Bell, Store, ClipboardCheck, Heart, Flag
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ========== 导航项配置 ========== */
const navItems = [
  { key: 'bookings', label: '预订管理', path: '/bookings', icon: CalendarDays, color: 'bg-success/10 text-success' },
  { key: 'starter', label: '出发台', path: '/starter', icon: Flag, color: 'bg-teal-50 text-teal-600' },
  { key: 'folios', label: '账单管理', path: '/folios', icon: Receipt, color: 'bg-orange-50 text-orange-600' },
  { key: 'resources', label: '资源管理', path: '/resources', icon: Layers, color: 'bg-blue-50 text-blue-600' },
  { key: 'dining', label: '餐饮管理', path: '/dining', icon: UtensilsCrossed, color: 'bg-rose-50 text-rose-600' },
  { key: 'cart-management', label: '球车管理', path: '/cart-management', icon: Car, color: 'bg-amber-50 text-amber-600' },
  { key: 'players', label: '球员管理', path: '/players', icon: UserRound, color: 'bg-purple-50 text-purple-600' },
  { key: 'memberships', label: '会籍管理', path: '/memberships', icon: Crown, color: 'bg-amber-50 text-amber-600' },
  { key: 'tournaments', label: '赛事管理', path: '/tournaments', icon: Trophy, color: 'bg-yellow-50 text-yellow-600' },
  { key: 'notifications', label: '通知中心', path: '/notifications', icon: Bell, color: 'bg-blue-50 text-blue-600' },
  { key: 'inventory', label: '库存/专卖店', path: '/inventory', icon: Store, color: 'bg-orange-50 text-orange-600' },
  { key: 'crm', label: '客户关系', path: '/crm', icon: Heart, color: 'bg-pink-50 text-pink-600' },
  { key: 'staff', label: '排班考勤', path: '/staff', icon: ClipboardCheck, color: 'bg-violet-50 text-violet-600' },
  { key: 'reports', label: '报表分析', path: '/reports', icon: BarChart3, color: 'bg-cyan-50 text-cyan-600' },
  { key: 'daily-close', label: '日结/夜审', path: '/daily-close', icon: Moon, color: 'bg-indigo-50 text-indigo-600' },
  { key: 'settings', label: '系统设置', path: '/settings', icon: Settings, color: 'bg-secondary text-muted-foreground' },
]

interface SidebarProps {
  open?: boolean
  onNavigate?: () => void
  className?: string
}

export default function Sidebar({ open = true, onNavigate, className }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleNavigation = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  const isActive = (path: string) => location.pathname === path
  const isHome = location.pathname === '/home' || location.pathname === '/'

  return (
    <div className={cn('h-full w-full flex flex-col bg-card', className)}>
      {/* 品牌标识 */}
      <div className="h-[70px] flex items-center border-b border-border px-5">
        <div>
          <h3 className="m-0 text-lg font-semibold text-foreground tracking-wide">开锤后台</h3>
          <p className="m-0 text-xs text-muted-foreground">KAICHUI ADMIN</p>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 py-4 px-4 space-y-1 overflow-auto">
        {/* 首页（管理驾驶舱） */}
        <button
          onClick={() => handleNavigation('/home')}
          className={cn(
            'relative w-full flex items-center gap-3 px-4 py-3 text-sm text-left rounded-xl transition-all',
            isHome
              ? 'bg-secondary text-foreground font-semibold shadow-sm'
              : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          )}
        >
          {isHome && (
            <span className="absolute left-2 top-1/2 h-7 w-1 rounded-full bg-foreground -translate-y-1/2" />
          )}
          <span className={cn(
            'flex items-center justify-center rounded-full p-1.5',
            isHome ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
          )}>
            <BarChart3 size={16} />
          </span>
          <span>管理驾驶舱</span>
        </button>

        {/* 其他导航项 */}
        {navItems.map((item) => {
          const active = isActive(item.path)
          return (
            <button
              key={item.key}
              onClick={() => handleNavigation(item.path)}
              className={cn(
                'relative w-full flex items-center gap-3 px-4 py-3 text-sm text-left rounded-xl transition-all',
                active
                  ? 'bg-secondary text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              )}
            >
              {active && (
                <span className="absolute left-2 top-1/2 h-7 w-1 rounded-full bg-foreground -translate-y-1/2" />
              )}
              <span className={`flex items-center justify-center rounded-full p-1.5 ${item.color}`}>
                <item.icon size={16} />
              </span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
