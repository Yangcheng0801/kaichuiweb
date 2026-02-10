import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  BarChart2, Users, Building2, PieChart,
  UserCircle, ChevronDown, FileText, AlertTriangle
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

type MenuKey = 'dashboard' | 'users' | 'tenants' | 'quotas'

const menuItems: { key: MenuKey; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: '数据概览', icon: <BarChart2 size={16} /> },
  { key: 'users',     label: '用户管理', icon: <Users size={16} /> },
  { key: 'tenants',   label: '租户管理', icon: <Building2 size={16} /> },
  { key: 'quotas',    label: '配额管理', icon: <PieChart size={16} /> },
]

const statCards = [
  { label: '总用户数', value: '1,234', icon: <Users size={28} />, color: 'text-blue-500' },
  { label: '租户数量', value: '56',    icon: <Building2 size={28} />, color: 'text-green-500' },
  { label: '数据记录', value: '8,901', icon: <FileText size={28} />, color: 'text-orange-400' },
  { label: '待处理',   value: '12',    icon: <AlertTriangle size={28} />, color: 'text-red-400' },
]

export default function Home() {
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const userInfo = useSelector(selectUserInfo)
  const isLoggedIn = useSelector(selectIsLoggedIn)

  const [activeMenu, setActiveMenu] = useState<MenuKey>('dashboard')
  const fetchedRef = useRef(false)

  // 从微信回调进入时 userInfo 可能为空，进入首页后静默拉取一次。
  // fetchedRef 守卫确保只拉取一次，兼容 React 18 StrictMode 下 effect 的双重调用。
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    if (isLoggedIn && !userInfo?.userId) {
      dispatch(fetchUserInfo())
    }
  }, [isLoggedIn, userInfo, dispatch])

  const handleLogout = () => {
    dispatch(logout())
    toast.success('已退出登录')
    navigate('/login')
  }

  const currentMenuLabel = menuItems.find(m => m.key === activeMenu)?.label ?? ''

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 侧边栏 */}
      <aside className="w-[200px] bg-[#304156] text-white flex flex-col flex-shrink-0">
        <div className="h-[60px] flex items-center justify-center border-b border-[#1f2d3d]">
          <h3 className="m-0 text-lg font-semibold text-white">开锤后台</h3>
        </div>
        <nav className="flex-1 py-2">
          {menuItems.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveMenu(item.key)}
              className={[
                'w-full flex items-center gap-3 px-5 py-3 text-sm text-left transition-colors',
                activeMenu === item.key
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-300 hover:bg-[#263445] hover:text-white'
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部导航 */}
        <header className="h-[60px] bg-white border-b border-gray-200 flex items-center px-5 justify-between">
          <nav className="flex items-center gap-1 text-sm text-gray-500">
            <span>首页</span>
            <span className="mx-1">/</span>
            <span className="text-gray-900">{currentMenuLabel}</span>
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 cursor-pointer">
                <UserCircle size={18} />
                <span>{userInfo?.nickname || userInfo?.openid || '用户'}</span>
                <ChevronDown size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toast.info('个人信息功能开发中...')}>
                个人信息
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* 退出登录需要二次确认 */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-red-500 focus:text-red-500">
                    退出登录
                  </DropdownMenuItem>
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
        </header>

        {/* 主要内容 */}
        <main className="flex-1 overflow-auto p-5">
          {activeMenu === 'dashboard' ? (
            <div>
              {/* 数据卡片 */}
              <div className="grid grid-cols-4 gap-5 mb-5">
                {statCards.map(card => (
                  <div key={card.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4">
                      <span className={card.color}>{card.icon}</span>
                      <div>
                        <div className="text-2xl font-bold text-gray-800">{card.value}</div>
                        <div className="text-sm text-gray-500 mt-1">{card.label}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 欢迎卡片 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="px-5 py-4 border-b border-gray-100 font-medium text-gray-800">
                  欢迎使用开锤后台管理系统
                </div>
                <div className="p-5 space-y-3 text-sm text-gray-600">
                  <p>🎉 恭喜您成功登录系统！</p>
                  <p>📊 系统运行状态正常</p>
                  <p>🔒 您的账户权限：{userInfo?.role || '普通用户'}</p>
                  <p>🏢 所属租户：{userInfo?.tenantId || '默认租户'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-gray-400">
              <BarChart2 size={48} className="opacity-30" />
              <p className="text-base">功能开发中...</p>
              <button
                onClick={() => setActiveMenu('dashboard')}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors"
              >
                返回首页
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
