import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectIsLoggedIn } from '@/store/authSlice'

const Login = lazy(() => import('@/pages/Login'))
const Home = lazy(() => import('@/pages/Home'))
const AuthCallback = lazy(() => import('@/pages/AuthCallback'))
const Settings = lazy(() => import('@/pages/Settings'))
const Resources = lazy(() => import('@/pages/Resources'))
const Bookings  = lazy(() => import('@/pages/Bookings'))
const CartManagement = lazy(() => import('@/pages/CartManagement'))
const Players        = lazy(() => import('@/pages/Players'))
const Folios         = lazy(() => import('@/pages/Folios'))
const Dining         = lazy(() => import('@/pages/Dining'))
const Reports        = lazy(() => import('@/pages/Reports'))
const DailyClose     = lazy(() => import('@/pages/DailyClose'))
const Memberships    = lazy(() => import('@/pages/Memberships'))
const Tournaments    = lazy(() => import('@/pages/Tournaments'))
const Notifications  = lazy(() => import('@/pages/Notifications'))
const Inventory      = lazy(() => import('@/pages/Inventory'))
const StaffPage      = lazy(() => import('@/pages/Staff'))

// 受保护路由：未登录跳转到 /login
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useSelector(selectIsLoggedIn)
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

// 已登录时访问 /login 跳转到 /home
function PublicRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useSelector(selectIsLoggedIn)
  if (isLoggedIn) return <Navigate to="/home" replace />
  return <>{children}</>
}

export default function AppRouter() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resources"
          element={
            <ProtectedRoute>
              <Resources />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <Bookings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cart-management"
          element={
            <ProtectedRoute>
              <CartManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/players"
          element={
            <ProtectedRoute>
              <Players />
            </ProtectedRoute>
          }
        />
        <Route
          path="/folios"
          element={
            <ProtectedRoute>
              <Folios />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dining"
          element={
            <ProtectedRoute>
              <Dining />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/daily-close"
          element={
            <ProtectedRoute>
              <DailyClose />
            </ProtectedRoute>
          }
        />
        <Route
          path="/memberships"
          element={
            <ProtectedRoute>
              <Memberships />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tournaments"
          element={
            <ProtectedRoute>
              <Tournaments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <Inventory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  )
}
