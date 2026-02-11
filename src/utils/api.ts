import axios from 'axios'
import { toast } from 'sonner'

// 创建axios实例
const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000
})

// 请求拦截器
service.interceptors.request.use(
  config => {
    // 从cookie中获取token
    const token = document.cookie.replace(/(?:(?:^|.*;\s*)token\s*=\s*([^;]*).*$)|^.*$/, '$1')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  error => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  response => {
    const res = response.data

    // 后端统一返回 { success: boolean }，不含 code 字段
    if (res.success !== true) {
      toast.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }

    return res
  },
  error => {
    console.error('响应错误:', error)

    if (error.response) {
      const { status, data } = error.response

      switch (status) {
        case 401:
          toast.error('未授权，请重新登录')
          window.location.href = '/login'
          break
        case 403:
          toast.error('拒绝访问')
          break
        case 404:
          toast.error('请求的资源不存在')
          break
        case 500:
          toast.error('服务器错误')
          break
        default:
          toast.error(data?.message || `请求失败 (${status})`)
      }
    } else if (error.message?.includes('timeout')) {
      toast.error('请求超时')
    } else if (error.message?.includes('Network Error')) {
      toast.error('网络错误，请检查网络连接')
    } else {
      toast.error(error.message || '请求失败')
    }

    return Promise.reject(error)
  }
)

export default service

// API方法
export const api = {
  // 用户管理
  users: {
    getList: (params?: object) => service.get('/users', { params }),
    getDetail: (id: string) => service.get(`/users/${id}`),
    create: (data: object) => service.post('/users', data),
    update: (id: string, data: object) => service.put(`/users/${id}`, data),
    delete: (id: string) => service.delete(`/users/${id}`)
  },

  // 租户管理
  tenants: {
    getList: (params?: object) => service.get('/tenants', { params }),
    getDetail: (id: string) => service.get(`/tenants/${id}`),
    create: (data: object) => service.post('/tenants', data),
    update: (id: string, data: object) => service.put(`/tenants/${id}`, data),
    delete: (id: string) => service.delete(`/tenants/${id}`)
  },

  // 配额管理
  quotas: {
    getList: (params?: object) => service.get('/quotas', { params }),
    getDetail: (id: string) => service.get(`/quotas/${id}`),
    update: (id: string, data: object) => service.put(`/quotas/${id}`, data),
    reset: (id: string) => service.post(`/quotas/${id}/reset`)
  },

  // 预订管理
  bookings: {
    getList:     (params?: object) => service.get('/bookings', { params }),
    getTeeSheet: (params: { date: string; courseId?: string }) => service.get('/bookings/tee-sheet', { params }),
    getDetail:   (id: string) => service.get(`/bookings/${id}`),
    create:      (data: object) => service.post('/bookings', data),
    update:      (id: string, data: object) => service.put(`/bookings/${id}`, data),
    delete:      (id: string) => service.delete(`/bookings/${id}`),
    confirm:     (id: string) => service.put(`/bookings/${id}`, { status: 'confirmed' }),
    checkIn:     (id: string) => service.put(`/bookings/${id}`, { status: 'checked_in' }),
    complete:    (id: string) => service.put(`/bookings/${id}`, { status: 'completed' }),
    cancel:      (id: string, note?: string) => service.put(`/bookings/${id}`, { status: 'cancelled', cancelNote: note }),
  },

  // 资源管理
  resources: {
    courses: {
      getList: (params?: object) => service.get('/resources/courses', { params }),
      getDetail: (id: string) => service.get(`/resources/courses/${id}`),
      create: (data: object) => service.post('/resources/courses', data),
      update: (id: string, data: object) => service.put(`/resources/courses/${id}`, data),
      delete: (id: string) => service.delete(`/resources/courses/${id}`),
    },
    caddies: {
      getList: (params?: object) => service.get('/resources/caddies', { params }),
      getDetail: (id: string) => service.get(`/resources/caddies/${id}`),
      create: (data: object) => service.post('/resources/caddies', data),
      update: (id: string, data: object) => service.put(`/resources/caddies/${id}`, data),
      delete: (id: string) => service.delete(`/resources/caddies/${id}`),
    },
    carts: {
      getList: (params?: object) => service.get('/resources/carts', { params }),
      getDetail: (id: string) => service.get(`/resources/carts/${id}`),
      create: (data: object) => service.post('/resources/carts', data),
      update: (id: string, data: object) => service.put(`/resources/carts/${id}`, data),
      delete: (id: string) => service.delete(`/resources/carts/${id}`),
    },
  },

  // 系统设置
  settings: {
    getClubInfo: (clubId = 'default') => service.get('/settings/club', { params: { clubId } }),
    updateClubInfo: (data: object) => service.put('/settings/club', data),
    getBookingRules: (clubId = 'default') => service.get('/settings/booking-rules', { params: { clubId } }),
    updateBookingRules: (data: object) => service.put('/settings/booking-rules', data),
    getPricingRules: (clubId = 'default') => service.get('/settings/pricing-rules', { params: { clubId } }),
    updatePricingRules: (data: object) => service.put('/settings/pricing-rules', data),
  }
}
