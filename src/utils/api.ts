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
    getTeamPricing: (clubId = 'default') => service.get('/settings/team-pricing', { params: { clubId } }),
    updateTeamPricing: (data: object) => service.put('/settings/team-pricing', data),
  },

  // 价格矩阵管理（定价引擎核心数据）
  rateSheets: {
    getList:    (params?: object) => service.get('/rate-sheets', { params }),
    getMatrix:  (params?: object) => service.get('/rate-sheets/matrix', { params }),
    create:     (data: object) => service.post('/rate-sheets', data),
    batch:      (data: object) => service.post('/rate-sheets/batch', data),
    update:     (id: string, data: object) => service.put(`/rate-sheets/${id}`, data),
    remove:     (id: string) => service.delete(`/rate-sheets/${id}`),
    calculate:  (data: object) => service.post('/rate-sheets/calculate', data),
  },

  // 特殊日期管理（节假日/会员日/赛事日/封场日）
  specialDates: {
    getList:      (params?: object) => service.get('/special-dates', { params }),
    create:       (data: object) => service.post('/special-dates', data),
    batch:        (data: object) => service.post('/special-dates/batch', data),
    update:       (id: string, data: object) => service.put(`/special-dates/${id}`, data),
    remove:       (id: string) => service.delete(`/special-dates/${id}`),
    getHolidays:  (year?: number) => service.get('/special-dates/holidays', { params: { year } }),
  },

  // 身份类型管理（球员身份：散客/嘉宾/各级会员/青少年/教练/长者/礼遇/员工等）
  identityTypes: {
    getList:  (params?: object) => service.get('/identity-types', { params }),
    create:   (data: object) => service.post('/identity-types', data),
    update:   (id: string, data: object) => service.put(`/identity-types/${id}`, data),
    remove:   (id: string) => service.delete(`/identity-types/${id}`),
    seed:     (data?: { clubId?: string }) => service.post('/identity-types/seed', data || {}),
  },

  // 报表与数据分析
  reports: {
    getRevenue:   (params?: object) => service.get('/reports/revenue', { params }),
    getBookings:  (params?: object) => service.get('/reports/bookings', { params }),
    getPlayers:   (params?: object) => service.get('/reports/players', { params }),
    getResources: (params?: object) => service.get('/reports/resources', { params }),
  },

  // RBAC 角色与权限管理
  roles: {
    getList:    (params?: object) => service.get('/roles', { params }),
    getModules: () => service.get('/roles/modules'),
    create:     (data: object) => service.post('/roles', data),
    update:     (id: string, data: object) => service.put(`/roles/${id}`, data),
    remove:     (id: string) => service.delete(`/roles/${id}`),
    seed:       (data?: object) => service.post('/roles/seed', data || {}),
  },

  // 审计日志
  auditLogs: {
    getList:  (params?: object) => service.get('/audit-logs', { params }),
    getStats: (params?: object) => service.get('/audit-logs/stats', { params }),
    create:   (data: object) => service.post('/audit-logs', data),
  },

  // 日结/夜审
  dailyClose: {
    getPreview:       (params?: object) => service.get('/daily-close/preview', { params }),
    autoNoShow:       (data: object) => service.post('/daily-close/auto-noshow', data),
    execute:          (data: object) => service.post('/daily-close/execute', data),
    getReports:       (params?: object) => service.get('/daily-close/reports', { params }),
    getReportDetail:  (date: string, params?: object) => service.get(`/daily-close/reports/${date}`, { params }),
  },

  // 会籍套餐管理
  membershipPlans: {
    getList:   (params?: object) => service.get('/membership-plans', { params }),
    getDetail: (id: string) => service.get(`/membership-plans/${id}`),
    create:    (data: object) => service.post('/membership-plans', data),
    update:    (id: string, data: object) => service.put(`/membership-plans/${id}`, data),
    remove:    (id: string) => service.delete(`/membership-plans/${id}`),
    seed:      (data?: object) => service.post('/membership-plans/seed', data || {}),
    getStats:  (params?: object) => service.get('/membership-plans/stats/summary', { params }),
  },

  // 会籍订阅管理
  memberships: {
    getList:      (params?: object) => service.get('/memberships', { params }),
    getDetail:    (id: string) => service.get(`/memberships/${id}`),
    create:       (data: object) => service.post('/memberships', data),
    renew:        (id: string, data: object) => service.post(`/memberships/${id}/renew`, data),
    suspend:      (id: string, data?: object) => service.post(`/memberships/${id}/suspend`, data || {}),
    resume:       (id: string) => service.post(`/memberships/${id}/resume`),
    cancel:       (id: string, data?: object) => service.post(`/memberships/${id}/cancel`, data || {}),
    checkExpiry:  (data?: object) => service.post('/memberships/check-expiry', data || {}),
    getByPlayer:  (playerId: string, params?: object) => service.get(`/memberships/player/${playerId}`, { params }),
    getStats:     (params?: object) => service.get('/memberships/stats/overview', { params }),
  },

  // 积分系统
  points: {
    getList:    (params?: object) => service.get('/points', { params }),
    getBalance: (playerId: string, params?: object) => service.get(`/points/balance/${playerId}`, { params }),
    earn:       (data: object) => service.post('/points/earn', data),
    redeem:     (data: object) => service.post('/points/redeem', data),
    adjust:     (data: object) => service.post('/points/adjust', data),
    expire:     (data?: object) => service.post('/points/expire', data || {}),
    getStats:   (params?: object) => service.get('/points/stats', { params }),
  },

  // 赛事与活动管理
  tournaments: {
    getList:          (params?: object) => service.get('/tournaments', { params }),
    getDetail:        (id: string) => service.get(`/tournaments/${id}`),
    create:           (data: object) => service.post('/tournaments', data),
    update:           (id: string, data: object) => service.put(`/tournaments/${id}`, data),
    updateStatus:     (id: string, data: { status: string }) => service.put(`/tournaments/${id}/status`, data),
    delete:           (id: string) => service.delete(`/tournaments/${id}`),
    getStats:         (params?: object) => service.get('/tournaments/stats/summary', { params }),
    // 报名
    getRegistrations: (id: string, params?: object) => service.get(`/tournaments/${id}/registrations`, { params }),
    register:         (id: string, data: object) => service.post(`/tournaments/${id}/register`, data),
    updateReg:        (id: string, regId: string, data: object) => service.put(`/tournaments/${id}/registrations/${regId}`, data),
    cancelReg:        (id: string, regId: string) => service.delete(`/tournaments/${id}/registrations/${regId}`),
    // 分组
    getGroups:        (id: string) => service.get(`/tournaments/${id}/groups`),
    autoGroup:        (id: string, data: object) => service.post(`/tournaments/${id}/groups/auto`, data),
    updateGroup:      (id: string, groupId: string, data: object) => service.put(`/tournaments/${id}/groups/${groupId}`, data),
    // 成绩
    getScores:        (id: string, params?: object) => service.get(`/tournaments/${id}/scores`, { params }),
    submitScore:      (id: string, data: object) => service.post(`/tournaments/${id}/scores`, data),
    submitScoreBatch: (id: string, data: { scores: object[] }) => service.post(`/tournaments/${id}/scores/batch`, data),
    // 排行榜 & 颁奖
    getLeaderboard:   (id: string, params?: object) => service.get(`/tournaments/${id}/leaderboard`, { params }),
    finalize:         (id: string) => service.post(`/tournaments/${id}/finalize`),
  },

  // 通知中心
  notifications: {
    getList:         (params?: object) => service.get('/notifications', { params }),
    getUnreadCount:  (params?: object) => service.get('/notifications/unread-count', { params }),
    getDetail:       (id: string) => service.get(`/notifications/${id}`),
    markRead:        (id: string) => service.put(`/notifications/${id}/read`),
    markReadBatch:   (data: object) => service.put('/notifications/read-batch', data),
    archive:         (id: string) => service.put(`/notifications/${id}/archive`),
    delete:          (id: string) => service.delete(`/notifications/${id}`),
    send:            (data: object) => service.post('/notifications/send', data),
    getTypes:        () => service.get('/notifications/types/all'),
    getStats:        (params?: object) => service.get('/notifications/stats/overview', { params }),
  },
}
