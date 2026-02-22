# ==================== 阶段一：编译前端 ====================
FROM node:18 AS build-stage

WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，用于前端构建）
RUN npm install --legacy-peer-deps

# 复制前端源码
COPY . .

# 执行 Vite 构建，生成 dist 目录
RUN npm run build

# ==================== 阶段二：运行后端 ====================
FROM node:18-slim

WORKDIR /app

# 从构建阶段复制编译好的前端静态文件
COPY --from=build-stage /app/dist ./dist

# 复制 package.json 和 package-lock.json
COPY --from=build-stage /app/package*.json ./

# 只安装后端生产依赖（不需要 Vite 等开发工具）
RUN npm install --only=production

# 复制后端代码
COPY ./server ./server

# 环境变量请在「腾讯云开发控制台 - 云托管 - 服务 - 版本配置 - 环境变量」中设置，勿在镜像内写死密钥。
# 必填：TCB_ENV_ID、WX_WEB_APPID、WX_WEB_SECRET、JWT_SECRET
# 可选：USE_HTTP_DB（SDK 连库超时时可设为 true，走微信 HTTP API）

# 暴露端口
EXPOSE 80

# 启动后端服务
CMD ["node", "server/app.js"]
