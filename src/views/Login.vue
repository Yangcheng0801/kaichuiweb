<template>
  <div class="login-page">
    <a href="#login-main" class="skip-link">跳到主内容</a>
    <canvas ref="particlesCanvas" class="particles-canvas" aria-hidden="true" />
    <div id="login-main" class="login-container">
      <div class="login-card" :class="{ 'is-entered': cardEntered }">
        <div class="login-header">
          <div class="login-logo" role="img" aria-label="开锤品牌标识">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 8v32M12 24l12-16M12 24l12 16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1 class="login-title">开锤后台管理系统</h1>
          <p class="login-subtitle">微信扫码，安全快捷</p>
        </div>
        <div class="qr-code-container">
          <div
            ref="wxLoginContainer"
            id="wx_login_container"
            class="qr-code wx-login-wrapper"
            :class="{ 'is-scanned': scanned, 'is-compact': qrLoadFailed }"
            role="region"
            aria-live="polite"
            :aria-label="qrAriaLabel"
          >
            <div v-if="loading" class="qr-loading" role="status" aria-live="polite" aria-label="正在生成二维码">
              <div class="ring-loader" />
              <p>正在生成二维码...</p>
            </div>
          </div>
          <p class="qr-tip" :class="{ 'is-scanned': scanned }">
            <span v-if="scanned" class="qr-tip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
            </span>
            {{ scanned ? '扫码成功' : '请使用微信扫一扫扫描二维码' }}
          </p>
          <p v-if="scanned" class="qr-tip-sub">请在手机上点击「确认登录」完成登录</p>
          <div class="qr-refresh">
            <button
              v-if="qrId || qrLoadFailed"
              type="button"
              class="refresh-btn"
              :class="{ 'is-loading': refreshLoading }"
              :disabled="refreshLoading"
              :aria-busy="refreshLoading"
              :aria-label="refreshAriaLabel"
              @click="refreshQRCode"
            >
              <span v-if="refreshLoading" class="refresh-spinner" aria-hidden="true" />
              {{ refreshBtnText }}
            </button>
          </div>
        </div>
        <div class="login-footer">
          <a href="#" class="interactive-element login-footer-link" aria-label="联系管理员获取帮助" @click.prevent="contactAdmin" @mousemove="onInteractiveMove">联系管理员</a>
          <div class="login-footer-divider" aria-hidden="true" />
          <p class="login-footer-security">采用微信官方安全登录</p>
          <p class="login-footer-icp">
            网站备案号：
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">粤ICP备2025505541号-2</a>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth'
import { ElMessage } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()

const qrId = ref('')
const loading = ref(true)
const refreshLoading = ref(false)
const qrLoadFailed = ref(false)
const checkTimer = ref(null)
const cardEntered = ref(false)
const scanned = ref(false)

const qrAriaLabel = computed(() => {
  if (loading.value) return '正在生成二维码'
  if (scanned.value) return '已扫码，请在手机上确认登录'
  if (qrLoadFailed.value) return '二维码加载失败，可点击重新生成'
  return '请使用微信扫一扫扫描二维码'
})

const refreshAriaLabel = computed(() =>
  refreshLoading.value ? '正在重新生成二维码' : (qrLoadFailed.value ? '加载失败，点击重试' : '二维码过期，点击重新生成')
)

const refreshBtnText = computed(() => {
  if (refreshLoading.value) return '正在生成...'
  if (qrLoadFailed.value) return '加载失败？点击重试'
  return '二维码过期？点击重新生成'
})
const particlesCanvas = ref(null)
const wxLoginContainer = ref(null)
let particleSystem = null

// ---------- 粒子系统：支持 prefers-reduced-motion 减少动画 ----------
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function createParticleSystem(canvas) {
  if (!canvas) return null
  if (prefersReducedMotion()) return { stop: () => {} } // 用户偏好减少动效时不渲染粒子
  const ctx = canvas.getContext('2d')
  let particles = []
  const particleCount = 80
  let mouse = { x: 0, y: 0 }
  let running = true
  let rafId = null

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
          const opacity = (1 - d / 150) * 0.35
          ctx.strokeStyle = `rgba(5, 44, 34, ${opacity})`
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
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1
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
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed
        p.vy = (p.vy / speed) * maxSpeed
      }
    })
  }

  function animate() {
    if (!running) return
    update()
    draw()
    rafId = requestAnimationFrame(animate)
  }

  const boundMouse = (e) => { mouse.x = e.clientX; mouse.y = e.clientY }
  const boundResize = () => resize()

  window.addEventListener('resize', boundResize)
  document.addEventListener('mousemove', boundMouse)
  resize()
  animate()

  return {
    stop() {
      running = false
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', boundResize)
      document.removeEventListener('mousemove', boundMouse)
    }
  }
}

// ---------- 可交互元素：鼠标跟随光晕（方案2 增强：更强 glow、-3px 上浮、更深阴影） ----------
function onInteractiveMove(e) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mouse-x', (e.clientX - r.left) + 'px')
  el.style.setProperty('--mouse-y', (e.clientY - r.top) + 'px')
}

function contactAdmin() {
  ElMessage.info('请联系管理员')
}

// ---------- 登录逻辑：使用官方 WxLogin 组件，二维码含会话 ID，扫码后显示「确认登录」----------
const initWxLogin = (appId, redirectUri, state) => {
  if (!window.WxLogin || !wxLoginContainer.value) return
  wxLoginContainer.value.innerHTML = ''
  new window.WxLogin({
    self_redirect: true,
    id: 'wx_login_container',
    appid: appId,
    scope: 'snsapi_login',
    redirect_uri: encodeURIComponent(redirectUri),
    state: state,
    style: 'black',
    href: ''
  })
}

const generateQRCode = async (isRefresh = false) => {
  try {
    if (isRefresh) refreshLoading.value = true
    else loading.value = true
    scanned.value = false
    qrLoadFailed.value = false
    stopCheckLoginStatus()

    const result = await authStore.generateQRCode()

    if (result.success) {
      const { qrId: ticket, appId, redirectUri } = result.data
      qrId.value = ticket
      qrLoadFailed.value = false
      loading.value = false
      refreshLoading.value = false
      await nextTick()
      initWxLogin(appId, redirectUri, ticket)
      startCheckLoginStatus()
    } else {
      loading.value = false
      refreshLoading.value = false
      qrLoadFailed.value = true
      ElMessage.error(result.message || '生成二维码失败')
    }
  } catch (error) {
    loading.value = false
    refreshLoading.value = false
    qrLoadFailed.value = true
    console.error('生成二维码失败:', error)
    ElMessage.error('生成二维码失败，请稍后重试')
  }
}

const refreshQRCode = () => {
  generateQRCode(true)
}

const checkLoginStatus = async () => {
  try {
    const result = await authStore.checkLoginStatusByQRCode(qrId.value)

    if (result.success) {
      const { status, token, user } = result.data

      if (status === 'scanned') {
        scanned.value = true
        ElMessage.info('已扫描，请在手机上确认登录')
      } else if (status === 'confirmed') {
        // 已确认登录：先在当前页面明显展示“扫码成功”，再稍后跳转
        scanned.value = true
        authStore.loginSuccess(token, user)
        ElMessage.success('登录成功')
        stopCheckLoginStatus()
        // 给用户 800ms 时间看到「扫码成功」提示，再跳转首页
        setTimeout(() => {
          router.push('/home')
        }, 800)
      }
    }
  } catch (error) {
    console.error('检查登录状态失败:', error)
  }
}

const startCheckLoginStatus = () => {
  checkTimer.value = setInterval(() => checkLoginStatus(), 2000)
}

const stopCheckLoginStatus = () => {
  if (checkTimer.value) {
    clearInterval(checkTimer.value)
    checkTimer.value = null
  }
}

onMounted(() => {
  setTimeout(() => { cardEntered.value = true }, 50)
  generateQRCode(false)
  if (particlesCanvas.value) {
    particleSystem = createParticleSystem(particlesCanvas.value)
  }
})

onUnmounted(() => {
  stopCheckLoginStatus()
  particleSystem?.stop()
})
</script>

<style scoped>
/* ---------- 1. 视觉层次与品牌感：CSS 变量 ---------- */
.login-page {
  /* 主题色（后续改主题/暗色模式可直接改变量） */
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
  --card-bg: rgba(255, 255, 255, 0.95);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --qr-iframe-offset: 12px;

  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 50%, #e2e8f0 100%);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  overflow: hidden;
}

/* 可访问性：跳过链接 */
.skip-link {
  position: absolute;
  top: -100px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: var(--primary-deep);
  color: #fff;
  font-size: 14px;
  border-radius: 8px;
  z-index: 100;
  transition: top 0.2s ease;
}
.skip-link:focus {
  top: 16px;
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.particles-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.login-container {
  width: 100%;
  max-width: 360px;
  position: relative;
  z-index: 10;
}

/* 2. 卡片：阴影增强悬浮感，flex 垂直分布 */
.login-card {
  background: var(--card-bg);
  backdrop-filter: blur(10px);
  border-radius: var(--card-radius);
  min-height: 40px;
  padding: 2px 2px 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08), 0 40px 80px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.05) inset;
  border: 1px solid rgba(255, 255, 255, 0.8);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0;
  transform: translateY(30px) scale(0.96);
  transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .login-card {
    transition-duration: 0.2s;
  }
}

.login-card.is-entered {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* 品牌区：Logo + 标题 + 副标题 */
.login-header {
  text-align: center;
  margin-bottom: 12px;
  position: relative;
  z-index: 1;
}

.login-logo {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  color: var(--primary-deep);
}
.login-logo svg {
  width: 100%;
  height: 100%;
}

/* 1. 标题：26px、letter-spacing、变量色 */
.login-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-title);
  margin: 0 0 4px;
}

/* 1. 副标题：font-weight 与正文区分 */
.login-subtitle {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--text-muted);
  margin: 0;
}

.qr-code-container {
  text-align: center;
  position: relative;
  z-index: 1;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 可交互元素：光晕；4. 链接不加 overflow 以免裁掉焦点环 */
.interactive-element {
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.interactive-element::before {
  content: '';
  position: absolute;
  top: -4px;
  left: -4px;
  right: -4px;
  bottom: -4px;
  border-radius: inherit;
  background: radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(var(--primary-rgb), 0.35) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: -1;
}

.interactive-element:hover::before {
  opacity: 1;
}

.interactive-element:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(var(--primary-rgb), 0.3), 0 0 0 1px rgba(var(--primary-rgb), 0.15) inset;
}

/* 3. 二维码区域：1px 细实线，hover 高亮；变量化背景与圆角 */
.qr-code {
  width: 280px;
  height: 280px;
  margin: 0 auto 16px;
  background: var(--surface-subtle);
  border: 1px solid #e5e7eb;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.qr-code:hover {
  border-color: var(--primary);
  box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.15);
  background: #fff;
}

/* 4. 扫码成功：呼吸脉动，等待确认状态更明显 */
.qr-code.is-scanned {
  box-shadow: 0 0 0 2px rgba(var(--primary-rgb), 0.3);
  animation: scanned-pulse 2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .qr-code.is-scanned {
    animation: none;
  }
}

@keyframes scanned-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(var(--primary-rgb), 0.3); }
  50% { box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.45); }
}

/* 加载失败时紧凑布局：保持正方形 */
.qr-code.is-compact.wx-login-wrapper {
  width: 120px;
  min-width: 120px;
  height: 120px;
  min-height: 120px;
}

/* 3. 加载态：淡入动画 */
.qr-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 14px;
  animation: qr-loading-fade 0.4s ease;
}

@keyframes qr-loading-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 3. ring-loader：ring-pulse 轻微脉动 */
.ring-loader {
  width: 48px;
  height: 48px;
  border: 2px solid rgba(var(--primary-rgb), 0.2);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.9s linear infinite, ring-pulse 1.5s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .ring-loader {
    animation: spin 1.2s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes ring-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.qr-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 16px;
  color: var(--text-body);
  margin-bottom: 8px;
  font-weight: 500;
}

.qr-tip-icon {
  display: inline-flex;
  color: var(--primary);
}
.qr-tip-icon svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* 扫码成功待确认：主提示高亮 */
.qr-tip.is-scanned {
  color: var(--primary);
  font-weight: 600;
}

.qr-tip-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin: -4px 0 8px;
  font-weight: 400;
}

.qr-refresh {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

/* 3. 重新生成按钮：圆角变量、loading 态 */
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
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.refresh-btn:hover:not(:disabled) {
  background: var(--primary-dark);
  transform: scale(1.02) translateY(-2px);
  box-shadow: 0 8px 20px rgba(var(--primary-deep-rgb), 0.3);
}

.refresh-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.85;
}

.refresh-btn.is-loading {
  padding-left: 36px;
}

.refresh-spinner {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.refresh-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.wx-login-wrapper {
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 将 iframe 下移，抵消微信组件底部留白，使二维码在容器内视觉居中 */
.wx-login-wrapper :deep(iframe) {
  max-width: 280px;
  transform: translateY(var(--qr-iframe-offset, 20px));
}

.login-footer {
  text-align: center;
  margin-top: auto;
  padding-top: 24px;
  font-size: 14px;
  color: var(--text-muted);
  position: relative;
  z-index: 1;
}

/* Footer 分隔线：max-width 避免小屏过宽 */
.login-footer-divider {
  width: 100%;
  max-width: 80px;
  height: 1px;
  margin: 12px auto 0;
  background: var(--text-muted);
  opacity: 0.3;
}

.login-footer a {
  color: var(--primary);
  text-decoration: none;
}

.login-footer a:hover {
  text-decoration: underline;
}

.login-footer-link:active {
  transform: translateY(-1px);
}

/* 5. 可访问性：焦点样式 */
.login-footer-link:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* 6. 加分项：安全提示 */
.login-footer-security {
  font-size: 12px;
  color: var(--text-muted);
  margin: 12px 0 0;
  opacity: 0.9;
}

/* 备案号（工信部要求展示在首页底部并链接到工信部） */
.login-footer-icp {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.login-footer-icp a {
  color: var(--primary);
  text-decoration: none;
}
.login-footer-icp a:hover {
  text-decoration: underline;
}

/* 5. 移动端：小屏更舒适 */
@media (max-width: 480px) {
  .login-card {
    padding: 28px 20px;
  }

  .login-title {
    font-size: 22px;
  }

  .qr-code {
    width: 240px;
    height: 240px;
  }
}

@media (max-width: 360px) {
  .login-title {
    font-size: 20px;
  }
}

/* 暗色模式 */
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
    --card-bg: rgba(15, 23, 42, 0.95);
  }

  .login-page {
    background: linear-gradient(135deg, #064e3b 0%, #0f172a 50%, #1e293b 100%);
  }

  .login-card {
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 40px 80px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .qr-code {
    background: var(--surface-subtle);
    border-color: #334155;
  }

  .qr-code:hover {
    background: #1e293b;
    border-color: var(--primary);
  }

  .qr-loading,
  .qr-tip {
    color: var(--text-body);
  }
}
</style>
