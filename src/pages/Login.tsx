import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { loginSuccess, generateQRCode as generateQRCodeThunk, checkLoginStatusByQRCode } from '@/store/authSlice'
import type { AppDispatch } from '@/store'
import { useParticleSystem } from '@/hooks/useParticleSystem'

declare global {
  interface Window {
    WxLogin?: new (config: {
      self_redirect: boolean
      id: string
      appid: string
      scope: string
      redirect_uri: string
      state: string
      style: string
      href: string
    }) => void
  }
}

export default function Login() {
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const canvasRef = useParticleSystem()

  const [qrId, setQrId]               = useState('')
  const [loading, setLoading]         = useState(true)
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [qrLoadFailed, setQrLoadFailed] = useState(false)
  const [scanned, setScanned]         = useState(false)
  const [loginDone, setLoginDone]     = useState(false)
  const [cardEntered, setCardEntered] = useState(false)

  const wxContainerRef = useRef<HTMLDivElement>(null)
  const checkTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const loginHandledRef = useRef(false)

  // ── WxLogin 初始化 ──────────────────────────────────────────────
  const initWxLogin = useCallback((appId: string, redirectUri: string, state: string) => {
    if (!window.WxLogin || !wxContainerRef.current) return
    wxContainerRef.current.innerHTML = ''
    new window.WxLogin({
      self_redirect: true,
      id: 'wx_login_container',
      appid: appId,
      scope: 'snsapi_login',
      redirect_uri: encodeURIComponent(redirectUri),
      state,
      style: 'black',
      href: ''
    })
    // WxLogin SDK 不暴露 iframe API，手动设置样式裁剪微信品牌区
    requestAnimationFrame(() => {
      const iframe = wxContainerRef.current?.querySelector('iframe')
      if (!iframe) return
      Object.assign(iframe.style, { maxWidth: '280px', transform: 'translateY(-6px)' })
    })
  }, [])

  // ── 轮询逻辑 ───────────────────────────────────────────────────
  const stopCheck = useCallback(() => {
    if (checkTimerRef.current) { clearInterval(checkTimerRef.current); checkTimerRef.current = null }
  }, [])

  const doCheck = useCallback(async (currentQrId: string) => {
    if (loginHandledRef.current) return
    try {
      const result = await dispatch(checkLoginStatusByQRCode(currentQrId)).unwrap()
      if (result.success && !loginHandledRef.current) {
        const { status, token, user } = result.data
        if (status === 'scanned') {
          setScanned(true)
        } else if (status === 'confirmed') {
          loginHandledRef.current = true
          stopCheck()
          setScanned(true)
          setTimeout(() => {
            setLoginDone(true)
            setTimeout(() => {
              dispatch(loginSuccess({ token, userInfo: user }))
              navigate('/home', { replace: true })
            }, 800)
          }, 1000)
        }
      }
    } catch { /* 轮询异常静默忽略 */ }
  }, [dispatch, stopCheck, navigate])

  const startCheck = useCallback((id: string) => {
    checkTimerRef.current = setInterval(() => doCheck(id), 2000)
  }, [doCheck])

  // ── 生成二维码 ─────────────────────────────────────────────────
  const genQRCode = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshLoading(true); else setLoading(true)
    setScanned(false); setLoginDone(false); setQrLoadFailed(false)
    loginHandledRef.current = false
    stopCheck()

    try {
      const result = await dispatch(generateQRCodeThunk()).unwrap()
      if (result.success) {
        const { qrId: ticket, appId, redirectUri } = result.data
        setQrId(ticket); setLoading(false); setRefreshLoading(false)
        setTimeout(() => { initWxLogin(appId, redirectUri, ticket); startCheck(ticket) }, 0)
      } else {
        setLoading(false); setRefreshLoading(false); setQrLoadFailed(true)
        toast.error(result.message || '生成二维码失败')
      }
    } catch {
      setLoading(false); setRefreshLoading(false); setQrLoadFailed(true)
      toast.error('生成二维码失败，请稍后重试')
    }
  }, [dispatch, stopCheck, initWxLogin, startCheck])

  // ── 生命周期 ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setCardEntered(true), 50)
    genQRCode(false)
    return () => { clearTimeout(t); stopCheck() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 渲染 ───────────────────────────────────────────────────────
  const refreshBtnText = refreshLoading
    ? '正在生成...'
    : qrLoadFailed ? '加载失败？点击重试' : '二维码过期？点击重新生成'

  return (
    <div className="font-sans min-h-screen flex items-center justify-center p-5 relative overflow-hidden bg-gradient-to-br from-green-50 via-slate-50 to-slate-200">
      {/* 跳转链接（无障碍） */}
      <a
        href="#login-main"
        className="absolute -top-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-primary-deep text-primary-foreground text-sm rounded-lg z-[100] transition-[top] duration-200 focus:top-4 focus:outline-2 focus:outline-primary focus:outline-offset-2"
      >
        跳到主内容
      </a>

      {/* 粒子背景 */}
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full z-[1] pointer-events-none" aria-hidden="true" />

      {/* 登录卡片 */}
      <div id="login-main" className="w-full max-w-[360px] relative z-10">
        <div
          className={cn(
            'flex flex-col items-center overflow-hidden',
            'bg-card/95 backdrop-blur-sm rounded-[20px] px-0.5 pt-0.5 pb-2',
            'border border-white/80',
            'shadow-[0_20px_60px_rgba(0,0,0,0.08),0_40px_80px_rgba(0,0,0,0.06),inset_0_0_0_1px_rgba(0,0,0,0.05)]',
            'transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-200',
            cardEntered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-[30px] scale-[0.96]',
          )}
        >
          {/* ── 品牌区 ── */}
          <div className="text-center mb-2 relative z-[1]">
            <div className="w-11 h-11 mx-auto mb-2 text-primary-deep" role="img" aria-label="开锤品牌标识">
              <svg viewBox="0 0 48 48" fill="none" className="w-full h-full">
                <path d="M12 8v32M12 24l12-16M12 24l12 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-[26px] max-sm:text-[22px] font-bold tracking-wide m-0 mb-1 text-primary-deep">
              开锤后台管理系统
            </h1>
            <p className="text-sm font-medium tracking-wide m-0 text-muted-foreground">微信扫码，安全快捷</p>
          </div>

          {/* ── 二维码区 ── */}
          <div className="text-center relative z-[1] mt-2 flex flex-col items-center">
            <div
              ref={wxContainerRef}
              id="wx_login_container"
              role="region"
              aria-live="polite"
              aria-label={
                loginDone ? '登录成功，正在跳转'
                : loading ? '正在生成二维码'
                : scanned ? '扫码成功，正在登录'
                : qrLoadFailed ? '二维码加载失败'
                : '请使用微信扫一扫扫描二维码'
              }
              className={cn(
                'mx-auto mb-2 rounded-xl border flex items-center justify-center relative overflow-hidden',
                'transition-all duration-300',
                'bg-secondary/50 border-border hover:border-primary hover:shadow-[0_4px_12px_rgba(16,185,129,0.15)] hover:bg-card',
                scanned && 'animate-scanned-pulse motion-reduce:animate-none',
                qrLoadFailed
                  ? 'w-[120px] min-w-[120px] h-[120px] min-h-[120px]'
                  : 'w-[280px] h-[264px] min-h-[264px] max-sm:w-[240px] max-sm:h-[228px] max-sm:min-h-[228px]',
              )}
            >
              {loading && (
                <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground animate-in fade-in duration-400" role="status">
                  <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p>正在生成二维码...</p>
                </div>
              )}
            </div>

            {/* 状态文字 */}
            <p className={cn('inline-flex items-center justify-center gap-1.5 text-base mb-2', scanned ? 'font-semibold text-primary' : 'font-medium text-foreground')}>
              {scanned && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[18px] h-[18px] text-primary" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
              {loginDone ? '登录成功' : scanned ? '扫码成功' : '请使用微信扫一扫扫描二维码'}
            </p>

            {scanned && !loginDone && (
              <p className="text-[13px] -mt-1 mb-2 font-normal text-muted-foreground">请在手机上点击「确认登录」完成登录</p>
            )}
            {loginDone && (
              <p className="text-[13px] -mt-1 mb-2 font-normal text-primary">正在跳转到首页...</p>
            )}

            {/* 刷新按钮 */}
            {(qrId || qrLoadFailed) && (
              <button
                type="button"
                disabled={refreshLoading}
                aria-busy={refreshLoading}
                onClick={() => genQRCode(true)}
                className={cn(
                  'relative px-5 py-2.5 bg-primary-deep text-primary-foreground rounded-lg',
                  'text-[13px] font-semibold cursor-pointer overflow-hidden',
                  'transition-all duration-300',
                  'hover:bg-primary-dark hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(5,44,34,0.3)]',
                  'active:scale-[0.98]',
                  'disabled:cursor-not-allowed disabled:opacity-85',
                  'focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
                  refreshLoading && 'pl-9',
                )}
              >
                {refreshLoading && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                )}
                {refreshBtnText}
              </button>
            )}
          </div>

          {/* ── 底部 ── */}
          <div className="text-center mt-auto pt-4 text-sm relative z-[1] text-muted-foreground">
            <a
              href="#"
              className="text-primary no-underline transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(16,185,129,0.2)] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              aria-label="联系管理员获取帮助"
              onClick={e => { e.preventDefault(); toast.info('请联系管理员') }}
            >
              联系管理员
            </a>
            <div className="w-20 h-px mx-auto mt-3 bg-border/30" aria-hidden="true" />
            <p className="text-xs mt-3 opacity-90">采用微信官方安全登录</p>
            <p className="mt-2 text-xs">
              网站备案号：
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener" className="text-primary no-underline">
                粤ICP备2025505541号-2
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
