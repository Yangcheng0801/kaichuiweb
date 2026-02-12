# 开锤后台管理系统

基于 **Vite + React + TypeScript + Redux Toolkit** 的后台前端，与 **Express + wx-server-sdk** 编写的后端共存于同一仓库，面向微信扫码登录、高尔夫球场运营管理及腾讯云开发（TCB）部署场景。与微信小程序端共用同一云开发数据库。

---

## 技术栈

| 类型 | 技术 |
|------|------|
| 前端 | React 18、React Router 6、Redux Toolkit、TypeScript 5、Tailwind CSS、Radix UI、sonner、lucide-react |
| 后端 | Node.js 18+、Express 4、wx-server-sdk、axios、jsonwebtoken、dotenv |
| 数据库 | 腾讯云开发（TCB）云数据库（NoSQL） |
| 构建/工具 | Vite 5、PostCSS、Autoprefixer、pnpm |
| 部署 | Docker、腾讯云托管 |

---

## 功能模块

### 路由与页面

| 路径 | 页面 | 说明 |
|------|------|------|
| `/login` | Login | 微信扫码登录（粒子背景动效） |
| `/auth/callback` | AuthCallback | 微信授权回调（接收 token 并跳转） |
| `/home` | Home | 首页（数据概览、双视图、侧边栏导航） |
| `/settings` | Settings | 系统设置（球会信息、预订规则、价格规则） |
| `/resources` | Resources | 资源管理（球场、球童、更衣柜、客房、消费卡） |
| `/bookings` | Bookings | 预订管理（TeeSheet 发球表、签到工作台、预订表单） |
| `/cart-management` | CartManagement | 球车管理（独立一级菜单） |
| `/players` | Players | 球员管理（会员档案、充值、消费二维码） |

### 首页布局

- **侧边栏**：桌面端鼠标靠近左侧边缘（约 8px 宽）自动展开 230px，移开后收起；移动端左上角菜单打开抽屉
- **顶部导航**：数据概览、用户管理、租户管理、配额管理（内嵌面板，部分功能开发中）
- **底部入口**：预订管理、资源管理、球车管理、系统设置（跳转独立页面）

### 双视图模式（类似 Windows 小窗）

- **进入**：长按（约 800ms）任一其他导航模块，进入放置模式
- **放置**：主视图半屏显示于左侧，右侧为放置区域；拖动至左/右目标区域后释放
- **分割线**：中间可拖拽调整左右比例（默认 5:5）
- **退出**：点击「关闭双视图」或按 Esc 取消放置

### 预订管理（完整业务流程）

- **创建预订**：前台代订或小程序自助，自动生成订单号（ORD格式）
- **球员搜索**：支持按姓名/手机号/球员编号搜索，自动带入会员等级和价格
- **状态流转**：`pending` → `confirmed` → `checked_in` → `playing` → `completed` / `cancelled` / `no_show`
- **签到工作台（CheckInDialog v2 -- 全面升级）**：
  - 球员信息卡片（姓名/球员号/手机/会员卡/余额）
  - 消费凭证：已有会员卡 / 发放实体消费卡 / 系统生成虚拟临时卡号
  - 住宿类型选择：当天往返 / 两球一晚 / 仅住宿
  - 球车分配：下拉选择可用球车 + 手动输入
  - 球童分配：实时空闲球童列表，点选分配（支持签到时临时加球童）
  - 更衣柜可视化选择：按区域分组网格，多选，颜色区分可用/占用/维护
  - 客房分配：住宿类型非"当天往返"时展开，选择房间 + 入退房日期
  - 球包寄存：勾选启用 + 编号/描述
  - 停车信息：车牌号输入
  - **资源状态联动**：分配时自动占用（lockers/rooms/temp_cards → occupied/in_use），完赛/取消时自动释放
- **收银台（完赛结账）**：
  - 费用明细展示（果岭费/球童费/球车费/保险费/客房费/折扣）
  - 应收/已付/待收三级汇总
  - 6种收款方式（现金/微信/支付宝/银行卡/会员卡/转账）
  - 历史支付记录查询
  - 支持部分收款（挂账）、组合支付
- **取消确认**：防误操作二次确认，可填写取消原因
- **球童自动联动**：预订时占用，完赛/取消时释放

### 球车管理（Web 深度适配）

- **数据总览**：
  - 8 项 KPI 卡片（球车总数、可用、未出库、已出库、使用中、未入库、维修中、停用）
  - 横向堆叠状态条（按状态颜色区分）
  - SVG 圆形利用率仪表盘
  - 点击 KPI 卡片跳转至对应筛选的球车列表
- **球车管理**（Master-Detail 布局）：
  - 左侧：可排序表格 + 多选批量操作
  - 右侧：选中球车详情面板（今日记录/历史使用/快速操作）
  - 新增/编辑：支持单个或批量创建（规则生成车号）
  - 状态管理：批量更新状态、删除
  - 筛选：按品牌、状态、日期筛选及分页
- **维修管理**（Kanban 看板）：
  - 维修中/已完成两列看板
  - 故障类型分析侧栏（饼图 + Top N）
  - 完成维修、查看维修记录
- **使用记录**（甘特时间轴 + 责任到人）：
  - 甘特视图：横轴时间（06:00-22:00）、纵轴球车号，色块表示使用时段
  - 列表视图：按日期过滤的使用记录列表
  - 搜索功能：支持球车号、球童工号、球童姓名三种搜索方式
  - 使用详情弹窗：完整操作时间轴（出库→圈次→入库）+ 责任人摘要
  - 责任到人：每个操作节点记录操作人（球童姓名 + 工号）

### 球员管理（跨球场平台级架构）

- **双集合架构**：
  - `players`（平台级）：球员基础信息、六位球员编号、unionid、登记车辆
  - `player_club_profiles`（球场级）：会员卡、余额、消费二维码、会员等级
- **球员列表**：
  - 搜索框（400ms 防抖）：支持姓名/手机号/球员编号/消费卡号
  - 无限滚动分页加载
  - 显示：头像首字母、姓名、手机号、消费卡号、球员号（Mono字体）、会员等级徽章、余额
- **新增球员弹窗**：
  - 基础信息：姓名（必填）、手机号、性别、国籍
  - 球场档案：会员等级、消费卡号（可留空自动生成）
  - 自动生成：六位球员号、会员卡号、消费二维码
- **详情抽屉**（右侧弹出）：
  - 渐变余额卡：显示当前余额、消费卡号、快捷充值按钮
  - 消费二维码：显示 QR code + 刷新按钮
  - 基础信息：性别、国籍、加入时间
  - 登记车辆列表：车牌号、品牌、车型、常用车标记
- **充值弹窗**：
  - 金额输入框（大字体右对齐）
  - 快捷金额按钮（¥100/¥200/¥500/¥1000）
  - 5 种支付方式选择（现金/微信/支付宝/银行卡/转账）
  - 自动写入 `transactions` 流水记录
- **核心字段**：
  - `playerNo`：六位纯数字，全平台唯一，系统随机生成
  - `consumeCardNo`：实体消费卡号，球场内唯一，前台刷卡/输入备用
  - `qrCode.code`：消费二维码唯一标识，主要识别方式
  - `account.balance`：账户余额，支持充值、扣费、退款
  - `vehicles[]`：登记车辆数组，支持多辆车、常用车标记

### 系统设置

- **球会信息**（`club_info`）：球会基础资料
- **预订规则**（`booking_rules`）：预订时间、人数等规则
- **价格规则**（`pricing_rules`）：费用计算规则

### 鉴权

- **微信扫码登录**：
  1. 前端请求 `POST /api/auth/qrcode`，获得 `qrId` 和 `qrCodeUrl`
  2. 使用微信官方 `WxLogin` 展示二维码
  3. 前端轮询 `GET /api/auth/check-status/:qrId`（约 2 秒一次）
  4. 用户扫码确认后，后端生成 JWT（7 天有效期），前端收到 `token` 和 `userInfo`
  5. 或通过微信回调 `/api/auth/callback`，后端用 code 换 openid/unionid，查 users 集合，生成 JWT 并重定向至 `/auth/callback?token=xxx`
- **Token 存储**：JWT 存 Cookie（`token`，7 天有效期），用户信息存 localStorage
- **请求鉴权**：Axios 从 Cookie 读取 token，设置 `Authorization: Bearer <token>`；401 时 toast 提示并跳转 `/login`
- **球车/维修接口**：`requireAuthWithClubId` 中间件解析 JWT，校验 `clubId`，注入 `req.clubId`、`req.userId`，数据按 `clubId` 隔离

---

## 目录结构

```
kaichuiweb/
├── src/
│   ├── main.tsx               # 前端入口
│   ├── App.tsx                # 根组件
│   ├── index.css              # 全局样式
│   ├── pages/                 # 页面
│   │   ├── Login.tsx          # 扫码登录（粒子背景）
│   │   ├── Home.tsx           # 首页（侧边栏、双视图）
│   │   ├── AuthCallback.tsx   # 授权回调
│   │   ├── Settings/          # 系统设置（ClubInfo、BookingRules、PricingRules）
│   │   ├── Resources/         # 资源管理（Courses、Caddies）
│   │   ├── Bookings/          # 预订管理（TeeSheet、BookingForm）
│   │   ├── CartManagement/    # 球车管理
│   │   └── Players/           # 球员管理
│   ├── components/ui/         # 通用 UI（Button、Dropdown、AlertDialog）
│   ├── store/                 # Redux（authSlice、store）
│   ├── router/                # 路由与受保护路由
│   ├── utils/api.ts           # Axios 封装与拦截器
│   └── lib/utils.ts           # 工具函数
├── server/
│   ├── app.js                 # Express 入口
│   ├── routes/                # 路由
│   │   ├── orders.js          # 订单
│   │   ├── settings.js        # 系统设置
│   │   ├── resources.js       # 资源（球场、球童、球车）
│   │   ├── bookings.js        # 预订
│   │   ├── players.js         # 球员管理
│   │   ├── carts.js           # 球车管理
│   │   └── maintenance.js     # 维修管理
│   ├── middleware/            # auth-cart（球车鉴权中间件）
│   ├── utils/                 # db-http、jwt-helper
│   └── ...
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── container.config.json      # 云托管配置
├── Dockerfile
├── .dockerignore
└── .env                       # 本地环境变量（生产用控制台配置）
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

# 2. 配置环境变量
# 复制 .env.example 为 .env 并填入必要变量（见下方环境变量表）

# 3. 启动后端（默认 PORT=3000）
pnpm server:dev   # nodemon 热重载
# 或
pnpm server

# 4. 启动前端（Vite 5173，代理 /api -> localhost:3000）
pnpm dev

# 5. 访问
# http://localhost:5173 → 扫码登录
```

---

## 构建与部署

### 本地构建

```bash
pnpm build          # tsc + vite build，输出到 dist/
pnpm install --prod
pnpm server         # 启动生产服务
```

### Docker 部署

```bash
docker build -t kaichui-erp .
docker run -p 80:80 --env-file .env kaichui-erp
```

- 多阶段构建：阶段一用 Node 18 构建前端，阶段二用 `node:18-slim` 运行
- 环境变量通过云托管控制台配置，不在镜像内写死

### 腾讯云托管

- 使用 `container.config.json` 配置（端口、CPU、内存、扩缩容等）
- 环境变量在云托管控制台配置

---

## 必要环境变量

### 后端

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

### 前端

| 变量名 | 说明 |
|--------|------|
| `VITE_API_BASE_URL` | 前端 API 基地址，默认 `/api` |

> 生产环境务必通过云托管控制台设置，勿将密钥写入 `.env` 并提交。

---

## 数据库集合

### 认证与用户

| 集合 | 用途 |
|------|------|
| `qrcode_tickets` | 扫码登录票据 |
| `users` | 用户（含 `clubId`、`unionid`） |

### 预订与订单

| 集合 | 用途 |
|------|------|
| `bookings` | 预订记录 |
| `orders` | 订单 |
| `transactions` | 交易流水 |

### 球车相关

| 集合 | 用途 |
|------|------|
| `carts` | 球车 |
| `cart_usage_records` | 球车使用记录 |
| `maintenance_records` | 维修记录 |
| `cart_daily_snapshot_summary` | 每日统计快照（可选） |
| `cart_daily_snapshot_items` | 每日快照明细（可选） |
| `carbrands` | 品牌选项（可选） |
| `cart_fault_types` | 故障类型（可选） |

### 球员相关

| 集合 | 用途 |
|------|------|
| `players` | 平台级球员档案 |
| `player_club_profiles` | 球场级球员档案（会员卡、余额、消费二维码） |

### 资源与设置

| 集合 | 用途 |
|------|------|
| `courses` | 球场 |
| `caddies` | 球童 |
| `club_info` | 球会信息 |
| `booking_rules` | 预订规则 |
| `pricing_rules` | 价格规则 |

---

## API 接口

### 认证

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/auth/qrcode` | POST | 生成登录二维码 |
| `/api/auth/callback` | GET | 微信授权回调 |
| `/api/auth/check-status/:qrId` | GET | 轮询扫码状态（限流） |
| `/api/auth/verify` | GET | 验证 Token |

### 预订管理（bookings.js v2）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/bookings` | GET | 预订列表（支持按日期、球场、状态筛选） |
| `/api/bookings` | POST | 创建预订（自动生成 orderNo、pricing{}、statusHistory[]） |
| `/api/bookings/:id` | GET | 预订详情（含完整 pricing、payments、assignedResources） |
| `/api/bookings/:id` | PUT | 更新预订（乐观锁并发保护，statusHistory 自动追加） |
| `/api/bookings/:id` | DELETE | 删除预订 |
| `/api/bookings/tee-sheet` | GET | 发球表（按日期、球场） |
| `/api/bookings/:id/confirm` | PUT | 确认预订 |
| `/api/bookings/:id/check-in` | PUT | 办理签到 |
| `/api/bookings/:id/complete` | PUT | 完成打球 |
| `/api/bookings/:id/cancel` | PUT | 取消预订（自动释放球童） |
| `/api/bookings/:id/pay` | POST | 收款（追加 payments[]，更新 paidFee/pendingFee） |
| `/api/bookings/:id/payments` | GET | 查询支付记录 + pricing 汇总 |
| `/api/bookings/:id/resources` | PUT | 更新资源分配（球车/更衣柜/客房/球包/停车） |

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

### 球员管理（跨球场双集合架构）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/players/search` | GET | 四路查找（playerNo/手机号/姓名/消费卡号/二维码） |
| `/api/players` | GET | 球员列表（通过 profiles 按 clubId 过滤） |
| `/api/players/:id` | GET | 球员详情 + 球场档案 |
| `/api/players` | POST | 创建球员（同时创建 players + player_club_profiles） |
| `/api/players/:id` | PUT | 更新平台基础信息（姓名/手机/性别/国籍） |
| `/api/players/:id/profile` | PUT | 更新球场档案（会员等级/消费卡号/状态） |
| `/api/players/:id/recharge` | POST | 账户充值（写 transactions 流水） |
| `/api/players/:id/refresh-qrcode` | POST | 刷新消费二维码 |
| `/api/players/:id/vehicles` | POST | 添加/更新车辆信息 |
| `/api/players/:id` | DELETE | 软删除球员 |

### 系统设置

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/settings/club-info` | GET/PUT | 球会信息 |
| `/api/settings/booking-rules` | GET/PUT | 预订规则 |
| `/api/settings/pricing-rules` | GET/PUT | 价格规则 |

### 资源管理

| 前缀 | 说明 |
|------|------|
| `/api/resources/courses` | 球场 CRUD |
| `/api/resources/caddies` | 球童 CRUD |
| `/api/resources/carts` | 资源侧球车 CRUD |

### 订单与其他

| 接口/前缀 | 说明 |
|-----------|------|
| `/api/orders` | 订单 CRUD |
| `/api/golf/orders` | 订单示例 |
| `/api/users` | 用户列表示例 |
| `/api/db-test` | 数据库连通性测试 |
| `/health` | 健康检查 |

---

## 核心业务设计

### bookings.js v2 数据结构升级

**新增字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `orderNo` | string | 订单号（ORD + 日期8位 + 3位序号），自动生成 |
| `pricing{}` | object | 费用结构对象（见下表） |
| `payments[]` | array | 支付记录数组，每次收款追加一条 |
| `statusHistory[]` | array | 状态变更历史，自动追加时间戳/操作人/原因 |
| `version` | number | 乐观锁版本号，从 1 开始，每次更新 +1 |
| `assignedResources{}` | object | 到访资源分配（球童/球车/更衣柜/客房/球包/停车） |
| `stayType` | string | 住宿类型（day/overnight_1/overnight_2/custom） |

**pricing 结构**：

```javascript
{
  greenFee: 720.00,        // 果岭费
  caddyFee: 200.00,        // 球童费
  cartFee: 150.00,         // 球车费
  insuranceFee: 10.00,     // 保险费
  roomFee: 0.00,           // 客房费
  otherFee: 0.00,          // 其他费用
  discount: 0.00,          // 折扣金额（正数）
  totalFee: 1080.00,       // 应收合计
  paidFee: 1080.00,        // 已付金额
  pendingFee: 0.00         // 待付金额 = totalFee - paidFee
}
```

**assignedResources 结构**：

```javascript
{
  caddies: [{ caddyId, caddyName, caddieNumber, fee, assignedAt, assignedBy }],
  carts: [{ cartId, cartNumber, cartBrand, fee, assignedAt, usageRecordId }],
  lockers: [{ lockerNumber, lockerArea, assignedToPlayerId, assignedAt, returnedAt }],
  rooms: [{ roomNumber, roomType, checkInDate, checkOutDate, nights, guestPlayerId, fee }],
  bagStorage: [{ storageNo, playerId, bagDescription, storedAt, expectedPickupDate, pickedUpAt }],
  parking: {
    plateNo, carBrand, parkingSpot, arrivedAt, departedAt,
    companions: [{ playerId, playerName, playerNo, isDriver }],
    driverPlayerId, allowDeparture
  }
}
```

**状态机设计**：

```
pending → confirmed → checked_in → playing → completed
                    ↘ cancelled              ↘ no_show
```

**状态流转白名单**：

```javascript
const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['playing', 'completed', 'cancelled'],
  playing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: []
}
```

**乐观锁机制**：

- 前端 PUT 时传 `version` 字段
- 后端校验 `version` 是否与数据库一致
- 不一致返回 409 Conflict，提示用户刷新后重试
- 成功更新后 `version` 自动 +1

### 球员管理跨球场架构

**双集合设计**：

1. **players（平台级，无 clubId）**
   - 用途：球员基础信息，跨球场通用
   - 关键字段：`playerNo`（六位唯一ID）、`unionid`、`phoneNumber`、`vehicles[]`
   - 识别方式：`playerNo` + `unionid` + `phoneNumber` 三重识别

2. **player_club_profiles（球场级，有 clubId）**
   - 用途：球员在各球场的独立档案
   - 关键字段：`memberCard`（消费卡号 + 二维码）、`account.balance`、`memberLevel`
   - 一人一场一档案：`{ playerId: 1, clubId: 1 }` 唯一索引

**六位球员编号（playerNo）**：

- 格式：`100000` ~ `999999` 纯数字
- 生成：随机生成，碰撞重试（最多20次）
- 用途：前台查询、实体卡印刷、短信通知
- 特点：易记、易输入、跨球场唯一

**消费识别三备份方案**：

1. **主要方式**：扫消费二维码（`qrCode.code`）
2. **备用方式**：刷/输消费卡号（`consumeCardNo`）
3. **兜底方式**：手机号/姓名查询

---

## 故障排查

| 现象 | 排查方向 |
|------|----------|
| 二维码生成失败 | 检查 `WX_WEB_APPID/WX_WEB_SECRET` 及回调域名 |
| 数据库连接超时 | 设置 `USE_HTTP_DB=true` 并配置 `WX_APPID` + `WX_APP_SECRET`，或调大 `WARMUP_TIMEOUT_MS` |
| HTTP DB 模式报错 | 见下方「HTTP DB 适配器修复记录」 |
| 登录后立即跳回 | 检查 `JWT_SECRET`、cookie、同域策略 |
| 跨域问题 | 检查 Vite 代理、`VITE_API_BASE_URL` |
| 球员搜索无结果 | 检查 `players` 和 `player_club_profiles` 集合数据，确认 `clubId` 正确 |

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

## 开发记录

### v2.0.0 - 完整业务闭环（2026-02-12）

**已完成功能**：

1. **预订管理升级**
   - ✅ bookings.js v2：orderNo/pricing/payments/statusHistory/version/assignedResources
   - ✅ 签到弹窗（CheckInDialog）：球车号/更衣柜号/球包寄存号分配
   - ✅ 收银台（CashierDialog）：费用明细/6种收款方式/历史支付/组合支付
   - ✅ 取消确认（CancelDialog）：防误操作/填写取消原因
   - ✅ BookingForm v2：球员搜索下拉/自动带入会员等级/费用自动计算

2. **球员管理**
   - ✅ 双集合架构：players（平台级）+ player_club_profiles（球场级）
   - ✅ 六位球员编号（playerNo）自动生成
   - ✅ 球员列表：搜索/分页/无限滚动
   - ✅ 新增球员：基础信息 + 球场档案
   - ✅ 详情抽屉：余额卡/消费二维码/登记车辆
   - ✅ 充值弹窗：金额输入/快捷金额/支付方式
   - ✅ 车辆管理：登记多辆车/常用车标记

3. **球车管理 Web 深度适配**
   - ✅ 数据总览：8项KPI + 堆叠条 + SVG利用率仪表盘
   - ✅ 球车管理：Master-Detail 布局/表格+详情面板/批量操作
   - ✅ 维修管理：Kanban 看板（维修中/已完成）+ 故障分析
   - ✅ 使用记录：甘特时间轴/列表视图切换/责任到人搜索

4. **系统设置**
   - ✅ 球会信息（club_info）
   - ✅ 预订规则（booking_rules）
   - ✅ 价格规则（pricing_rules）

5. **资源管理**
   - ✅ 球场管理（courses）
   - ✅ 球童管理（caddies）

**未来规划**：

1. **Phase 3 - 数据分析与报表**
   - 📋 首页仪表盘升级（今日营收/预订数/上座率/KPI趋势）
   - 📋 营收统计报表（日报/周报/月报）
   - 📋 球员消费分析（RFM模型/客单价/复购率）
   - 📋 球车使用效率分析

2. **Phase 4 - 高级功能**
   - 📋 记分卡管理（个人记分/团队玩法/差点计算）
   - 📋 审计日志（操作追溯/数据变更历史）
   - 📋 权限管理精细化（角色权限/数据权限）
   - 📋 消息通知（微信模板消息/短信提醒）

3. **Phase 5 - 小程序端**
   - 📋 球员自助预订（扫码选场/时段/球童）
   - 📋 我的预订（查看/取消/修改）
   - 📋 消费记录查询
   - 📋 余额充值/积分兑换

---

## 技术亮点

1. **跨球场平台级架构**：`players` 无 clubId、`player_club_profiles` 有 clubId，支持球员跨场消费
2. **HTTP DB 适配器**：自研 `httpDbCommand` 和 `serializeWhere()`，完美兼容 TCB SDK 命令对象
3. **乐观锁并发控制**：bookings 的 `version` 字段 + 409 冲突返回，防止资源重复分配
4. **状态机设计**：`ALLOWED_TRANSITIONS` 白名单，服务端强制校验状态流转合法性
5. **责任到人**：球车使用记录搜索球童工号/姓名，每个操作节点记录操作人
6. **Master-Detail 布局**：球车管理左表格右详情，点击无需弹窗，信息密度高
7. **甘特时间轴**：使用记录可视化，横轴时间纵轴球车号，色块表示使用时段
8. **组合支付**：收银台支持现金+微信+会员卡等多种方式组合收款
9. **数据快照冗余**：订单中冗余球员姓名/等级/价格，保证历史数据完整性不受后续修改影响
10. **三备份消费识别**：二维码（主）→ 消费卡号（备）→ 手机号/姓名（兜底）

---

如需新增部署脚本或环境变量，请同步更新本文档。
