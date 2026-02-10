import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { loginSuccess } from '@/store/authSlice'
import type { AppDispatch } from '@/store'

export default function AuthCallback() {
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const [searchParams] = useSearchParams()
  const handled = useRef(false)

  useEffect(() => {
    // handled 守卫确保此逻辑只执行一次，兼容 React 18 StrictMode 下 effect 的双重调用。
    if (handled.current) return
    handled.current = true

    const token = searchParams.get('token')
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    // 后端已用 code 换好 token 并重定向到此页，直接信任该 token 并写入，然后跳首页。
    // 不调用 checkLoginStatus：其内部在 /auth/verify 失败时会 logout，
    // 导致 token 被清空，路由守卫再次重定向回 /login，形成死循环。
    dispatch(loginSuccess({ token, userInfo: {} }))
    navigate('/home', { replace: true })
  }, [searchParams, dispatch, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-slate-50 to-slate-200">
      <div className="bg-white/95 px-12 py-10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] text-center">
        <div className="w-10 h-10 mx-auto mb-5 rounded-full border-[3px] border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <p className="m-0 text-[15px] text-gray-500">登录成功，正在跳转到首页...</p>
      </div>
    </div>
  )
}
