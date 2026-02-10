<template>
  <div class="home-container">
    <el-container>
      <!-- 侧边栏 -->
      <el-aside width="200px">
        <div class="logo">
          <h3>开锤后台</h3>
        </div>
        <el-menu
          :default-active="activeMenu"
          class="el-menu-vertical"
          @select="handleMenuSelect"
        >
          <el-menu-item index="dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <span>数据概览</span>
          </el-menu-item>
          <el-menu-item index="users">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item index="tenants">
            <el-icon><OfficeBuilding /></el-icon>
            <span>租户管理</span>
          </el-menu-item>
          <el-menu-item index="quotas">
            <el-icon><PieChart /></el-icon>
            <span>配额管理</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 主内容区 -->
      <el-container>
        <!-- 顶部导航 -->
        <el-header>
          <div class="header-content">
            <div class="breadcrumb">
              <el-breadcrumb separator="/">
                <el-breadcrumb-item>首页</el-breadcrumb-item>
                <el-breadcrumb-item>{{ currentMenuName }}</el-breadcrumb-item>
              </el-breadcrumb>
            </div>
            <div class="user-info">
              <el-dropdown @command="handleCommand">
                <span class="el-dropdown-link">
                  <el-icon><UserFilled /></el-icon>
                  {{ userInfo?.nickname || userInfo?.openid || '用户' }}
                  <el-icon class="el-icon--right"><arrow-down /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="profile">个人信息</el-dropdown-item>
                    <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </el-header>

        <!-- 主要内容 -->
        <el-main>
          <div v-if="activeMenu === 'dashboard'" class="dashboard">
            <el-row :gutter="20">
              <el-col :span="6">
                <el-card class="stat-card">
                  <div class="stat-content">
                    <el-icon class="stat-icon" :size="40" color="#409EFF">
                      <User />
                    </el-icon>
                    <div class="stat-info">
                      <div class="stat-value">1,234</div>
                      <div class="stat-label">总用户数</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="stat-card">
                  <div class="stat-content">
                    <el-icon class="stat-icon" :size="40" color="#67C23A">
                      <OfficeBuilding />
                    </el-icon>
                    <div class="stat-info">
                      <div class="stat-value">56</div>
                      <div class="stat-label">租户数量</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="stat-card">
                  <div class="stat-content">
                    <el-icon class="stat-icon" :size="40" color="#E6A23C">
                      <Document />
                    </el-icon>
                    <div class="stat-info">
                      <div class="stat-value">8,901</div>
                      <div class="stat-label">数据记录</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="6">
                <el-card class="stat-card">
                  <div class="stat-content">
                    <el-icon class="stat-icon" :size="40" color="#F56C6C">
                      <Warning />
                    </el-icon>
                    <div class="stat-info">
                      <div class="stat-value">12</div>
                      <div class="stat-label">待处理</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
            </el-row>

            <el-card class="welcome-card" style="margin-top: 20px;">
              <template #header>
                <div class="card-header">
                  <span>欢迎使用开锤后台管理系统</span>
                </div>
              </template>
              <div class="welcome-content">
                <p>🎉 恭喜您成功登录系统！</p>
                <p>📊 系统运行状态正常</p>
                <p>🔒 您的账户权限：{{ userInfo?.role || '普通用户' }}</p>
                <p>🏢 所属租户：{{ userInfo?.tenantId || '默认租户' }}</p>
              </div>
            </el-card>
          </div>

          <div v-else class="placeholder">
            <el-empty description="功能开发中...">
              <el-button type="primary" @click="activeMenu = 'dashboard'">返回首页</el-button>
            </el-empty>
          </div>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../store/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  DataAnalysis,
  User,
  OfficeBuilding,
  PieChart,
  UserFilled,
  ArrowDown,
  Document,
  Warning
} from '@element-plus/icons-vue'

const router = useRouter()
const authStore = useAuthStore()

const activeMenu = ref('dashboard')
const userInfo = computed(() => authStore.userInfo)

// 从微信回调进入时 userInfo 可能为空，进入首页后静默拉取（失败也不影响已登录态）
onMounted(() => {
  if (authStore.isLoggedIn && !authStore.userInfo?.userId) {
    authStore.fetchUserInfo()
  }
})

const menuNames = {
  dashboard: '数据概览',
  users: '用户管理',
  tenants: '租户管理',
  quotas: '配额管理'
}

const currentMenuName = computed(() => menuNames[activeMenu.value])

// 菜单选择
const handleMenuSelect = (index) => {
  activeMenu.value = index
}

// 下拉菜单命令
const handleCommand = async (command) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
      
      authStore.logout()
      ElMessage.success('已退出登录')
      router.push('/login')
    } catch (error) {
      // 用户取消
    }
  } else if (command === 'profile') {
    ElMessage.info('个人信息功能开发中...')
  }
}
</script>

<style scoped>
.home-container {
  height: 100vh;
}

.el-aside {
  background-color: #304156;
  color: #fff;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #1f2d3d;
}

.logo h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.el-menu-vertical {
  border-right: none;
}

.el-header {
  background-color: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  padding: 0 20px;
}

.header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.el-dropdown-link {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}

.el-main {
  background-color: #f0f2f5;
  padding: 20px;
}

.stat-card {
  margin-bottom: 20px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 15px;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #333;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

.welcome-card {
  margin-bottom: 20px;
}

.welcome-content p {
  margin: 10px 0;
  font-size: 14px;
  color: #666;
}

.placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}
</style>
