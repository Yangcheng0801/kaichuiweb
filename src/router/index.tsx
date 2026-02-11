import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectIsLoggedIn } from '@/store/authSlice'

const Login = lazy(() => import('@/pages/Login'))
const Home = lazy(() => import('@/pages/Home'))
const AuthCallback = lazy(() => import('@/pages/AuthCallback'))
const Settings = lazy(() => import('@/pages/Settings'))
const Resources = lazy(() => import('@/pages/Resources'))

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
      </Routes>
    </Suspense>
  )
}
