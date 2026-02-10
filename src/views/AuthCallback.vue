<template>
  <div class="auth-callback">
    <div class="loading-card">
      <div class="spinner" />
      <p>登录成功，正在跳转到首页...</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

onMounted(() => {
  const token = route.query.token
  if (!token) {
    router.replace('/login')
    return
  }
  // 后端已用 code 换好 token 并重定向到此页，直接信任该 token 并写入，然后跳首页。
  // 不要在此处调用 checkLoginStatus()：其内部在 /auth/verify 失败时会 logout()，
  // 导致 token 被清空，随后 replace('/home') 时路由守卫发现未登录又重定向回 /login，形成死循环。
  // 用户信息可在进入 Home 后再通过 verify 或接口拉取。
  authStore.loginSuccess(token, {})
  router.replace('/home')
})
</script>

<style scoped>
.auth-callback {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 50%, #e2e8f0 100%);
}
.loading-card {
  background: rgba(255, 255, 255, 0.95);
  padding: 40px 48px;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
  text-align: center;
}
.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 20px;
  border: 3px solid rgba(16, 185, 129, 0.2);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.loading-card p {
  margin: 0;
  font-size: 15px;
  color: #6b7280;
}
</style>
