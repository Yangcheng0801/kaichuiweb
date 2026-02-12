## 开锤后台管理系统

基于 **Vite + React + TypeScript + Redux Toolkit** 的后台前端，与 **Express + wx-server-sdk** 编写的后端共存于同一仓库，面向微信扫码登录、后台数据展示及腾讯云开发（TCB）部署场景。

---

### 技术栈
- 前端：React 18、React Router 6、Redux Toolkit、Tailwind CSS、Radix UI、sonner、lucide-react。
- 后端：Node.js 18+、Express、wx-server-sdk、axios、jsonwebtoken。
- 构建/工具：Vite 5、TypeScript 5、pnpm、Docker（可选）。

---

### 功能特性

#### 首页布局与交互
- **隐藏式侧边栏**：桌面端鼠标靠近左侧边缘（约 8px 宽触发区）时自动展开，移开后立即收起；展开宽度 230px，带有 300ms 缓动动画。
- **移动端抽屉**：小屏幕下使用左上角菜单按钮打开抽屉式导航，点击遮罩或关闭按钮可收起。
- **纯白主体设计**：浮动卡片风格，主内容区与侧边栏均采用圆角、阴影与渐变背景。
- **响应式布局**：主体占满屏幕宽度，数据卡片网格随断点自适应（1 列 → 2 列 → 4 列）。

#### 双视图模式（类似 Windows 小窗）
- **进入方式**：在任意页面长按（约 800ms）任一其他导航模块，进入放置模式。
- **放置交互**：主视图半屏显示于左侧，右侧为放置区域；拖动至左/右目标区域后释放，悬停时目标区域高亮（绿色描边）。
- **放置规则**：释放到左侧 → 新模块在左、主视图平滑移至右；释放到右侧 → 主视图在左、新模块在右。
- **分割线**：中间可拖拽分割线调整左右比例，默认 5:5。
- **副视图切换**：双视图模式下点击其他模块可切换右侧副视图；点击「关闭双视图」按钮退出。
- **取消**：放置模式下按 `Esc` 可取消。

#### 球车管理（独立一级菜单）
- **数据总览**：9 项 KPI（总球车数、可用、在用、维修中、禁用、未借出、已借出、未归还、均用时长）。
- **球车管理**：球车 CRUD、批量新增、批量更新状态、删除；支持按品牌、状态、日期筛选及分页。
- **维修管理**：维修记录列表、完成维修、故障类型分析、故障类型列表。
- **使用记录**：查看球车使用记录及详情。
- **鉴权**：统一使用 `users.clubId → JWT clubId`，通过 `requireAuthWithClubId` 注入 `req.clubId`，与小程序云函数逻辑对齐。

---

### 目录速览
```
├── src/
│   ├── pages/           # 页面：Login、Home、AuthCallback、CartManagement、Resources、Settings 等
│   ├── components/ui/   # 通用 UI（Button、Dropdown、AlertDialog 等）
│   ├── store/           # Redux：authSlice、store
│   ├── router/          # 路由与受保护路由
│   └── utils/           # api、utils
├── server/
│   ├── routes/          # 路由：carts、maintenance、auth、users、golf 等
│   ├── middleware/      # auth-cart（球车鉴权）、auth 等
│   ├── utils/           # db-http（HTTP 数据库适配器）
│   └── app.js           # Express 入口，API、微信扫码登录、静态资源托管
├── container.config.json# 云托管容器配置（如需使用 TCB）
├── Dockerfile           # 可选容器打包脚本
├── package.json         # 前后端共用脚本
└── .env                 # 本地开发环境变量（生产请改用云托管控制台配置）
```

---

### 环境准备
- Node.js 18+（建议搭配 pnpm 8）。
- 全局安装 pnpm：`npm install -g pnpm`。
- 若需对接腾讯云开发数据库，请准备一个 TCB 环境，并在云托管服务里配置文末列出的环境变量。

---

### 快速开始
1. 安装依赖  
   ```bash
   pnpm install
   ```
2. 启动本地后端（默认监听 `PORT`，建议在 `.env` 中设定 `PORT=3000`）：  
   ```bash
   pnpm server:dev   # nodemon
   # 或
   pnpm server       # 直接 node server/app.js
   ```
3. 启动前端开发服务器（Vite，默认 5173 端口，自动代理 `/api` -> `http://localhost:3000`）：  
   ```bash
   pnpm dev
   ```
4. 访问 `http://localhost:5173`，扫码登录链路会请求后端接口 `/api/auth/*`。

---

### 构建与生产运行
1. 构建前端产物：`pnpm build`，输出 `dist/`。
2. 后端 `server/app.js` 会通过 `express.static` 托管 `dist`，生产环境只需：
   ```bash
   pnpm install --prod
   pnpm build          # 若未事先构建
   pnpm server         # 或通过 Docker / 云托管启动
   ```
3. 云托管（TCB）部署建议：
   - 使用仓库自带 `Dockerfile` 或者 TCB 提供的「一键部署」模板。
   - 在「服务配置 → 环境变量」里写入必需变量（见下方）。
   - 确认服务绑定到正确的云开发环境（`TCB_ENV_ID`），并已在数据库中创建以下集合：
     - 认证/用户：`qrcode_tickets`、`users`
     - 球车管理：`carts`、`cart_usage_records`、`maintenance_records`、`carbrands`（可选）

---

### 必要环境变量

| 变量名 | 必填 | 说明 | 示例/建议 |
|--------|------|------|-----------|
| `TCB_ENV_ID` | 是（生产） | 云开发环境 ID，供 `wx-server-sdk` 直连 | `kaichui-prod-xxxx` |
| `CBR_ENV_ID` | 否 | 兼容微信云托管老变量，若存在会作为 TCB 备选 | `kaichui-prod` |
| `WX_WEB_APPID` | 是 | 微信开放平台网站应用 AppID（扫码登录用） | `wx1234567890ab` |
| `WX_WEB_SECRET` | 是 | 与 `WX_WEB_APPID` 对应的 Secret | — |
| `WX_CALLBACK_BASE` | 否 | 微信扫码回调域名，默认 `https://www.kaichui.com.cn` | `https://admin.kaichui.com` |
| `FRONTEND_BASE_URL` | 否 | 登录成功后重定向的前端域名，未设置时复用 `WX_CALLBACK_BASE` | `https://admin.kaichui.com` |
| `JWT_SECRET` | 是（生产） | 签发登录 Token 的密钥。本地若缺失自动回退默认值 | 强烈建议至少 32 位随机串 |
| `USE_HTTP_DB` | 否 | 设为 `true` 时，改用 `createHttpDb` 通过微信 TCB HTTP API 访问数据库（云托管内网 SDK 不可达时使用） | `false` |
| `WX_APPID` & `WX_APP_SECRET` | 条件必填 | `USE_HTTP_DB=true` 时**必填**，需为**拥有该云开发环境的小程序**凭证；TCB API 仅接受该主体 access_token。与扫码登录的 `WX_WEB_APPID` 不同 | `wx2766aa***` |
| `TCB_API_KEY` / `TCB_ACCESS_TOKEN` | 否 | 若启用 HTTP DB 测试（`/api/db-test?method=http`）需提供 | 从云开发控制台生成 |
| `PORT` | 否 | Express 监听端口，本地常设为 `3000`，云托管保持默认 `80` | `3000` |
| `WARMUP_TIMEOUT_MS` | 否 | 数据库预热超时时间（毫秒） | `8000` |
| `VITE_API_BASE_URL` | 否（前端构建时） | Vite 编译期注入的 API 基地址；默认 `/api` | `https://api.kaichui.com` |

> 生产环境务必通过云托管控制台设置上述变量，不要把敏感信息写入 `.env` 并提交到仓库。

---

### 前后端联调流程
1. **准备 `.env`**  
   本地需要至少配置：
   ```
   PORT=3000
   JWT_SECRET=dev-secret
   WX_WEB_APPID=xxxx
   WX_WEB_SECRET=yyyy
   WX_CALLBACK_BASE=http://localhost:3000
   FRONTEND_BASE_URL=http://localhost:5173
   TCB_ENV_ID=your-test-env   # 如仅在本地演示，可留空，但与真实数据库交互会失败
   ```
   若暂时没有真实微信开放平台 AppID，可构造虚拟数据来调试除扫码环节以外的页面逻辑。

2. **启动服务**  
   - 先运行后端 `pnpm server:dev`，确保日志显示环境变量及「预热」结果。
   - 再运行前端 `pnpm dev`，Vite 会使用 `vite.config.ts` 中的代理把 `/api/*` 请求转发到 `http://localhost:3000`。

3. **扫码链路**  
   - 登录页通过 `POST /api/auth/qrcode` 获取微信官方网站组件参数；需要后端能访问微信接口并写入云开发数据库。
   - 前端每 2 秒轮询 `/api/auth/check-status/:qrId`，当状态为 `confirmed` 时会获得后端签发的 token 并进入 `/home`。
   - 若只想本地验证 UI，可在浏览器 DevTools 中模拟接口响应或直接调用 Redux action 写入假 token。

4. **接口调试**  
   - 除认证相关接口外，还有 `/api/golf/orders`、`/api/users` 等示例，便于对接真实业务。
   - `GET /api/db-test` 可检查 SDK/HTTP/微信 API 的数据库连通性，是排查云托管网络问题的首选。
   - 球车管理相关接口见下方「球车管理 API」。

---

### 球车管理 API

与小程序球车管理模块共用同一云开发环境，集合 `carts`、`cart_usage_records`、`maintenance_records` 需已存在。所有接口需通过 `requireAuthWithClubId` 校验，`req.clubId` 来自 JWT。

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/carts/statistics` | GET | 数据总览 9 项 KPI |
| `/api/carts/brands` | GET | 品牌选项列表 |
| `/api/carts` | GET | 球车列表（分页、筛选） |
| `/api/carts` | POST | 新增球车 |
| `/api/carts/batch` | POST | 批量新增球车 |
| `/api/carts/:id` | PUT | 编辑球车 |
| `/api/carts/batch-status` | PUT | 批量更新状态 |
| `/api/carts` | DELETE | 删除球车 |
| `/api/carts/usage` | GET | 使用记录列表 |
| `/api/carts/usage/:id` | GET | 使用记录详情 |
| `/api/maintenance` | GET | 维修记录列表 |
| `/api/maintenance/:id/complete` | PUT | 完成维修 |
| `/api/maintenance/fault-analysis` | GET | 故障类型分析 |
| `/api/maintenance/fault-types` | GET | 故障类型列表 |

---

### 部署建议
1. **云托管（推荐）**
   - 完成 `pnpm build` 后，云托管将执行 `node server/app.js` 来同时托管 API 与静态页。
   - 如需容器部署，可直接使用仓库根目录的 `Dockerfile`：其中会安装依赖、编译前端、启动 Node 服务。
   - 在「日志服务」中关注 `服务器启动成功`、`预热`、`[QRCode]` 等日志，以确认环境变量和数据库权限正确。

2. **自建服务器 / 容器**
   - 运行 `pnpm build && pnpm server`，确保 `.env` 中配置好所有变量。
   - 前端与后端走同域部署，浏览器直接访问 Node 服务器即可。
   - 若需要把 API 与前端拆开部署，可让前端在构建时设置 `VITE_API_BASE_URL=https://api.example.com`，并在反向代理中放行 `/api/*`。

---

### 故障排查
- **二维码生成失败**：检查 `WX_WEB_APPID/WX_WEB_SECRET` 是否正确，是否已在微信开放平台里设置合法回调域名。
- **数据库连接超时**：云托管内若频繁超时，可设置 `USE_HTTP_DB=true` 并配置 `WX_APPID` + `WX_APP_SECRET`（小程序凭证），或调大 `WARMUP_TIMEOUT_MS`。
- **HTTP DB 模式报错**：`USE_HTTP_DB=true` 时必须配置拥有云开发环境的小程序 `WX_APPID`、`WX_APP_SECRET`。`db-http.js` 已实现 `count()`、链式 `orderBy()` 等，兼容球车管理等业务。
- **登录后立即跳回登录页**：多为 `JWT_SECRET` 未配置或前端 cookie 写入失败，检查浏览器 cookie、同域策略以及 `checkLoginStatus` 的网络响应。
- **本地联调跨域问题**：确保 Vite 端口与 Express 端口一致地写在代理配置内，或通过 `VITE_API_BASE_URL` 指向运行中的后端地址。

如需新增部署脚本或环境变量，请同步更新本文档，保持团队对配置项的一致认知。
