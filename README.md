# 开锤后台管理系统

基于 **Vite + React + TypeScript + Redux Toolkit** 的后台前端，与 **Express + wx-server-sdk** 编写的后端共存于同一仓库，面向微信扫码登录、高尔夫球场运营管理及腾讯云开发（TCB）部署场景。

---

## 技术栈

| 类型 | 技术 |
|------|------|
| 前端 | React 18、React Router 6、Redux Toolkit、Tailwind CSS、Radix UI、sonner、lucide-react |
| 后端 | Node.js 18+、Express、wx-server-sdk、axios、jsonwebtoken |
| 构建/工具 | Vite 5、TypeScript 5、pnpm、Docker（可选） |

---

## 功能模块

### 路由与页面

| 路径 | 页面 | 说明 |
|------|------|------|
| `/login` | Login | 微信扫码登录 |
| `/auth/callback` | AuthCallback | 微信授权回调（接收 token） |
| `/home` | Home | 首页（数据概览、双视图、侧边栏导航） |
| `/settings` | Settings | 系统设置（球会信息、预订规则、价格规则） |
| `/resources` | Resources | 资源管理（球场、球童、球车） |
| `/bookings` | Bookings | 预订管理（TeeSheet、预订表单） |
| `/cart-management` | CartManagement | 球车管理（独立一级菜单） |

### 首页布局

- **侧边栏**：桌面端鼠标靠近左侧边缘（约 8px 宽）自动展开 230px，移开后收起；移动端左上角菜单打开抽屉
- **顶部导航**：数据概览、用户管理、租户管理、配额管理（内嵌面板，部分功能开发中）
- **底部入口**：预订管理、资源管理、球车管理、系统设置（跳转独立页面）

### 双视图模式（类似 Windows 小窗）

- **进入**：长按（约 800ms）任一其他导航模块，进入放置模式
- **放置**：主视图半屏显示于左侧，右侧为放置区域；拖动至左/右目标区域后释放
- **分割线**：中间可拖拽调整左右比例（默认 5:5）
- **退出**：点击「关闭双视图」或按 Esc 取消放置

### 球车管理（与小程序对齐）

- **数据总览**：9 项 KPI（球车总数、可用、未出库、已出库、使用中、未入库、维修中、停用、平均使用时长）；点击卡片可跳转至对应筛选的球车列表
- **球车管理**：CRUD、批量新增、批量更新状态、删除；支持按品牌、状态、日期筛选及分页
- **维修管理**：维修记录列表、完成维修、故障类型分析、故障类型列表
- **使用记录**：查看球车使用记录及详情

### 鉴权

- **扫码登录**：`users.clubId` 写入 JWT payload
- **球车/维修**：`requireAuthWithClubId` 解析 JWT，注入 `req.clubId`，与小程序云函数逻辑一致

---

## 目录结构

```
kaichuiweb/
├── src/
│   ├── pages/              # 页面
│   │   ├── Login.tsx       # 扫码登录
│   │   ├── Home.tsx        # 首页
│   │   ├── AuthCallback.tsx
│   │   ├── Settings/       # 系统设置（ClubInfo、BookingRules、PricingRules）
│   │   ├── Resources/      # 资源管理（Courses、Caddies、index）
│   │   ├── Bookings/       # 预订管理（TeeSheet、BookingForm）
│   │   └── CartManagement/ # 球车管理
│   ├── components/ui/      # 通用 UI（Button、Dropdown、AlertDialog）
│   ├── store/              # Redux（authSlice、store）
│   ├── router/             # 路由与受保护路由
│   └── utils/              # api、utils
├── server/
│   ├── routes/             # 路由
│   │   ├── carts.js        # 球车管理
│   │   ├── maintenance.js  # 维修管理
│   │   ├── bookings.js     # 预订
│   │   ├── resources.js    # 资源（球场、球童、球车）
│   │   ├── settings.js     # 系统设置
│   │   └── orders.js       # 订单
│   ├── middleware/         # auth-cart（球车鉴权）
│   ├── utils/              # db-http、jwt-helper
│   └── app.js              # Express 入口
├── container.config.json   # 云托管配置
├── Dockerfile
├── package.json
└── .env                    # 本地环境变量（生产用控制台配置）
```

---

## 环境准备

- Node.js 18+
- pnpm：`npm install -g pnpm`
- 腾讯云开发环境（TCB 或 CBR），用于数据库与云托管

---

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动后端（默认 PORT=3000）
pnpm server:dev   # nodemon
# 或
pnpm server

# 3. 启动前端（Vite 5173，代理 /api -> localhost:3000）
pnpm dev

# 4. 访问
# http://localhost:5173 → 扫码登录
```

---

## 构建与部署

```bash
pnpm build
pnpm install --prod
pnpm server
```

生产环境可：
- 使用 `Dockerfile` 构建镜像
- 按腾讯云托管部署，在控制台配置环境变量

---

## 必要环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `TCB_ENV_ID` | 是（生产） | 云开发环境 ID |
| `CBR_ENV_ID` | 否 | 兼容老变量 |
| `WX_WEB_APPID` | 是 | 网站应用 AppID（扫码登录） |
| `WX_WEB_SECRET` | 是 | 网站应用 Secret |
| `WX_CALLBACK_BASE` | 否 | 微信回调域名，默认 `https://www.kaichui.com.cn` |
| `FRONTEND_BASE_URL` | 否 | 登录成功后重定向的前端域名 |
| `JWT_SECRET` | 是（生产） | 签发 Token 的密钥 |
| `USE_HTTP_DB` | 否 | `true` 时走 HTTP API 访问数据库 |
| `WX_APPID` & `WX_APP_SECRET` | 条件必填 | `USE_HTTP_DB=true` 时必填，需为**拥有云开发环境的小程序**凭证 |
| `PORT` | 否 | 端口，默认 80 |
| `WARMUP_TIMEOUT_MS` | 否 | 数据库预热超时（毫秒） |
| `VITE_API_BASE_URL` | 否 | 前端 API 基地址，默认 `/api` |

> 生产环境务必通过云托管控制台设置，勿将密钥写入 `.env` 并提交。

---

## 数据库集合

| 集合 | 用途 |
|------|------|
| `qrcode_tickets` | 扫码登录票据 |
| `users` | 用户（含 `clubId`、`unionid`） |
| `orders` | 订单 |
| `carts` | 球车 |
| `cart_usage_records` | 球车使用记录 |
| `maintenance_records` | 维修记录 |
| `cart_daily_snapshot_summary` | 每日统计快照（可选） |
| `cart_daily_snapshot_items` | 每日快照明细（可选） |
| `carbrands` | 品牌选项（可选） |
| `cart_fault_types` | 故障类型（可选） |

---

## API 接口

### 认证

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/qrcode` | POST | 生成登录二维码 |
| `/api/auth/callback` | GET | 微信授权回调 |
| `/api/auth/check-status/:qrId` | GET | 轮询扫码状态（限流） |
| `/api/auth/verify` | GET | 验证 Token |

### 球车管理（需 JWT）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/carts/statistics` | GET | 数据总览 9 项 KPI |
| `/api/carts/brands` | GET | 品牌选项 |
| `/api/carts` | GET | 球车列表 |
| `/api/carts` | POST | 新增球车 |
| `/api/carts/batch` | POST | 批量新增 |
| `/api/carts/:id` | PUT | 编辑球车 |
| `/api/carts/batch-status` | PUT | 批量更新状态 |
| `/api/carts` | DELETE | 删除球车 |
| `/api/carts/usage` | GET | 使用记录列表 |
| `/api/carts/usage/:id` | GET | 使用记录详情 |

### 维修管理（需 JWT）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/maintenance` | GET | 维修记录列表 |
| `/api/maintenance/:id/complete` | PUT | 完成维修 |
| `/api/maintenance/fault-analysis` | GET | 故障类型分析 |
| `/api/maintenance/fault-types` | GET | 故障类型列表 |

### 其他

| 前缀 | 说明 |
|------|------|
| `/api/orders` | 订单 CRUD |
| `/api/settings` | 球会信息、预订规则、价格规则 |
| `/api/resources/courses` | 球场 CRUD |
| `/api/resources/caddies` | 球童 CRUD |
| `/api/resources/carts` | 资源侧球车 CRUD |
| `/api/bookings` | 预订 CRUD、TeeSheet |
| `/api/golf/orders` | 订单示例 |
| `/api/users` | 用户列表示例 |
| `/api/db-test` | 数据库连通性测试 |
| `/health` | 健康检查 |

---

## 故障排查

| 现象 | 排查方向 |
|------|----------|
| 二维码生成失败 | 检查 `WX_WEB_APPID/WX_WEB_SECRET` 及回调域名 |
| 数据库连接超时 | 设置 `USE_HTTP_DB=true` 并配置 `WX_APPID` + `WX_APP_SECRET`，或调大 `WARMUP_TIMEOUT_MS` |
| HTTP DB 模式报错 | 见下方「HTTP DB 适配器修复记录」 |
| 登录后立即跳回 | 检查 `JWT_SECRET`、cookie、同域策略 |
| 跨域问题 | 检查 Vite 代理、`VITE_API_BASE_URL` |

---

## HTTP DB 适配器修复记录

**根本原因**：`USE_HTTP_DB=true` 时，`where(cond)` 使用 `JSON.stringify(cond)` 序列化查询条件。SDK 命令对象（如 `_.neq(true)`、`_.and()`、`_.gte(date)`）无法被 `JSON.stringify` 正确序列化，会变成 `{}`，导致查询条件全部失效，返回空列表。

| 文件 | 问题 | 修复 |
|------|------|------|
| `server/utils/db-http.js` | `where()` 用 `JSON.stringify` 序列化命令对象 | 新增 `serializeWhere()` 和 `httpDbCommand`，正确序列化 `neq`、`and`、`or`、`gte`、`lte`、`exists`、`in` 等操作符；补充 `field()`、`update()`、`remove()` 方法 |
| `server/routes/carts.js` | `const _ = getCmd(db)` 在模块加载时执行一次，HTTP DB 初始化前已固化 | 将 `getCmd(db)` 移入每个请求处理函数内部 |
| `server/routes/maintenance.js` | 同上 | 同上 |

HTTP DB 适配器现已支持：`count()`、链式 `orderBy()`、`field()`、`update()`、`remove()`，以及正确的条件序列化，可与球车管理、维修管理、使用记录等业务完整对接。

---

如需新增部署脚本或环境变量，请同步更新本文档。
