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
  // 首页仪表盘
  dashboard: {
    getData: (params?: { clubId?: string }) => service.get('/dashboard', { params }),
  },

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
    // 列表 / 查询
    getList:     (params?: object) => service.get('/bookings', { params }),
    getTeeSheet: (params: { date: string; courseId?: string }) => service.get('/bookings/tee-sheet', { params }),
    getDetail:   (id: string) => service.get(`/bookings/${id}`),
    // 创建 / 更新 / 删除
    create:      (data: object) => service.post('/bookings', data),
    update:      (id: string, data: object) => service.put(`/bookings/${id}`, data),
    delete:      (id: string) => service.delete(`/bookings/${id}`),
    // 状态流转快捷方法
    confirm:     (id: string, extra?: object) => service.put(`/bookings/${id}`, { status: 'confirmed', ...extra }),
    checkIn:     (id: string, extra?: object) => service.put(`/bookings/${id}`, { status: 'checked_in', ...extra }),
    complete:    (id: string, extra?: object) => service.put(`/bookings/${id}`, { status: 'completed', ...extra }),
    cancel:      (id: string, note?: string, extra?: object) => service.put(`/bookings/${id}`, { status: 'cancelled', statusNote: note, ...extra }),
    // 收款（v2）
    pay:         (id: string, data: { amount: number; payMethod: string; note?: string; operatorId?: string; operatorName?: string }) => service.post(`/bookings/${id}/pay`, data),
    getPayments: (id: string) => service.get(`/bookings/${id}/payments`),
    // 到访资源分配（签到时更新球车/更衣柜/客房等）
    updateResources: (id: string, data: object) => service.put(`/bookings/${id}/resources`, data),
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

  // 球车管理（新 - 与小程序对齐，需 JWT）
  cartManagement: {
    getStatistics: (params?: { date?: string }) => service.get('/carts/statistics', { params }),
    getList: (params?: object) => service.get('/carts', { params }),
    getBrands: () => service.get('/carts/brands'),
    create: (data: { brand: string; cartNumber: string }) => service.post('/carts', data),
    batchCreate: (data: { brand: string; numbers: string[] }) => service.post('/carts/batch', data),
    update: (id: string, data: object) => service.put(`/carts/${id}`, data),
    batchUpdateStatus: (data: { cartIds: string[]; status: string }) => service.put('/carts/batch-status', data),
    delete: (data: { cartId?: string; cartIds?: string[] }) => service.delete('/carts', { data }),
    getUsageList: (params?: object) => service.get('/carts/usage', { params }),
    getUsageDetail: (id: string) => service.get(`/carts/usage/${id}`),
  },
  maintenance: {
    getList: (params?: object) => service.get('/maintenance', { params }),
    complete: (id: string, data?: { notes?: string; cost?: number }) => service.put(`/maintenance/${id}/complete`, data || {}),
    getFaultAnalysis: (params?: { date?: string }) => service.get('/maintenance/fault-analysis', { params }),
    getFaultTypes: () => service.get('/maintenance/fault-types'),
  },

  // 球员管理（平台级球员 + 球场档案 + 充值）
  players: {
    search:          (params: { q: string; clubId?: string }) => service.get('/players/search', { params }),
    getList:         (params?: object) => service.get('/players', { params }),
    getDetail:       (id: string, params?: { clubId?: string }) => service.get(`/players/${id}`, { params }),
    create:          (data: object) => service.post('/players', data),
    update:          (id: string, data: object) => service.put(`/players/${id}`, data),
    updateProfile:   (id: string, data: object) => service.put(`/players/${id}/profile`, data),
    recharge:        (id: string, data: { clubId: string; amount: number; payMethod?: string; note?: string }) => service.post(`/players/${id}/recharge`, data),
    refreshQrcode:   (id: string) => service.post(`/players/${id}/refresh-qrcode`),
    addVehicle:      (id: string, data: { plateNo: string; brand?: string; color?: string; isPrimary?: boolean }) => service.post(`/players/${id}/vehicles`, data),
    delete:          (id: string) => service.delete(`/players/${id}`),
  },

  // 更衣柜管理
  lockers: {
    getList:  (params?: object) => service.get('/lockers', { params }),
    getStats: () => service.get('/lockers/stats'),
    getDetail:(id: string) => service.get(`/lockers/${id}`),
    create:   (data: object) => service.post('/lockers', data),
    update:   (id: string, data: object) => service.put(`/lockers/${id}`, data),
    remove:   (id: string) => service.delete(`/lockers/${id}`),
  },

  // 客房管理
  rooms: {
    getList:  (params?: object) => service.get('/rooms', { params }),
    getStats: () => service.get('/rooms/stats'),
    getDetail:(id: string) => service.get(`/rooms/${id}`),
    create:   (data: object) => service.post('/rooms', data),
    update:   (id: string, data: object) => service.put(`/rooms/${id}`, data),
    remove:   (id: string) => service.delete(`/rooms/${id}`),
  },

  // 临时消费卡管理
  tempCards: {
    getList:    (params?: object) => service.get('/temp-cards', { params }),
    create:     (data: object) => service.post('/temp-cards', data),
    issue:      (data: { cardId: string; bookingId: string; playerName?: string }) => service.post('/temp-cards/issue', data),
    returnCard: (data: { cardId: string }) => service.post('/temp-cards/return', data),
    generate:   (data: { bookingId: string; playerName?: string; clubId?: string }) => service.post('/temp-cards/generate', data),
    remove:     (id: string) => service.delete(`/temp-cards/${id}`),
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
