import axios from 'axios'
import { ElMessage } from 'element-plus'

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
    
    // 如果返回的状态码不是200，说明接口有问题
    if (res.code !== 200 && res.success !== true) {
      ElMessage.error(res.message || '请求失败')
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
          ElMessage.error('未授权，请重新登录')
          // 跳转到登录页
          window.location.href = '/login'
          break
        case 403:
          ElMessage.error('拒绝访问')
          break
        case 404:
          ElMessage.error('请求的资源不存在')
          break
        case 500:
          ElMessage.error('服务器错误')
          break
        default:
          ElMessage.error(data?.message || `请求失败 (${status})`)
      }
    } else if (error.message.includes('timeout')) {
      ElMessage.error('请求超时')
    } else if (error.message.includes('Network Error')) {
      ElMessage.error('网络错误，请检查网络连接')
    } else {
      ElMessage.error(error.message || '请求失败')
    }
    
    return Promise.reject(error)
  }
)

export default service

// API方法
export const api = {
  // 健康检查
  health: () => service.get('/health'),
  
  // 微信登录
  wechat: {
    // 生成登录二维码
    getQrCode: () => service.post('/auth/wechat/qrcode'),
    // 检查登录状态
    checkLogin: (qrCodeId) => service.get(`/auth/wechat/check/${qrCodeId}`),
    // 获取用户信息
    getUserInfo: () => service.get('/auth/wechat/userinfo')
  },
  
  // 用户管理
  users: {
    // 获取用户列表
    getList: (params) => service.get('/users', { params }),
    // 获取用户详情
    getDetail: (id) => service.get(`/users/${id}`),
    // 创建用户
    create: (data) => service.post('/users', data),
    // 更新用户
    update: (id, data) => service.put(`/users/${id}`, data),
    // 删除用户
    delete: (id) => service.delete(`/users/${id}`)
  },
  
  // 租户管理
  tenants: {
    // 获取租户列表
    getList: (params) => service.get('/tenants', { params }),
    // 获取租户详情
    getDetail: (id) => service.get(`/tenants/${id}`),
    // 创建租户
    create: (data) => service.post('/tenants', data),
    // 更新租户
    update: (id, data) => service.put(`/tenants/${id}`, data),
    // 删除租户
    delete: (id) => service.delete(`/tenants/${id}`)
  },
  
  // 配额管理
  quotas: {
    // 获取配额列表
    getList: (params) => service.get('/quotas', { params }),
    // 获取配额详情
    getDetail: (id) => service.get(`/quotas/${id}`),
    // 更新配额
    update: (id, data) => service.put(`/quotas/${id}`, data),
    // 重置配额
    reset: (id) => service.post(`/quotas/${id}/reset`)
  }
}
