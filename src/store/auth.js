import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import Cookies from 'js-cookie'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://www.kaichui.com.cn/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(Cookies.get('token') || '')
  const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || 'null'))
  const loading = ref(false)

  const isLoggedIn = computed(() => !!token.value)

  // 检查登录状态（失败时会 logout，用于需要严格校验的场景）
  const checkLoginStatus = async () => {
    if (!token.value) return false
    
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/verify`, {
        headers: {
          Authorization: `Bearer ${token.value}`
        }
      })
      
      if (response.data.success) {
        userInfo.value = response.data.data
        return true
      } else {
        logout()
        return false
      }
    } catch (error) {
      logout()
      return false
    }
  }

  // 仅拉取用户信息，失败时不清 token、不登出（用于回调后或首页补充 userInfo）
  const fetchUserInfo = async () => {
    if (!token.value) return false
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/verify`, {
        headers: { Authorization: `Bearer ${token.value}` }
      })
      if (response.data.success) {
        userInfo.value = response.data.data
        return true
      }
    } catch (_) {
      // 不 logout，保留登录态
    }
    return false
  }

  // 生成登录二维码
  const generateQRCode = async () => {
    try {
      loading.value = true
      const response = await axios.post(`${API_BASE_URL}/auth/qrcode`)
      return response.data
    } catch (error) {
      console.error('生成二维码失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 检查登录状态（轮询）
  const checkLoginStatusByQRCode = async (qrId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/check-status/${qrId}`)
      return response.data
    } catch (error) {
      console.error('检查登录状态失败:', error)
      throw error
    }
  }

  // 登录成功
  const loginSuccess = (tokenData, userData) => {
    token.value = tokenData
    userInfo.value = userData
    Cookies.set('token', tokenData, { expires: 7 })
    localStorage.setItem('userInfo', JSON.stringify(userData))
  }

  // 登出
  const logout = () => {
    token.value = ''
    userInfo.value = null
    Cookies.remove('token')
    localStorage.removeItem('userInfo')
  }

  return {
    token,
    userInfo,
    loading,
    isLoggedIn,
    checkLoginStatus,
    fetchUserInfo,
    generateQRCode,
    checkLoginStatusByQRCode,
    loginSuccess,
    logout
  }
})
