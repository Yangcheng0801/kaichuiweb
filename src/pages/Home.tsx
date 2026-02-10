import { useState, useEffect } from 'react'
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

  // 从微信回调进入时 userInfo 可能为空，进入首页后静默拉取
  useEffect(() => {
    if (isLoggedIn && !userInfo?.userId) {
      dispatch(fetchUserInfo())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    dispatch(logout())
    toast.success('已退出登录')
    navigate('/login')
  }

  const currentMenuLabel = menuItems.find(m => m.key === activeMenu)?.label ?? ''

  return (
    <div className="flex h-screen bg-white">
      {/* 侧边栏 - 纯白风格 */}
      <aside className="w-[240px] bg-white flex flex-col flex-shrink-0 border-r border-gray-100">
        <div className="h-[72px] flex items-center px-8 border-b border-gray-100">
          <h3 className="m-0 text-xl font-semibold text-black tracking-tight">开锤</h3>
        </div>
        <nav className="flex-1 py-6 px-4">
          {menuItems.map(item => (
            <button
              key={item.key}
              onClick={() => setActiveMenu(item.key)}
              className={[
                'w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition-all rounded-lg mb-1',
                activeMenu === item.key
                  ? 'bg-black text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-black'
              ].join(' ')}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/50">
        {/* 顶部导航 - 极简设计 */}
        <header className="h-[72px] bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center px-8 justify-between">
          <nav className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">首页</span>
            <span className="text-gray-300">/</span>
            <span className="text-black font-medium">{currentMenuLabel}</span>
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-black transition-colors rounded-lg hover:bg-gray-50">
                <UserCircle size={20} />
                <span>{userInfo?.nickname || userInfo?.openid || '用户'}</span>
                <ChevronDown size={16} />
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
                  <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-red-600 focus:text-red-600">
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
        <main className="flex-1 overflow-auto p-8">
          {activeMenu === 'dashboard' ? (
            <div className="max-w-[1400px]">
              {/* 数据卡片 - 微阴影悬浮效果 */}
              <div className="grid grid-cols-4 gap-6 mb-8">
                {statCards.map(card => (
                  <div 
                    key={card.label} 
                    className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 group"
                  >
                    <div className="flex flex-col gap-4">
                      <span className="text-black opacity-80 group-hover:opacity-100 transition-opacity">
                        {card.icon}
                      </span>
                      <div>
                        <div className="text-3xl font-bold text-black tracking-tight mb-1">{card.value}</div>
                        <div className="text-sm text-gray-500 font-medium">{card.label}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 欢迎卡片 - 现代设计 */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-100">
                  <h2 className="text-xl font-bold text-black tracking-tight">
                    欢迎使用开锤后台管理系统
                  </h2>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex items-start gap-4 p-5 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0">
                        ✓
                      </div>
                      <div>
                        <div className="font-semibold text-black mb-1">登录成功</div>
                        <div className="text-sm text-gray-600">您已成功进入系统</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4 p-5 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0">
                        ◉
                      </div>
                      <div>
                        <div className="font-semibold text-black mb-1">系统状态</div>
                        <div className="text-sm text-gray-600">运行正常</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4 p-5 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0">
                        ⚡
                      </div>
                      <div>
                        <div className="font-semibold text-black mb-1">账户权限</div>
                        <div className="text-sm text-gray-600">{userInfo?.role || '普通用户'}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4 p-5 bg-gray-50/50 rounded-xl border border-gray-100">
                      <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white text-xl flex-shrink-0">
                        ◈
                      </div>
                      <div>
                        <div className="font-semibold text-black mb-1">所属租户</div>
                        <div className="text-sm text-gray-600">{userInfo?.tenantId || '默认租户'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[500px] gap-6">
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center">
                <BarChart2 size={40} className="text-gray-300" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-gray-900 mb-2">功能开发中</p>
                <p className="text-sm text-gray-500">该功能即将上线，敬请期待</p>
              </div>
              <button
                onClick={() => setActiveMenu('dashboard')}
                className="px-6 py-3 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-all shadow-sm hover:shadow-md"
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
