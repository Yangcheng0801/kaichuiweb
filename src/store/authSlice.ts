import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit'
import Cookies from 'js-cookie'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://www.kaichui.com.cn/api'

export interface UserInfo {
  userId?: string
  openid?: string
  unionid?: string
  nickname?: string
  role?: string
  tenantId?: string
  [key: string]: unknown
}

interface AuthState {
  token: string
  userInfo: UserInfo | null
  loading: boolean
}

const initialState: AuthState = {
  token: Cookies.get('token') || '',
  userInfo: JSON.parse(localStorage.getItem('userInfo') || 'null'),
  loading: false,
}

// 验证 token 并更新 userInfo（失败时会 logout）
export const checkLoginStatus = createAsyncThunk(
  'auth/checkLoginStatus',
  async (_, { getState, dispatch, rejectWithValue }) => {
    const state = getState() as { auth: AuthState }
    const { token } = state.auth
    if (!token) return rejectWithValue('no token')
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        return response.data.data as UserInfo
      }
      dispatch(logout())
      return rejectWithValue('verify failed')
    } catch {
      dispatch(logout())
      return rejectWithValue('request failed')
    }
  }
)

// 仅拉取 userInfo，失败不 logout
export const fetchUserInfo = createAsyncThunk(
  'auth/fetchUserInfo',
  async (_, { getState, rejectWithValue }) => {
    const state = getState() as { auth: AuthState }
    const { token } = state.auth
    if (!token) return rejectWithValue('no token')
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.data.success) {
        return response.data.data as UserInfo
      }
      return rejectWithValue('verify failed')
    } catch {
      return rejectWithValue('request failed')
    }
  }
)

// 生成登录二维码
export const generateQRCode = createAsyncThunk(
  'auth/generateQRCode',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/qrcode`)
      return response.data
    } catch (error) {
      return rejectWithValue(error)
    }
  }
)

// 轮询二维码登录状态
export const checkLoginStatusByQRCode = createAsyncThunk(
  'auth/checkLoginStatusByQRCode',
  async (qrId: string, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/check-status/${qrId}`)
      return response.data
    } catch (error) {
      return rejectWithValue(error)
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginSuccess(state, action: PayloadAction<{ token: string; userInfo: UserInfo }>) {
      state.token = action.payload.token
      state.userInfo = action.payload.userInfo
      Cookies.set('token', action.payload.token, { expires: 7 })
      localStorage.setItem('userInfo', JSON.stringify(action.payload.userInfo))
    },
    logout(state) {
      state.token = ''
      state.userInfo = null
      Cookies.remove('token')
      localStorage.removeItem('userInfo')
    },
  },
  extraReducers: builder => {
    builder
      .addCase(generateQRCode.pending, state => { state.loading = true })
      .addCase(generateQRCode.fulfilled, state => { state.loading = false })
      .addCase(generateQRCode.rejected, state => { state.loading = false })
      .addCase(checkLoginStatus.fulfilled, (state, action) => {
        state.userInfo = action.payload
      })
      .addCase(fetchUserInfo.fulfilled, (state, action) => {
        state.userInfo = action.payload
      })
  },
})

export const { loginSuccess, logout } = authSlice.actions

// Selectors
export const selectToken = (state: { auth: AuthState }) => state.auth.token
export const selectUserInfo = (state: { auth: AuthState }) => state.auth.userInfo
export const selectIsLoggedIn = (state: { auth: AuthState }) => !!state.auth.token
export const selectAuthLoading = (state: { auth: AuthState }) => state.auth.loading

export default authSlice.reducer
