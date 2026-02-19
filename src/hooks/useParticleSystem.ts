import { useEffect, useRef } from 'react'

/**
 * 粒子网络背景动画。接受 canvas ref，自动处理 resize / mousemove / 清理。
 * 尊重 prefers-reduced-motion。
 */
export function useParticleSystem() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d')!
    const COUNT = 80
    const MAX_SPEED = 1.5
    const LINK_DIST = 150
    const REPEL_DIST = 150

    type P = { x: number; y: number; vx: number; vy: number; r: number; o: number }
    let particles: P[] = []
    let mouse = { x: 0, y: 0 }
    let running = true
    let rafId = 0

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      particles = Array.from({ length: COUNT }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2.5 + 1.5,
        o: Math.random() * 0.4 + 0.35,
      }))
    }

    function frame() {
      if (!running) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > canvas.width)  p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
        const dx = p.x - mouse.x, dy = p.y - mouse.y
        const d = Math.hypot(dx, dy)
        if (d < REPEL_DIST && d > 0) {
          const f = (REPEL_DIST - d) / REPEL_DIST
          p.vx += (dx / d) * f * 0.035
          p.vy += (dy / d) * f * 0.035
        }
        const spd = Math.hypot(p.vx, p.vy)
        if (spd > MAX_SPEED) { p.vx = (p.vx / spd) * MAX_SPEED; p.vy = (p.vy / spd) * MAX_SPEED }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(5,44,34,${p.o})`
        ctx.fill()
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const d = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y)
          if (d < LINK_DIST) {
            ctx.strokeStyle = `rgba(5,44,34,${(1 - d / LINK_DIST) * 0.35})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
      rafId = requestAnimationFrame(frame)
    }

    const onMouse = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY }
    window.addEventListener('resize', resize)
    document.addEventListener('mousemove', onMouse)
    resize()
    frame()

    return () => {
      running = false
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      document.removeEventListener('mousemove', onMouse)
    }
  }, [])

  return canvasRef
}
