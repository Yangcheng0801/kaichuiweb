import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  BarChart2, Users, Building2, PieChart,
  UserCircle, ChevronDown, FileText, AlertTriangle, Menu, X, PanelRightClose, Settings, Layers
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

const LONG_PRESS_MS = 800

const getMenuLabel = (key: MenuKey) => menuItems.find(m => m.key === key)?.label ?? ''

export default function Home() {
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const userInfo = useSelector(selectUserInfo)
  const isLoggedIn = useSelector(selectIsLoggedIn)

  // ---------- 布局状态 ----------
  const [activeMenu, setActiveMenu] = useState<MenuKey>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)   // 桌面端：鼠标靠近左边缘展开
  const [drawerOpen, setDrawerOpen] = useState(false)     // 移动端：抽屉开关
  const [dualViewOpen, setDualViewOpen] = useState(false) // 双视图模式
  const [secondaryView, setSecondaryView] = useState<MenuKey>('users')
  const [splitRatio, setSplitRatio] = useState(50)         // 左右分栏比例 0-100，默认 5:5

  // ---------- 放置模式（类似 Windows 小窗） ----------
  const [placementMode, setPlacementMode] = useState<{ module: MenuKey; currentActive: MenuKey } | null>(null)
  const [placementHoverZone, setPlacementHoverZone] = useState<'left' | 'right' | null>(null)
  const placementContainerRef = useRef<HTMLDivElement>(null)
  const placementHoverZoneRef = useRef<'left' | 'right'>('right')

  // ---------- 长按与分割线拖拽 ----------
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const splitDraggingRef = useRef(false)
  const [isDraggingSplit, setIsDraggingSplit] = useState(false) // 拖拽分割线时禁用 width 过渡，避免延迟
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

  const currentMenuLabel = getMenuLabel(activeMenu)

  const closeDrawer = () => setDrawerOpen(false)

  // ---------- 导航：长按 / 点击 ----------
  const handleNavPointerDown = (item: MenuKey) => {
    longPressFiredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      if (item !== activeMenu) {
        longPressFiredRef.current = true
        setPlacementMode({ module: item, currentActive: activeMenu })
        setPlacementHoverZone(null)
        placementHoverZoneRef.current = 'right'
        closeDrawer()
      }
    }, LONG_PRESS_MS)
  }

  const handleNavPointerUp = (item: MenuKey) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (longPressFiredRef.current) return
    if (dualViewOpen) {
      if (item === activeMenu) {
        setDualViewOpen(false)
      } else {
        setSecondaryView(item)
      }
      closeDrawer()
    } else {
      setActiveMenu(item)
      closeDrawer()
    }
  }

  const handleNavPointerLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handlePlacement = (isLeft: boolean) => {
    if (!placementMode) return
    const { module, currentActive } = placementMode
    if (isLeft) {
      setActiveMenu(module)
      setSecondaryView(currentActive)
      toast.success(`已开启双视图：${getMenuLabel(module)}（左） + ${getMenuLabel(currentActive)}（右）`)
    } else {
      setActiveMenu(currentActive)
      setSecondaryView(module)
      toast.success(`已开启双视图：${getMenuLabel(currentActive)}（左） + ${getMenuLabel(module)}（右）`)
    }
    setDualViewOpen(true)
    setPlacementMode(null)
  }

  // ---------- 放置模式：监听 pointer 移动与释放 ----------
  useEffect(() => {
    if (!placementMode) return
    const container = placementContainerRef.current
    const onPointerMove = (e: PointerEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      const zone = e.clientX < mid ? 'left' : 'right'
      placementHoverZoneRef.current = zone
      setPlacementHoverZone(zone)
    }
    const onPointerUp = () => {
      handlePlacement(placementHoverZoneRef.current === 'left')
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlacementMode(null)
        setPlacementHoverZone(null)
      }
    }
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [placementMode])

  // ---------- 双视图分割线拖拽 ----------
  const handleSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    splitDraggingRef.current = true
    setIsDraggingSplit(true) // 拖拽时禁用 width 过渡，避免跟手延迟
    const container = splitContainerRef.current
    if (!container) return

    const onMouseMove = (e: MouseEvent) => {
      if (!splitDraggingRef.current || !container) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      let ratio = Math.max(20, Math.min(80, (x / rect.width) * 100))
      // 回中吸附：48–52% 范围内吸附到 50%，提供明显提示
      if (ratio >= 48 && ratio <= 52) ratio = 50
      setSplitRatio(ratio)
    }
    const onMouseUp = () => {
      splitDraggingRef.current = false
      setIsDraggingSplit(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // ---------- 面板内容渲染 ----------
  const renderPanelContent = (key: MenuKey) => {
    if (key === 'dashboard') {
      return (
        <div className="space-y-8">
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map(card => (
              <div key={card.label} className="bg-white rounded-2xl p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)] border border-white/80">
                <div className="flex items-center gap-4">
                  <span className={`${card.color} flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-50`}>{card.icon}</span>
                  <div>
                    <div className="text-3xl font-semibold text-gray-900 tracking-tight">{card.value}</div>
                    <div className="text-sm text-gray-500 mt-1">{card.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-3xl shadow-[0_18px_60px_rgba(15,23,42,0.08)] border border-white/80 overflow-hidden">
            <div className="px-6 py-6 border-b border-gray-100 font-medium text-gray-900 text-lg sm:px-8">欢迎使用开锤后台管理系统</div>
            <div className="p-6 grid gap-4 text-sm text-gray-600 sm:p-8 md:grid-cols-2">
              <p>🎉 恭喜您成功登录系统！</p>
              <p>📊 系统运行状态正常</p>
              <p>🔒 您的账户权限：{userInfo?.role || '普通用户'}</p>
              <p>🏢 所属租户：{userInfo?.tenantId || '默认租户'}</p>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] sm:min-h-[400px] gap-4 text-gray-400">
        <BarChart2 size={48} className="opacity-30" />
        <p className="text-base">功能开发中...</p>
        <button
          onClick={() => setActiveMenu('dashboard')}
          className="px-5 py-2.5 bg-emerald-600 text-white rounded-full text-sm hover:bg-emerald-700 transition-colors"
        >
          返回首页
        </button>
      </div>
    )
  }

  const isNavItemActive = (key: MenuKey) => activeMenu === key || (dualViewOpen && secondaryView === key)
  const navItemClass = (key: MenuKey) =>
    'relative w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-all rounded-xl ' +
    (isNavItemActive(key) ? 'bg-gray-50 text-gray-900 shadow-inner shadow-gray-100 font-semibold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900')
  const renderNavItems = () =>
    menuItems.map(item => (
      <button
        key={item.key}
        onPointerDown={() => handleNavPointerDown(item.key)}
        onPointerUp={() => handleNavPointerUp(item.key)}
        onPointerLeave={handleNavPointerLeave}
        className={navItemClass(item.key)}
      >
        {isNavItemActive(item.key) && (
          <span className="absolute left-2 top-1/2 h-7 w-1 rounded-full bg-emerald-500 -translate-y-1/2" aria-hidden />
        )}
        <span className="flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 p-1.5">
          {item.icon}
        </span>
        <span>{item.label}</span>
      </button>
    ))

  const navContent = (
    <>
      <div className="h-[70px] flex items-center justify-between border-b border-gray-100 px-5">
        <div className="text-center">
          <h3 className="m-0 text-lg font-semibold text-emerald-600 tracking-wide">开锤后台</h3>
          <p className="m-0 text-[12px] text-gray-400">KAICHUI ADMIN</p>
        </div>
      </div>
      <nav className="flex-1 py-4 px-4 space-y-2">{renderNavItems()}</nav>
      {/* 底部：资源管理 + 系统设置入口 */}
      <div className="py-4 px-4 border-t border-gray-100 space-y-1">
        <button
          onClick={() => navigate('/resources')}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all rounded-xl"
        >
          <span className="flex items-center justify-center rounded-full bg-gray-100 text-gray-500 p-1.5">
            <Layers size={16} />
          </span>
          <span>资源管理</span>
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all rounded-xl"
        >
          <span className="flex items-center justify-center rounded-full bg-gray-100 text-gray-500 p-1.5">
            <Settings size={16} />
          </span>
          <span>系统设置</span>
        </button>
      </div>
    </>
  )

  // ---------- 渲染 ----------
  return (
    <div className="min-h-screen bg-[#f4f7fb] flex">
      {/* 放置模式提示条 */}
      {placementMode && (
        <p className="fixed top-4 left-1/2 -translate-x-1/2 text-sm text-gray-600 z-50 bg-white/95 px-4 py-2 rounded-full shadow-lg border border-gray-200">
          拖动到目标区域后释放 · 按 Esc 取消
        </p>
      )}

      {/* 桌面端：左侧触发区 + 隐藏式侧边栏，鼠标靠近左边缘展开 */}
      <div
        className="hidden lg:block fixed left-0 top-0 z-20 h-full overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: sidebarOpen ? 230 : 8 }}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      >
        <div className="h-full w-[230px] flex flex-col bg-white rounded-r-2xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] border border-l-0 border-white/80">
          {navContent}
        </div>
      </div>

      {/* 移动端：抽屉 */}
      {drawerOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 ease-out"
            onClick={closeDrawer}
            aria-hidden
          />
          <aside
            className="lg:hidden fixed left-0 top-0 z-40 h-full w-[260px] max-w-[85vw] bg-white rounded-r-2xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] border-l-0 border-white/80 flex flex-col animate-slide-in-left"
            role="dialog"
            aria-label="导航菜单"
          >
            <div className="h-[70px] flex items-center justify-between border-b border-gray-100 px-5">
              <h3 className="m-0 text-lg font-semibold text-emerald-600">开锤后台</h3>
              <button
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                onClick={closeDrawer}
                aria-label="关闭菜单"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 py-4 px-4 space-y-2 overflow-auto">{renderNavItems()}</nav>
          </aside>
        </>
      )}

      {/* 主内容区 */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ml-0 ${sidebarOpen ? 'lg:ml-[230px]' : 'lg:ml-[8px]'}`}
      >
        <div className="min-h-screen pt-0 pb-6 px-4 sm:px-5 lg:px-5">
        <div className="flex flex-col gap-6">
          <div className="flex-1 flex flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_25px_80px_rgba(15,23,42,0.12)] border border-white/80">
          {/* 顶部导航 */}
          <header className="border-b border-gray-100 flex flex-col gap-4 px-6 py-5 sm:h-[70px] sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-0">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 rounded-full hover:bg-gray-100 text-gray-600"
                onClick={() => setDrawerOpen(true)}
                aria-label="打开菜单"
              >
                <Menu size={22} />
              </button>
              <nav className="flex items-center gap-1 text-sm text-gray-500">
                <span>首页</span>
                <span className="mx-1">/</span>
                <span className="text-gray-900 font-medium">
                  {placementMode ? '选择放置位置' : dualViewOpen ? `${getMenuLabel(activeMenu)} + ${getMenuLabel(secondaryView)}` : currentMenuLabel}
                </span>
              </nav>
              {dualViewOpen && (
                <button
                  onClick={() => setDualViewOpen(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
                  title="关闭双视图"
                >
                  <PanelRightClose size={16} />
                  关闭双视图
                </button>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 cursor-pointer bg-gray-50 px-3 py-2 rounded-full shadow-inner shadow-white/40">
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

          {/* 主要内容：放置模式 | 双视图 | 单视图 */}
          <main className="flex-1 overflow-hidden flex flex-col p-0 bg-gradient-to-b from-white to-gray-50/30">
            {placementMode ? (
              <div ref={placementContainerRef} className="flex-1 flex overflow-hidden min-h-0">
                <div
                  className={`flex-1 overflow-auto p-6 sm:p-8 min-w-0 transition-all duration-200 ${
                    placementHoverZone === 'left'
                      ? 'ring-2 ring-emerald-500 ring-inset bg-emerald-50/30'
                      : 'ring-0'
                  }`}
                >
                  {renderPanelContent(placementMode.currentActive)}
                </div>
                <div
                  className={`flex-1 flex flex-col items-center justify-center min-w-0 p-6 transition-all duration-200 ${
                    placementHoverZone === 'right'
                      ? 'ring-2 ring-emerald-500 ring-inset bg-emerald-50/30'
                      : 'ring-2 ring-dashed ring-gray-300 bg-gray-50/50'
                  }`}
                >
                  <span className="text-sm text-gray-500 mb-2">{getMenuLabel(placementMode.module)}</span>
                  <span className="text-xs text-gray-400">
                    {placementHoverZone === 'right' ? '→ 放置到这里' : '拖动到此处后释放'}
                  </span>
                </div>
              </div>
            ) : dualViewOpen ? (
              <div ref={splitContainerRef} className="flex-1 flex overflow-hidden min-h-0">
                <div
                  className={`overflow-auto p-6 sm:p-8 animate-slide-in-left ${isDraggingSplit ? 'transition-none' : 'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]'}`}
                  style={{ width: `${splitRatio}%`, minWidth: 0 }}
                >
                  {renderPanelContent(activeMenu)}
                </div>
                <div
                  className={`w-2 flex-shrink-0 cursor-col-resize transition-all flex items-center justify-center relative group ${
                    splitRatio === 50
                      ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                      : 'bg-gray-200 hover:bg-emerald-400'
                  }`}
                  onMouseDown={handleSplitMouseDown}
                  title={splitRatio === 50 ? '已居中 50% · 拖拽调整比例' : '拖拽调整比例'}
                >
                  <div className={`w-0.5 h-12 rounded-full ${splitRatio === 50 ? 'bg-white' : 'bg-gray-400'}`} />
                  {splitRatio === 50 && (
                    <span className="absolute left-1/2 -translate-x-1/2 -translate-y-full -top-1 px-2 py-0.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded shadow-sm whitespace-nowrap pointer-events-none border border-emerald-200">
                      50% 居中
                    </span>
                  )}
                </div>
                <div className="overflow-auto p-6 sm:p-8 flex-1 min-w-0 animate-slide-in-right">
                  {renderPanelContent(secondaryView)}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-6 sm:p-8">
                {activeMenu === 'dashboard' ? (
                  <div className="space-y-8">
                    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                      {statCards.map(card => (
                        <div key={card.label} className="bg-white rounded-2xl p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)] border border-white/80">
                          <div className="flex items-center gap-4">
                            <span className={`${card.color} flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-50`}>{card.icon}</span>
                            <div>
                              <div className="text-3xl font-semibold text-gray-900 tracking-tight">{card.value}</div>
                              <div className="text-sm text-gray-500 mt-1">{card.label}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white rounded-3xl shadow-[0_18px_60px_rgba(15,23,42,0.08)] border border-white/80 overflow-hidden">
                      <div className="px-6 py-6 border-b border-gray-100 font-medium text-gray-900 text-lg sm:px-8">欢迎使用开锤后台管理系统</div>
                      <div className="p-6 grid gap-4 text-sm text-gray-600 sm:p-8 md:grid-cols-2">
                        <p>🎉 恭喜您成功登录系统！</p>
                        <p>📊 系统运行状态正常</p>
                        <p>🔒 您的账户权限：{userInfo?.role || '普通用户'}</p>
                        <p>🏢 所属租户：{userInfo?.tenantId || '默认租户'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[280px] sm:min-h-[400px] gap-4 text-gray-400">
                    <BarChart2 size={48} className="opacity-30" />
                    <p className="text-base">功能开发中...</p>
                    <button
                      onClick={() => setActiveMenu('dashboard')}
                      className="px-5 py-2.5 bg-emerald-600 text-white rounded-full text-sm hover:bg-emerald-700 transition-colors shadow-[0_10px_25px_rgba(16,185,129,0.35)]"
                    >
                      返回首页
                    </button>
                  </div>
                )}
              </div>
            )}
          </main>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
