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

  // 统一消费 / 挂账中心 (Folio)
  folios: {
    getList:      (params?: object) => service.get('/folios', { params }),
    getActive:    (params?: { clubId?: string }) => service.get('/folios/active', { params }),
    getStats:     (params?: { clubId?: string }) => service.get('/folios/stats', { params }),
    lookup:       (params: { cardNo?: string; bookingId?: string; clubId?: string }) => service.get('/folios/lookup', { params }),
    getDetail:    (id: string) => service.get(`/folios/${id}`),
    getCharges:   (id: string) => service.get(`/folios/${id}/charges`),
    create:       (data: object) => service.post('/folios', data),
    addCharge:    (id: string, data: object) => service.post(`/folios/${id}/charges`, data),
    addChargesBatch: (id: string, data: { items: object[] }) => service.post(`/folios/${id}/charges/batch`, data),
    voidCharge:   (id: string, chargeId: string, data?: { reason?: string }) => service.post(`/folios/${id}/charges/${chargeId}/void`, data || {}),
    addPayment:   (id: string, data: object) => service.post(`/folios/${id}/payments`, data),
    settle:       (id: string, data?: { operatorId?: string; force?: boolean }) => service.post(`/folios/${id}/settle`, data || {}),
    voidFolio:    (id: string) => service.post(`/folios/${id}/void`),
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
    getList:    (params?: object) => service.get('/lockers', { params }),
    getStats:   () => service.get('/lockers/stats'),
    getDetail:  (id: string) => service.get(`/lockers/${id}`),
    create:     (data: object) => service.post('/lockers', data),
    update:     (id: string, data: object) => service.put(`/lockers/${id}`, data),
    remove:     (id: string) => service.delete(`/lockers/${id}`),
    issueKey:   (id: string, data: object) => service.post(`/lockers/${id}/issue-key`, data),
    returnKey:  (id: string, data?: object) => service.post(`/lockers/${id}/return-key`, data || {}),
    getUsageLogs: (id: string) => service.get(`/lockers/${id}/usage-logs`),
  },

  // 更衣柜租赁合同
  lockerContracts: {
    getList:      (params?: object) => service.get('/locker-contracts', { params }),
    getExpiring:  (params?: { clubId?: string; days?: number }) => service.get('/locker-contracts/expiring', { params }),
    create:       (data: object) => service.post('/locker-contracts', data),
    update:       (id: string, data: object) => service.put(`/locker-contracts/${id}`, data),
    renew:        (id: string, data: object) => service.post(`/locker-contracts/${id}/renew`, data),
    terminate:    (id: string) => service.post(`/locker-contracts/${id}/terminate`),
  },

  // 客房管理
  rooms: {
    getList:    (params?: object) => service.get('/rooms', { params }),
    getStats:   () => service.get('/rooms/stats'),
    getRack:    (params?: object) => service.get('/rooms/rack', { params }),
    getDetail:  (id: string) => service.get(`/rooms/${id}`),
    create:     (data: object) => service.post('/rooms', data),
    update:     (id: string, data: object) => service.put(`/rooms/${id}`, data),
    remove:     (id: string) => service.delete(`/rooms/${id}`),
    checkIn:    (id: string, data: object) => service.put(`/rooms/${id}/check-in`, data),
    checkOut:   (id: string) => service.put(`/rooms/${id}/check-out`),
  },

  // 客房清洁任务
  housekeeping: {
    getTasks:  (params?: object) => service.get('/housekeeping/tasks', { params }),
    create:    (data: object) => service.post('/housekeeping/tasks', data),
    start:     (id: string, data?: object) => service.put(`/housekeeping/tasks/${id}/start`, data || {}),
    complete:  (id: string) => service.put(`/housekeeping/tasks/${id}/complete`),
    inspect:   (id: string, data?: object) => service.put(`/housekeeping/tasks/${id}/inspect`, data || {}),
  },

  // 住宿套餐
  stayPackages: {
    getList:   (params?: object) => service.get('/stay-packages', { params }),
    create:    (data: object) => service.post('/stay-packages', data),
    update:    (id: string, data: object) => service.put(`/stay-packages/${id}`, data),
    remove:    (id: string) => service.delete(`/stay-packages/${id}`),
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

  // 餐饮消费点
  diningOutlets: {
    getList:   (params?: object) => service.get('/dining-outlets', { params }),
    create:    (data: object) => service.post('/dining-outlets', data),
    update:    (id: string, data: object) => service.put(`/dining-outlets/${id}`, data),
    remove:    (id: string) => service.delete(`/dining-outlets/${id}`),
  },

  // 餐台
  tables: {
    getList:   (params?: object) => service.get('/tables', { params }),
    create:    (data: object) => service.post('/tables', data),
    createBatch: (data: object) => service.post('/tables/batch', data),
    update:    (id: string, data: object) => service.put(`/tables/${id}`, data),
    remove:    (id: string) => service.delete(`/tables/${id}`),
  },

  // 菜单
  menu: {
    getCategories:    (params?: object) => service.get('/menu/categories', { params }),
    createCategory:   (data: object) => service.post('/menu/categories', data),
    updateCategory:   (id: string, data: object) => service.put(`/menu/categories/${id}`, data),
    removeCategory:   (id: string) => service.delete(`/menu/categories/${id}`),
    getItems:         (params?: object) => service.get('/menu/items', { params }),
    createItem:       (data: object) => service.post('/menu/items', data),
    updateItem:       (id: string, data: object) => service.put(`/menu/items/${id}`, data),
    soldOut:          (id: string, soldOut: boolean) => service.post(`/menu/items/${id}/sold-out`, { soldOut }),
    removeItem:       (id: string) => service.delete(`/menu/items/${id}`),
  },

  // 餐饮订单
  diningOrders: {
    getList:       (params?: object) => service.get('/dining-orders', { params }),
    create:        (data: object) => service.post('/dining-orders', data),
    updateItems:   (id: string, data: object) => service.put(`/dining-orders/${id}/items`, data),
    updateItemStatus: (id: string, idx: number, data: object) => service.put(`/dining-orders/${id}/items/${idx}/status`, data),
    settle:        (id: string, data: object) => service.post(`/dining-orders/${id}/settle`, data),
    getDailyReport:(params?: object) => service.get('/dining-orders/reports/daily', { params }),
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
