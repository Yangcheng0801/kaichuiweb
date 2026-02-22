# 开锤后台管理系统 - 本地开发指南

> 本文档提供完整的本地开发环境配置和使用说明

## 📋 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [开发工具](#开发工具)
- [项目结构](#项目结构)
- [常见问题](#常见问题)

---

## 环境要求

- **Node.js**: >= 18.x
- **pnpm**: >= 8.x
- **Git**: 最新版本

---

## 快速开始

### 1. 安装依赖

```bash
cd C:\Users\95962\Desktop\开锤\kaichuiweb
pnpm install
```

### 2. 配置环境变量

确保项目根目录存在 `.env` 文件，包含以下配置：

```env
# 腾讯云开发环境 ID
TCB_ENV_ID=your-env-id

# 微信开放平台配置
WX_WEB_APPID=your-appid
WX_WEB_SECRET=your-secret

# JWT 密钥（本地开发可使用默认值）
JWT_SECRET=kaichui-golf-secret-2026

# 前端 API 地址（本地开发使用代理）
VITE_API_BASE_URL=/api
```

### 3. 启动开发服务器

**方式一：一键启动（推荐）**

```bash
pnpm run dev:all
```

这会同时启动：
- **后端服务器**（端口 3000）- 蓝色日志
- **前端开发服务器**（端口 5173）- 绿色日志

**方式二：分别启动**

终端 1 - 启动后端：
```bash
pnpm run server:dev
```

终端 2 - 启动前端：
```bash
pnpm run dev
```

### 4. 访问应用

打开浏览器访问：**http://localhost:5173**

---

## 开发工具

### 生成测试 JWT Token

由于微信开放平台不支持 localhost 回调，本地开发需要手动设置 JWT Token 来绕过登录。

#### 步骤 1：生成 Token

```bash
pnpm run dev:token
```

输出示例：
```
========================================
🔑 开发测试 JWT Token 已生成
========================================

Token:
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZXYtdXNlci0wMDEi...

用户信息:
{
  "userId": "dev-user-001",
  "unionid": "test-unionid-12345",
  "openid": "test-openid-67890",
  "nickname": "开发测试用户",
  "role": "admin",
  "clubId": "test-club-001"
}

========================================
📋 使用方法：
========================================

1. 打开浏览器开发者工具（F12）
2. 进入 Console 标签
3. 粘贴以下代码并回车：

localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
document.cookie = 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; path=/; max-age=604800';
location.reload();

4. 页面刷新后即可登录
```

#### 步骤 2：在浏览器中设置 Token

1. 访问 http://localhost:5173
2. 按 **F12** 打开开发者工具
3. 切换到 **Console** 标签
4. 粘贴工具输出的三行代码（包含 localStorage、cookie 和 reload）
5. 按 **Enter** 执行
6. 页面自动刷新，即可以管理员身份登录

#### Token 说明

- **有效期**：7 天
- **角色**：admin（管理员权限）
- **昵称**：开发测试用户
- **过期后**：重新运行 `pnpm run dev:token` 生成新 token

---

## 项目结构

```
kaichuiweb/
├── src/                          # 前端源码
│   ├── main.tsx                  # 应用入口
│   ├── App.tsx                   # 根组件
│   ├── pages/                    # 页面组件
│   │   ├── Home.tsx              # 管理驾驶舱
│   │   ├── Login.tsx             # 登录页
│   │   ├── Bookings/             # 预订管理
│   │   ├── Settings/             # 系统设置
│   │   └── ...
│   ├── components/               # 公共组件
│   │   ├── ui/                   # UI 组件库
│   │   ├── Sidebar.tsx           # 侧边栏
│   │   ├── ThemeToggle.tsx       # 主题切换
│   │   └── NotificationCenter.tsx
│   ├── store/                    # Redux 状态管理
│   │   ├── index.ts
│   │   └── authSlice.ts
│   ├── contexts/                 # React Context
│   │   └── ThemeContext.tsx      # 主题上下文
│   ├── utils/                    # 工具函数
│   │   └── api.ts                # API 请求封装
│   ├── router/                   # 路由配置
│   │   └── index.tsx
│   └── index.css                 # 全局样式（设计令牌）
│
├── server/                       # 后端源码
│   ├── app.js                    # Express 主文件
│   ├── routes/                   # 路由模块
│   │   ├── bookings.js
│   │   └── orders.js
│   └── utils/                    # 工具函数
│       ├── jwt-helper.js         # JWT 工具
│       └── db-http.js            # 数据库 HTTP 封装
│
├── dev-tools/                    # 开发工具
│   └── generate-token.js         # Token 生成器
│
├── dist/                         # 构建输出（git-ignored）
├── .env                          # 环境变量（生产）
├── .env.local                    # 环境变量（本地开发）
├── vite.config.ts                # Vite 配置
├── tailwind.config.js            # Tailwind 配置
├── package.json                  # 依赖配置
└── DEV_GUIDE.md                  # 本文档
```

---

## 开发流程

### 完整开发流程

```bash
# 1. 启动开发服务器
pnpm run dev:all

# 2. 生成测试 token（新终端窗口）
pnpm run dev:token

# 3. 在浏览器中设置 token（按上述步骤）

# 4. 开始开发
# - 修改前端代码：保存后浏览器自动刷新
# - 修改后端代码：Nodemon 自动重启服务器
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm run dev:all` | 同时启动前后端开发服务器 |
| `pnpm run dev` | 仅启动前端开发服务器（Vite） |
| `pnpm run server:dev` | 仅启动后端开发服务器（Nodemon） |
| `pnpm run dev:token` | 生成测试 JWT Token |
| `pnpm run build` | 构建生产版本 |
| `pnpm run preview` | 预览生产构建 |

---

## 技术栈

### 前端

- **框架**：React 18 + TypeScript
- **构建工具**：Vite 5
- **样式**：Tailwind CSS 3
- **状态管理**：Redux Toolkit
- **路由**：React Router v6
- **UI 组件**：Radix UI
- **图标**：Lucide React
- **表单**：React Hook Form + Zod
- **图表**：Recharts
- **通知**：Sonner

### 后端

- **运行时**：Node.js 18+
- **框架**：Express
- **数据库**：腾讯云开发 CloudBase
- **认证**：JWT (HS256)
- **微信登录**：WeChat OAuth2

---

## 常见问题

### Q1: 启动后端时提示 "未设置 TCB_ENV_ID"

**原因**：缺少腾讯云开发环境 ID

**解决**：
1. 在 `.env` 文件中添加 `TCB_ENV_ID=your-env-id`
2. 或者在本地开发时可以忽略此警告（不影响前端开发）

### Q2: Token 过期后如何重新登录？

**解决**：
```bash
# 重新生成 token
pnpm run dev:token

# 在浏览器 Console 中重新设置
localStorage.setItem('token', '新的token');
document.cookie = 'token=新的token; path=/; max-age=604800';
location.reload();
```

### Q3: 前端修改后浏览器没有自动刷新

**原因**：Vite HMR 可能失效

**解决**：
1. 检查浏览器控制台是否有错误
2. 手动刷新页面（F5）
3. 重启 Vite 开发服务器

### Q4: 后端 API 请求 404

**原因**：后端服务器未启动或代理配置错误

**解决**：
1. 确认后端服务器已启动（端口 3000）
2. 检查 `vite.config.ts` 中的 proxy 配置
3. 查看浏览器 Network 标签确认请求地址

### Q5: 如何切换主题（深色/浅色）？

**方法**：
1. 点击顶部导航栏的主题切换按钮（太阳/月亮图标）
2. 选择：浅色 / 深色 / 跟随系统

### Q6: 如何查看 API 请求详情？

**方法**：
1. 打开浏览器开发者工具（F12）
2. 切换到 **Network** 标签
3. 筛选 **Fetch/XHR** 类型
4. 点击具体请求查看详情

### Q7: 本地开发时能否使用微信登录？

**答案**：不能

**原因**：微信开放平台不支持 localhost 作为回调域名

**解决**：使用 `pnpm run dev:token` 生成测试 token 绕过登录

---

## 设计系统

项目使用统一的设计令牌系统，所有颜色、间距、圆角等都定义在 `src/index.css` 中。

### 主题系统

- **浅色模式**：纯白背景 + 黑色文字
- **深色模式**：纯黑背景 + 白色文字
- **语义色**：success（绿）、warning（琥珀）、destructive（红）、info（蓝）

### 设计文档

详细设计规范请参考：`C:\Users\95962\Desktop\kaichuiweb_design_system.md`

---

## Git 工作流

### 提交代码

```bash
# 查看修改
git status

# 添加文件
git add .

# 提交（会自动添加 Co-Authored-By）
git commit -m "feat: 添加新功能"

# 推送到远程
git push
```

### 分支管理

```bash
# 创建新分支
git checkout -b feature/new-feature

# 切换分支
git checkout main

# 合并分支
git merge feature/new-feature
```

---

## 部署

### 构建生产版本

```bash
# 构建前端 + 后端
pnpm run build

# 构建产物在 dist/ 目录
```

### Docker 部署

```bash
# 构建镜像
docker build -t kaichui-erp .

# 运行容器
docker run -p 80:80 --env-file .env kaichui-erp
```

---

## 联系方式

- **项目路径**：`C:\Users\95962\Desktop\开锤\kaichuiweb`
- **开发文档**：本文档
- **设计规范**：`kaichuiweb_design_system.md`

---

## 更新日志

### 2026-02-22

- ✅ 配置本地开发环境
- ✅ 添加 Token 生成工具
- ✅ 完成设计系统重构
- ✅ 修复深色模式适配问题
- ✅ 移除主内容区左右空隙
- ✅ 修复主题切换按钮定位问题
- ✅ 清理所有硬编码颜色（text-white 等）
- ✅ 统一 Storybook 版本到 v8.6.17

---

**祝开发愉快！** 🚀
