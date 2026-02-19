import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { loginSuccess, generateQRCode as generateQRCodeThunk, checkLoginStatusByQRCode } from '@/store/authSlice'
import type { AppDispatch } from '@/store'

// 让 TypeScript 知道 window 上有 WxLogin
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

// ---------- 粒子系统（与 Vue 版逻辑完全一致） ----------
function createParticleSystem(canvas: HTMLCanvasElement) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion) return { stop: () => {} }

  const ctx = canvas.getContext('2d')!
  type Particle = { x: number; y: number; vx: number; vy: number; radius: number; opacity: number }
  let particles: Particle[] = []
  const particleCount = 80
  let mouse = { x: 0, y: 0 }
  let running = true
  let rafId = 0

  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    init()
  }

  function init() {
    particles = []
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2.5 + 1.5,
        opacity: Math.random() * 0.4 + 0.35
      })
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    particles.forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(5, 44, 34, ${p.opacity})`
      ctx.fill()
    })
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 150) {
          ctx.strokeStyle = `rgba(5, 44, 34, ${(1 - d / 150) * 0.35})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.stroke()
        }
      }
    }
  }

  function update() {
    particles.forEach(p => {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1
      const dx = p.x - mouse.x
      const dy = p.y - mouse.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < 150 && d > 0) {
        const force = (150 - d) / 150
        p.vx += (dx / d) * force * 0.035
        p.vy += (dy / d) * force * 0.035
      }
      const maxSpeed = 1.5
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (speed > maxSpeed) { p.vx = (p.vx / speed) * maxSpeed; p.vy = (p.vy / speed) * maxSpeed }
    })
  }

  function animate() {
    if (!running) return
    update(); draw()
    rafId = requestAnimationFrame(animate)
  }

  const onMouseMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY }
  const onResize = () => resize()
  window.addEventListener('resize', onResize)
  document.addEventListener('mousemove', onMouseMove)
  resize()
  animate()

  return {
    stop() {
      running = false
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }
}

export default function Login() {
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()

  const [qrId, setQrId]               = useState('')
  const [loading, setLoading]         = useState(true)
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [qrLoadFailed, setQrLoadFailed] = useState(false)
  const [scanned, setScanned]         = useState(false)
  const [loginDone, setLoginDone]     = useState(false)
  const [cardEntered, setCardEntered] = useState(false)

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const wxContainerRef = useRef<HTMLDivElement>(null)
  const checkTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const loginHandledRef    = useRef(false)
  const scannedByIframeRef = useRef(false)
  const iframeSetupTimeRef = useRef(0)

  // ---------- 微信官方 WxLogin ----------
  const initWxLogin = useCallback((appId: string, redirectUri: string, state: string) => {
    if (!window.WxLogin || !wxContainerRef.current) return
    wxContainerRef.current.innerHTML = ''
    scannedByIframeRef.current = false
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
    // WxLogin 同步创建 iframe；挂载 load 监听检测扫码引起的页面切换
    requestAnimationFrame(() => {
      const iframe = wxContainerRef.current?.querySelector('iframe')
      if (!iframe) return
      iframeSetupTimeRef.current = Date.now()
      iframe.addEventListener('load', () => {
        // 初始二维码页面在 ~2s 内加载完毕，用户不可能在 3s 内完成扫码
        // 3s 后的 load 事件 = 用户扫码导致 iframe 内页面切换
        if (Date.now() - iframeSetupTimeRef.current < 3000) return
        if (!scannedByIframeRef.current && !loginHandledRef.current) {
          scannedByIframeRef.current = true
          setScanned(true)
        }
      })
    })
  }, [])

  // ---------- 轮询逻辑 ----------
  const stopCheck = useCallback(() => {
    if (checkTimerRef.current) {
      clearInterval(checkTimerRef.current)
      checkTimerRef.current = null
    }
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
          const alreadyScanned = scannedByIframeRef.current
          setScanned(true)
          setTimeout(() => {
            setLoginDone(true)
            toast.success('登录成功，正在跳转...')
            dispatch(loginSuccess({ token, userInfo: user }))
            setTimeout(() => navigate('/home', { replace: true }), 800)
          }, alreadyScanned ? 300 : 1000)
        }
      }
    } catch {
      // 轮询异常静默忽略
    }
  }, [dispatch, stopCheck, navigate])

  const startCheck = useCallback((currentQrId: string) => {
    checkTimerRef.current = setInterval(() => doCheck(currentQrId), 2000)
  }, [doCheck])

  // ---------- 生成二维码 ----------
  const genQRCode = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshLoading(true)
    else setLoading(true)
    setScanned(false)
    setLoginDone(false)
    setQrLoadFailed(false)
    loginHandledRef.current = false
    scannedByIframeRef.current = false
    stopCheck()

    try {
      const result = await dispatch(generateQRCodeThunk()).unwrap()
      if (result.success) {
        const { qrId: ticket, appId, redirectUri } = result.data
        setQrId(ticket)
        setLoading(false)
        setRefreshLoading(false)
        // 等 DOM 更新后再初始化微信组件
        setTimeout(() => {
          initWxLogin(appId, redirectUri, ticket)
          startCheck(ticket)
        }, 0)
      } else {
        setLoading(false)
        setRefreshLoading(false)
        setQrLoadFailed(true)
        toast.error(result.message || '生成二维码失败')
      }
    } catch {
      setLoading(false)
      setRefreshLoading(false)
      setQrLoadFailed(true)
      toast.error('生成二维码失败，请稍后重试')
    }
  }, [dispatch, stopCheck, initWxLogin, startCheck])

  // ---------- 生命周期 ----------
  useEffect(() => {
    const timer = setTimeout(() => setCardEntered(true), 50)
    genQRCode(false)

    const ps = canvasRef.current ? createParticleSystem(canvasRef.current) : null

    return () => {
      clearTimeout(timer)
      stopCheck()
      ps?.stop()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 可交互元素鼠标光晕 ----------
  const onInteractiveMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mouse-x', (e.clientX - r.left) + 'px')
    el.style.setProperty('--mouse-y', (e.clientY - r.top) + 'px')
  }

  const refreshBtnText = refreshLoading ? '正在生成...' : qrLoadFailed ? '加载失败？点击重试' : '二维码过期？点击重新生成'

  return (
    <>
      <style>{`
        .login-page {
          --primary: #10b981;
          --primary-dark: #059669;
          --primary-deep: #052c22;
          --primary-rgb: 16, 185, 129;
          --primary-deep-rgb: 5, 44, 34;
          --text-title: #052c22;
          --text-body: #1f2937;
          --text-muted: #6b7280;
          --surface-subtle: #f9fafb;
          --card-radius: 20px;
          --card-bg: rgba(255,255,255,0.95);
          --radius-sm: 8px;
          --radius-md: 12px;
          --qr-iframe-offset: 12px;
        }
        @media (prefers-color-scheme: dark) {
          .login-page {
            --primary: #34d399;
            --primary-dark: #10b981;
            --primary-deep: #064e3b;
            --primary-rgb: 52, 211, 153;
            --primary-deep-rgb: 6, 78, 59;
            --text-title: #f3f4f6;
            --text-body: #e5e7eb;
            --text-muted: #9ca3af;
            --surface-subtle: #0f172a;
            --card-bg: rgba(15,23,42,0.95);
            background: linear-gradient(135deg, #064e3b 0%, #0f172a 50%, #1e293b 100%) !important;
          }
          .login-card {
            box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 40px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08) inset !important;
            border-color: rgba(255,255,255,0.08) !important;
          }
          .qr-code {
            background: var(--surface-subtle) !important;
            border-color: #334155 !important;
          }
        }

        .login-card {
          background: var(--card-bg);
          backdrop-filter: blur(10px);
          border-radius: var(--card-radius);
          padding: 2px 2px 8px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.08), 0 40px 80px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.05) inset;
          border: 1px solid rgba(255,255,255,0.8);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          opacity: 0;
          transform: translateY(30px) scale(0.96);
          transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
        }
        @media (prefers-reduced-motion: reduce) {
          .login-card { transition-duration: 0.2s; }
        }
        .login-card.is-entered { opacity: 1; transform: translateY(0) scale(1); }

        .qr-code {
          width: 280px; height: 280px;
          margin: 0 auto 16px;
          background: var(--surface-subtle);
          border: 1px solid #e5e7eb;
          border-radius: var(--radius-md);
          display: flex; align-items: center; justify-content: center;
          position: relative; overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
          min-height: 280px;
        }
        .qr-code:hover {
          border-color: var(--primary);
          box-shadow: 0 4px 12px rgba(var(--primary-rgb),0.15);
          background: #fff;
        }
        .qr-code.is-scanned {
          box-shadow: 0 0 0 2px rgba(var(--primary-rgb),0.3);
          animation: scanned-pulse 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .qr-code.is-scanned { animation: none; }
        }
        @keyframes scanned-pulse {
          0%,100% { box-shadow: 0 0 0 2px rgba(var(--primary-rgb),0.3); }
          50% { box-shadow: 0 0 0 3px rgba(var(--primary-rgb),0.45); }
        }
        .qr-code.is-compact { width:120px; min-width:120px; height:120px; min-height:120px; }

        .ring-loader {
          width:48px; height:48px;
          border: 2px solid rgba(var(--primary-rgb),0.2);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.9s linear infinite, ring-pulse 1.5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ring-loader { animation: spin 1.2s linear infinite; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ring-pulse { 0%,100% { opacity:1; } 50% { opacity:0.7; } }

        .refresh-btn {
          position: relative;
          padding: 10px 20px;
          background: var(--primary-deep);
          color: #fff;
          border: none;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        .refresh-btn:hover:not(:disabled) {
          background: var(--primary-dark);
          transform: scale(1.02) translateY(-2px);
          box-shadow: 0 8px 20px rgba(var(--primary-deep-rgb),0.3);
        }
        .refresh-btn:active:not(:disabled) { transform: scale(0.98); }
        .refresh-btn:disabled { cursor: not-allowed; opacity: 0.85; }
        .refresh-btn.is-loading { padding-left: 36px; }
        .refresh-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

        .refresh-spinner {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        .interactive-element { position: relative; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .interactive-element::before {
          content: '';
          position: absolute; top:-4px; left:-4px; right:-4px; bottom:-4px;
          border-radius: inherit;
          background: radial-gradient(circle at var(--mouse-x,50%) var(--mouse-y,50%), rgba(var(--primary-rgb),0.35) 0%, transparent 70%);
          opacity: 0; transition: opacity 0.3s ease; pointer-events: none; z-index: -1;
        }
        .interactive-element:hover::before { opacity: 1; }
        .interactive-element:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(var(--primary-rgb),0.3), 0 0 0 1px rgba(var(--primary-rgb),0.15) inset;
        }
        .interactive-element:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .interactive-element:active { transform: translateY(-1px); }

        .skip-link {
          position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
          padding: 8px 16px;
          background: var(--primary-deep); color: #fff; font-size: 14px;
          border-radius: 8px; z-index: 100; transition: top 0.2s ease;
        }
        .skip-link:focus { top: 16px; outline: 2px solid var(--primary); outline-offset: 2px; }

        .wx-login-wrapper :deep(iframe),
        .wx-login-wrapper iframe {
          max-width: 280px;
          transform: translateY(var(--qr-iframe-offset, 20px));
        }

        @keyframes qr-loading-fade { from { opacity:0; } to { opacity:1; } }
        .qr-loading { animation: qr-loading-fade 0.4s ease; }

        @media (max-width: 480px) {
          .login-card { padding: 28px 20px; }
          .login-title { font-size: 22px !important; }
          .qr-code { width: 240px !important; height: 240px !important; }
        }
        @media (max-width: 360px) {
          .login-title { font-size: 20px !important; }
        }
      `}</style>

      <div
        className="login-page font-sans min-h-screen flex items-center justify-center p-5 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 50%, #e2e8f0 100%)' }}
      >
        <a href="#login-main" className="skip-link">跳到主内容</a>

        <canvas ref={canvasRef} className="fixed inset-0 w-full h-full z-[1] pointer-events-none" aria-hidden="true" />

        <div id="login-main" className="w-full max-w-[360px] relative z-10">
          <div className={`login-card${cardEntered ? ' is-entered' : ''}`}>
            {/* 品牌区 */}
            <div className="text-center mb-3 relative z-[1]">
              <div className="w-12 h-12 mx-auto mb-3" role="img" aria-label="开锤品牌标识" style={{ color: 'var(--primary-deep)' }}>
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                  <path d="M12 8v32M12 24l12-16M12 24l12 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h1 className="login-title text-[26px] font-bold tracking-wide m-0 mb-1" style={{ color: 'var(--text-title)' }}>
                开锤后台管理系统
              </h1>
              <p className="text-sm font-medium tracking-wide m-0" style={{ color: 'var(--text-muted)' }}>
                微信扫码，安全快捷
              </p>
            </div>

            {/* 二维码区域 */}
            <div className="text-center relative z-[1] mt-4 flex flex-col items-center">
              <div
                ref={wxContainerRef}
                id="wx_login_container"
                className={`qr-code wx-login-wrapper${scanned ? ' is-scanned' : ''}${qrLoadFailed ? ' is-compact' : ''}`}
                role="region"
                aria-live="polite"
                aria-label={
                  loginDone ? '登录成功，正在跳转'
                  : loading ? '正在生成二维码'
                  : scanned ? '扫码成功，正在登录'
                  : qrLoadFailed ? '二维码加载失败，可点击重新生成'
                  : '请使用微信扫一扫扫描二维码'
                }
              >
                {loading && (
                  <div className="qr-loading flex flex-col items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }} role="status" aria-live="polite">
                    <div className="ring-loader" />
                    <p>正在生成二维码...</p>
                  </div>
                )}
              </div>

              <p
                className="inline-flex items-center justify-center gap-1.5 text-base font-medium mb-2"
                style={{ color: scanned ? 'var(--primary)' : 'var(--text-body)', fontWeight: scanned ? 600 : 500 }}
              >
                {scanned && (
                  <span className="inline-flex" style={{ color: 'var(--primary)' }} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[18px] h-[18px]">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  </span>
                )}
                {loginDone ? '登录成功' : scanned ? '扫码成功' : '请使用微信扫一扫扫描二维码'}
              </p>

              {scanned && !loginDone && (
                <p className="text-[13px] -mt-1 mb-2 font-normal" style={{ color: 'var(--text-muted)' }}>
                  请在手机上点击「确认登录」完成登录
                </p>
              )}
              {loginDone && (
                <p className="text-[13px] -mt-1 mb-2 font-normal" style={{ color: 'var(--primary)' }}>
                  正在跳转到首页...
                </p>
              )}

              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {(qrId || qrLoadFailed) && (
                  <button
                    type="button"
                    className={`refresh-btn${refreshLoading ? ' is-loading' : ''}`}
                    disabled={refreshLoading}
                    aria-busy={refreshLoading}
                    onClick={() => genQRCode(true)}
                  >
                    {refreshLoading && <span className="refresh-spinner" aria-hidden="true" />}
                    {refreshBtnText}
                  </button>
                )}
              </div>
            </div>

            {/* 底部 */}
            <div className="text-center mt-auto pt-6 text-sm relative z-[1]" style={{ color: 'var(--text-muted)' }}>
              <a
                href="#"
                className="interactive-element"
                aria-label="联系管理员获取帮助"
                style={{ color: 'var(--primary)', textDecoration: 'none' }}
                onClick={e => { e.preventDefault(); toast.info('请联系管理员') }}
                onMouseMove={onInteractiveMove}
              >
                联系管理员
              </a>
              <div className="w-20 h-px mx-auto mt-3 opacity-30" style={{ background: 'var(--text-muted)' }} aria-hidden="true" />
              <p className="text-xs mt-3 opacity-90" style={{ color: 'var(--text-muted)' }}>采用微信官方安全登录</p>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                网站备案号：
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noopener"
                  style={{ color: 'var(--primary)', textDecoration: 'none' }}
                >
                  粤ICP备2025505541号-2
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
