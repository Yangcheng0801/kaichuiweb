// 本地开发时从项目根目录 .env 加载环境变量（云托管环境变量由控制台注入，无需 .env）
require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') });

const express = require('express');
const path = require('path');
const https = require('https');
const cloud = require('wx-server-sdk');
const axios = require('axios');
const { generateToken, verifyToken } = require('./utils/jwt-helper');
const { createHttpDb } = require('./utils/db-http');

// 仅用于 /api/db-test 中请求微信接口：云托管出口可能经代理/自签名证书，导致 DEPTH_ZERO_SELF_SIGNED_CERT
const httpsAgentInsecure = new https.Agent({ rejectUnauthorized: false });

const app = express();

// 1. 初始化云开发环境（适配：腾讯云开发云托管）
// 腾讯云开发云托管：服务绑定到某个云开发环境，请务必在「云开发控制台 - 云托管 - 服务配置」中设置 TCB_ENV_ID。
// 优先顺序：TCB_ENV_ID（推荐） > CBR_ENV_ID（兼容微信云托管）
const targetEnv = process.env.TCB_ENV_ID || process.env.CBR_ENV_ID || '';

console.log('==================================');
console.log('[环境检查] 腾讯云开发云托管');
console.log('[环境检查] 云开发环境 ID (TCB_ENV_ID):', process.env.TCB_ENV_ID ? process.env.TCB_ENV_ID.substring(0, 12) + '***' : '未设置');
console.log('[环境检查] 使用的云开发环境 ID:', targetEnv || '未设置（请在控制台配置 TCB_ENV_ID）');
console.log('[环境检查] 环境变量:');
console.log('  - TCB_ENV_ID:', process.env.TCB_ENV_ID ? '已设置' : '未设置');
console.log('  - WX_WEB_APPID:', process.env.WX_WEB_APPID ? process.env.WX_WEB_APPID.substring(0, 6) + '***' : '未设置');
console.log('  - JWT_SECRET:', process.env.JWT_SECRET ? '已配置 (***' + process.env.JWT_SECRET.slice(-4) + ')' : '未设置');
console.log('  - USE_HTTP_DB:', process.env.USE_HTTP_DB || 'false');
console.log('==================================');

// JWT_SECRET：用于 Web 扫码登录后签发/校验 Token 的密钥。生产环境必须在云托管环境变量中配置，否则无法登录。
// 仅本地开发（NODE_ENV !== 'production'）时未配置才使用默认值；生产环境未配置会在登录/验签时返回 500 并提示。
function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') return s || null;
  return s || 'kaichui-golf-secret-2026';
}

if (!targetEnv) {
  console.warn('[环境检查] 未设置 TCB_ENV_ID，云开发数据库将无法连接。请在云开发控制台配置环境变量。');
}
cloud.init({
  env: targetEnv || undefined
});

console.log('✅ 云开发环境已初始化:', targetEnv || '(未设置，请配置 TCB_ENV_ID)');

// 数据库访问：USE_HTTP_DB=true 时走 HTTP API（SDK 连库超时时可选）
const USE_HTTP_DB = process.env.USE_HTTP_DB === 'true';
const getDb = () => (USE_HTTP_DB ? createHttpDb(targetEnv) : cloud.database());
if (USE_HTTP_DB) console.log('[DB] 使用 HTTP 方式访问云开发数据库 (USE_HTTP_DB=true)');

// 2. 中间件：解析 JSON 请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2.1 轮询接口限流：防止恶意刷资源（每 IP 每 5 分钟最多 200 次 check-status 请求）
const checkStatusRateLimit = new Map(); // key: ip, value: { count, resetAt }
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 200;

function checkStatusRateLimitMiddleware(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  let record = checkStatusRateLimit.get(ip);
  if (!record) {
    record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    checkStatusRateLimit.set(ip, record);
  }
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  record.count++;
  if (record.count > RATE_LIMIT_MAX) {
    console.warn('[RateLimit] check-status 超过限流，IP:', ip);
    return res.status(429).json({
      success: false,
      message: '请求过于频繁，请稍后再试',
      data: { status: 'rate_limited' }
    });
  }
  next();
}

// 首页仪表盘路由（聚合 KPI / 资源概况 / 近期动态）
app.use('/api/dashboard', require('./routes/dashboard')(getDb));

// 统一消费 / 挂账中心（Folio 账单体系）
app.use('/api/folios', require('./routes/folios')(getDb));

// 更衣柜租赁合同管理
app.use('/api/locker-contracts', require('./routes/locker-contracts')(getDb));

// 客房清洁任务管理
app.use('/api/housekeeping', require('./routes/housekeeping')(getDb));

// 住宿套餐管理
app.use('/api/stay-packages', require('./routes/stay-packages')(getDb));

// 价格矩阵管理（定价引擎核心数据）
app.use('/api/rate-sheets', require('./routes/rate-sheets')(getDb));

// 特殊日期管理（节假日/会员日/赛事日/封场日）
app.use('/api/special-dates', require('./routes/special-dates')(getDb));

// 身份类型管理（球员身份：散客/嘉宾/会员/青少年/教练/长者/礼遇/员工等）
app.use('/api/identity-types', require('./routes/identity-types')(getDb));

// 报表与数据分析
app.use('/api/reports', require('./routes/reports')(getDb));

// RBAC 角色与权限管理
app.use('/api/roles', require('./routes/roles')(getDb));

// 审计日志
app.use('/api/audit-logs', require('./routes/audit-logs')(getDb));

// 日结/夜审
app.use('/api/daily-close', require('./routes/daily-close')(getDb));

// 餐饮 POS 系统
app.use('/api/dining-outlets', require('./routes/dining-outlets')(getDb));
app.use('/api/tables', require('./routes/tables')(getDb));
app.use('/api/menu', require('./routes/menu')(getDb));
app.use('/api/dining-orders', require('./routes/dining-orders')(getDb));

// 订单路由（与主应用共用 getDb，适配腾讯云开发云托管）
app.use('/api/orders', require('./routes/orders')(getDb));

// 系统设置路由：球会信息、预订规则、价格规则
app.use('/api/settings', require('./routes/settings')(getDb));

// 资源管理路由：球场、球童、球车
app.use('/api/resources', require('./routes/resources')(getDb));

// 预订管理路由
app.use('/api/bookings', require('./routes/bookings')(getDb));

// 球员管理路由（平台级球员档案 + 球场档案 + 充值）
app.use('/api/players', require('./routes/players')(getDb));

// 更衣柜管理路由
app.use('/api/lockers', require('./routes/lockers')(getDb));

// 客房管理路由
app.use('/api/rooms', require('./routes/rooms')(getDb));

// 临时消费卡管理路由
app.use('/api/temp-cards', require('./routes/temp-cards')(getDb));

// 球车管理路由（需 JWT 鉴权，clubId 从 JWT 注入）
const { requireAuthWithClubId } = require('./middleware/auth-cart');
app.use('/api/carts', require('./routes/carts')(getDb, requireAuthWithClubId));
app.use('/api/maintenance', require('./routes/maintenance')(getDb, requireAuthWithClubId));

// 3. 健康检查接口
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    env: targetEnv,
    platform: 'tencent-cloudbase-run'  // 腾讯云开发云托管
  });
});

// 3.1 数据库连接测试（用于排查连接问题）
// 支持多种方式：SDK、HTTP 网关。GET /api/db-test 或 GET /api/db-test?method=sdk|http|all
app.get('/api/db-test', async (req, res) => {
  const method = (req.query.method || 'all').toLowerCase();
  const result = {
    env: targetEnv,
    tcbEnvId: process.env.TCB_ENV_ID ? '已设置' : '未设置',
    timestamp: Date.now(),
    tests: {}
  };

  // ---------- 测试 1：wx-server-sdk 直连 ----------
  if (method === 'sdk' || method === 'all') {
    const sdkStart = Date.now();
    try {
      const db = cloud.database();
      const r = await Promise.race([
        db.collection('qrcode_tickets').limit(1).get(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SDK 请求超时(10s)')), 10000)
        )
      ]);
      const sdkMs = Date.now() - sdkStart;
      result.tests.sdk = {
        ok: true,
        ms: sdkMs,
        message: 'SDK 连接成功',
        count: (r && r.data) ? r.data.length : 0
      };
    } catch (err) {
      const sdkMs = Date.now() - sdkStart;
      result.tests.sdk = {
        ok: false,
        ms: sdkMs,
        message: err.message || 'SDK 连接失败',
        errCode: err.errCode,
        errMsg: err.errMsg,
        code: err.code
      };
    }
  }

  // ---------- 测试 2：HTTP 网关（TCB Gateway）连通性 ----------
  if (method === 'http' || method === 'all') {
    const gatewayBase = `https://${targetEnv}.api.tcloudbasegateway.com`;
    const apiKey = process.env.TCB_API_KEY || process.env.TCB_ACCESS_TOKEN;

    // 2a：只测网关是否可达（不带认证）
    const pingStart = Date.now();
    try {
      await axios.get(`${gatewayBase}/`, { timeout: 8000, validateStatus: () => true });
      result.tests.httpGatewayReachable = {
        ok: true,
        ms: Date.now() - pingStart,
        message: '网关域名可解析且可连接（未鉴权）'
      };
    } catch (err) {
      result.tests.httpGatewayReachable = {
        ok: false,
        ms: Date.now() - pingStart,
        message: err.message || '网关不可达',
        code: err.code
      };
    }

    // 2b：若配置了 TCB API Key，尝试数据库查询（Bearer 认证）
    if (apiKey) {
      const dbStart = Date.now();
      try {
        // CloudBase 网关数据库查询路径（以文档为准，若 404 可再调整）
        const dbUrl = `${gatewayBase}/database/v1/collections/qrcode_tickets/documents?limit=1`;
        const dbRes = await axios.get(dbUrl, {
          timeout: 10000,
          headers: { Authorization: `Bearer ${apiKey}` },
          validateStatus: () => true
        });
        const dbMs = Date.now() - dbStart;
        const ok = dbRes.status >= 200 && dbRes.status < 300;
        result.tests.httpDatabase = {
          ok,
          ms: dbMs,
          status: dbRes.status,
          message: ok ? 'HTTP 数据库查询成功' : (dbRes.data?.message || dbRes.statusText),
          data: ok ? (dbRes.data?.list?.length ?? 0) : undefined
        };
      } catch (err) {
        result.tests.httpDatabase = {
          ok: false,
          ms: Date.now() - dbStart,
          message: err.message || 'HTTP 数据库请求失败',
          code: err.code
        };
      }
    } else {
      result.tests.httpDatabase = {
        skipped: true,
        message: '未配置 TCB_API_KEY / TCB_ACCESS_TOKEN，跳过 HTTP 数据库测试。可在云开发控制台 ApiKey 管理获取'
      };
    }
    // 2c：微信 access_token + api.weixin.qq.com/tcb/databasequery（需小程序 AppID+Secret，或同账号网站应用）
    const wxAppId = process.env.WX_WEB_APPID || process.env.WX_APPID;
    const wxSecret = process.env.WX_WEB_SECRET || process.env.WX_APP_SECRET;
    if (wxAppId && wxSecret) {
      const wxStart = Date.now();
      try {
        const tokenRes = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
          params: { grant_type: 'client_credential', appid: wxAppId, secret: wxSecret },
          timeout: 8000,
          httpsAgent: httpsAgentInsecure
        });
        const token = tokenRes.data.access_token;
        if (!token) {
          result.tests.wxTcbQuery = {
            ok: false,
            ms: Date.now() - wxStart,
            message: '获取 access_token 失败: ' + (tokenRes.data.errmsg || '未知')
          };
        } else {
          const queryRes = await axios.post(
            'https://api.weixin.qq.com/tcb/databasequery',
            { env: targetEnv, query: "db.collection('qrcode_tickets').limit(1).get()" },
            { params: { access_token: token }, timeout: 10000, validateStatus: () => true, httpsAgent: httpsAgentInsecure }
          );
          const wxMs = Date.now() - wxStart;
          const data = queryRes.data;
          const ok = data.errcode === 0 || data.errcode === undefined;
          result.tests.wxTcbQuery = {
            ok,
            ms: wxMs,
            message: ok ? '微信 TCB databasequery 成功' : (data.errmsg || '请求失败'),
            errcode: data.errcode,
            count: (data.pager && data.pager.total) ?? (Array.isArray(data.list) ? data.list.length : 0)
          };
        }
      } catch (err) {
        result.tests.wxTcbQuery = {
          ok: false,
          ms: Date.now() - wxStart,
          message: err.message || '微信 TCB 请求失败',
          code: err.code
        };
      }
    } else {
      result.tests.wxTcbQuery = {
        skipped: true,
        message: '未配置 WX_WEB_APPID+WX_WEB_SECRET（或 WX_APPID+WX_APP_SECRET），跳过微信 TCB databasequery 测试'
      };
    }
  }

  const sdkOk = result.tests.sdk && result.tests.sdk.ok;
  const httpDbOk = result.tests.httpDatabase && result.tests.httpDatabase.ok;
  const wxTcbOk = result.tests.wxTcbQuery && result.tests.wxTcbQuery.ok;
  const anyOk = sdkOk || httpDbOk || wxTcbOk;
  if (method === 'all') {
    result.summary = sdkOk ? 'SDK 可连接' : (httpDbOk || wxTcbOk) ? '仅 HTTP/微信 API 可连接，SDK 不可用（云托管内网可能无法直连云数据库）' : '数据库连接异常，请查看 tests 详情';
  } else {
    result.summary = anyOk ? '当前方式可连接' : '当前方式不可连接';
  }

  res.json(result);
});

// 4. API 路由示例 - 获取订单列表
app.get('/api/golf/orders', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.collection('orders')
      .orderBy('createTime', 'desc')
      .limit(100)
      .get();
    
    res.json({
      success: true,
      data: result.data,
      total: result.data.length
    });
  } catch (error) {
    console.error('获取订单失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 5. API 路由示例 - 获取用户列表
app.get('/api/users', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.collection('users')
      .limit(100)
      .get();
    
    res.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    console.error('获取用户失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 6. API 路由示例 - 创建订单
app.post('/api/golf/orders', async (req, res) => {
  try {
    const db = getDb();
    const orderData = {
      ...req.body,
      createTime: new Date(),
      updateTime: new Date()
    };
    
    const result = await db.collection('orders').add({
      data: orderData
    });
    
    res.json({
      success: true,
      data: {
        _id: result._id,
        ...orderData
      }
    });
  } catch (error) {
    console.error('创建订单失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 微信扫码登录相关接口 ====================

// 7. 生成登录二维码
app.post('/api/auth/qrcode', async (req, res) => {
  console.log('[QRCode] 生成二维码请求');
  
  try {
    const db = getDb();
    const { clubId } = req.body;
    
    // 从环境变量获取微信网站应用 AppID
    const appId = process.env.WX_WEB_APPID;
    
    if (!appId) {
      console.error('[QRCode] 未配置 WX_WEB_APPID 环境变量');
      return res.status(500).json({
        success: false,
        message: '服务器配置错误：未配置网站应用 AppID'
      });
    }
    
    console.log('[QRCode] 使用网站应用 AppID:', appId.substring(0, 6) + '***');
    
    // 生成唯一的 ticket（用于标识这次扫码登录，同时作为 WxLogin 的 state 传回回调）
    const ticket = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // WxLogin 官方组件所需参数（扫码后正确显示授权确认，而非「拿出手机扫一扫」）
    const callbackBase = process.env.WX_CALLBACK_BASE || 'https://www.kaichui.com.cn';
    const redirectUri = encodeURIComponent(`${callbackBase}/api/auth/callback`);
    const scope = 'snsapi_login';
    
    // 将 ticket 存储到数据库，设置过期时间（5分钟）
    const expireTime = new Date(Date.now() + 5 * 60 * 1000);
    await db.collection('qrcode_tickets').add({
      data: {
        ticket: ticket,
        clubId: clubId,
        status: 'waiting', // waiting: 等待扫码, scanned: 已扫码, confirmed: 已确认, expired: 已过期
        createdAt: db.serverDate(),
        expireAt: expireTime,
        openid: null,
        unionid: null,
        userInfo: null
      }
    });
    
    console.log('[QRCode] 二维码生成成功，ticket:', ticket);
    
    res.json({
      success: true,
      data: {
        qrId: ticket,
        qrCodeUrl: `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${ticket}#wechat_redirect`,
        appId,
        redirectUri: `${callbackBase}/api/auth/callback`,
        state: ticket,
        scope,
        expireTime: expireTime.getTime()
      }
    });
    
  } catch (error) {
    console.error('[QRCode] 生成二维码失败:', error);
    res.status(500).json({
      success: false,
      message: '生成二维码失败: ' + error.message
    });
  }
});

// 8. 微信授权回调处理
app.get('/api/auth/callback', async (req, res) => {
  const { code, state, ticket } = req.query;
  
  console.log('[AuthCallback] 收到授权回调，code:', code, 'state:', state, 'ticket:', ticket);
  
  if (!code) {
    return res.send(buildErrorHtml('缺少授权码（code），请重新扫码'));
  }
  
  // 从 state 或直接参数中获取 ticket
  const qrTicket = ticket || state;
  if (!qrTicket) {
    return res.send(buildErrorHtml('缺少二维码票据（ticket），请重新扫码'));
  }
  
  try {
    const db = getDb();
    
    // 使用 code 换取 openid 和 unionid
    const appId = process.env.WX_WEB_APPID;
    const appSecret = process.env.WX_WEB_SECRET;
    
    if (!appId || !appSecret) {
      console.error('[AuthCallback] 未配置网站应用 AppID 或 Secret');
      return res.send(buildErrorHtml('服务器配置错误，请联系管理员'));
    }
    
    console.log('[AuthCallback] 使用网站应用 AppID:', appId.substring(0, 6) + '***');
    
    // 调用微信接口换取 openid 和 unionid
    let openid = null;
    let unionid = null;
    try {
      const tokenRes = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
        params: {
          appid: appId,
          secret: appSecret,
          code: code,
          grant_type: 'authorization_code'
        },
        timeout: 10000,
        httpsAgent: httpsAgentInsecure
      });
      
      if (tokenRes.data.errcode) {
        console.error('[AuthCallback] 微信接口返回错误:', tokenRes.data);
        return res.send(buildErrorHtml('微信授权失败: ' + (tokenRes.data.errmsg || '未知错误')));
      }
      
      openid = tokenRes.data.openid;
      unionid = tokenRes.data.unionid;
      console.log('[AuthCallback] 成功获取 openid:', openid, 'unionid:', unionid);
      
      if (!unionid) {
        console.warn('[AuthCallback] 未获取到 unionid');
      }
      
    } catch (error) {
      console.error('[AuthCallback] 调用微信接口失败:', error);
      return res.send(buildErrorHtml('调用微信接口失败: ' + error.message));
    }
    
    if (!openid) {
      return res.send(buildErrorHtml('未能获取到用户标识（openid），请重试'));
    }
    
    if (!unionid) {
      return res.send(buildErrorHtml('无法获取 UnionID，请联系管理员确认网站应用已绑定到微信开放平台'));
    }
    
    // 查询 ticket 记录
    const qrRes = await db.collection('qrcode_tickets').where({
      ticket: qrTicket
    }).limit(1).get();
    
    if (!qrRes.data || qrRes.data.length === 0) {
      return res.send(buildErrorHtml('二维码不存在或已过期，请重新扫码'));
    }
    
    const qrRecord = qrRes.data[0];
    
    // 检查是否过期
    const now = new Date();
    let expireAt = qrRecord.expireAt;
    if (typeof expireAt === 'object' && expireAt.$date) {
      expireAt = new Date(expireAt.$date);
    } else if (!(expireAt instanceof Date)) {
      expireAt = new Date(expireAt);
    }
    
    if (now > expireAt) {
      return res.send(buildErrorHtml('二维码已过期，请重新扫码'));
    }
    
    // 查询用户信息（使用 unionid）
    const userRes = await db.collection('users').where({
      unionid: unionid
    }).limit(1).get();
    
    if (!userRes.data || userRes.data.length === 0) {
      // 用户不存在，更新状态为已扫码但未注册
      await db.collection('qrcode_tickets').doc(qrRecord._id).update({
        data: {
          status: 'scanned',
          scannedAt: db.serverDate(),
          openid: openid,
          unionid: unionid
        }
      });
      
      return res.send(buildNeedRegisterHtml());
    }
    
    const userInfo = userRes.data[0];
    
    // 更新状态为已确认
    await db.collection('qrcode_tickets').doc(qrRecord._id).update({
      data: {
        status: 'confirmed',
        openid: openid,
        unionid: unionid,
        userId: userInfo._id,
        userName: userInfo.name || userInfo.nickName,
        userRole: userInfo.role,
        userClubId: userInfo.clubId,
        scannedAt: db.serverDate(),
        confirmedAt: db.serverDate()
      }
    });
    
    // 更新用户最后登录时间
    await db.collection('users').doc(userInfo._id).update({
      data: {
        lastLoginTime: db.serverDate()
      }
    }).catch(err => {
      console.warn('[AuthCallback] 更新登录时间失败:', err);
    });
    
    console.log('[AuthCallback] 登录确认成功，openid:', openid, 'unionid:', unionid);
    
    // 生成 JWT，并重定向到前端首页（由前端 /auth/callback 接收 token 后跳转 /home）
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      console.error('[AuthCallback] 生产环境未配置 JWT_SECRET');
      return res.send(buildErrorHtml('服务器未配置登录密钥（JWT_SECRET），请联系管理员'));
    }
    const token = generateToken({
      userId: userInfo._id,
      openid: openid,
      unionid: unionid,
      role: userInfo.role || 'user',
      clubId: userInfo.clubId
    }, jwtSecret, 7 * 24 * 60 * 60); // 7天有效期
    
    const frontendBase = process.env.FRONTEND_BASE_URL || process.env.WX_CALLBACK_BASE || 'https://www.kaichui.com.cn';
    const redirectUrl = `${frontendBase}/auth/callback?token=${encodeURIComponent(token)}`;
    console.log('[AuthCallback] 重定向到前端完成登录');
    // 用 HTML + window.top.location 跳转：无论微信在顶层还是 iframe 内打开回调，都让顶层窗口跳转到前端，避免“二维码框内缩小版网页”
    return res.send(buildRedirectHtml(redirectUrl));
    
  } catch (error) {
    console.error('[AuthCallback] 处理授权回调失败:', error);
    res.send(buildErrorHtml('处理授权回调失败: ' + error.message));
  }
});

// 9. 检查扫码登录状态（轮询，带限流防刷）
app.get('/api/auth/check-status/:qrId', checkStatusRateLimitMiddleware, async (req, res) => {
  const { qrId } = req.params;
  
  console.log('[CheckScan] 检查扫码状态，ticket:', qrId);
  
  if (!qrId) {
    return res.status(400).json({
      success: false,
      message: 'qrId 参数不能为空'
    });
  }
  
  try {
    const db = getDb();
    
    // 查询 ticket 记录
    const qrRes = await db.collection('qrcode_tickets').where({
      ticket: qrId
    }).limit(1).get();
    
    if (!qrRes.data || qrRes.data.length === 0) {
      return res.json({
        success: false,
        message: '二维码不存在或已过期',
        data: { status: 'expired' }
      });
    }
    
    const qrRecord = qrRes.data[0];
    
    // 检查是否过期
    const now = new Date();
    let expireAt = qrRecord.expireAt;
    if (typeof expireAt === 'object' && expireAt.$date) {
      expireAt = new Date(expireAt.$date);
    } else if (!(expireAt instanceof Date)) {
      expireAt = new Date(expireAt);
    }
    
    if (now > expireAt) {
      // 更新状态为已过期
      await db.collection('qrcode_tickets').doc(qrRecord._id).update({
        data: { status: 'expired' }
      });
      
      return res.json({
        success: false,
        message: '二维码已过期',
        data: { status: 'expired' }
      });
    }
    
    const status = qrRecord.status;
    
    if (status === 'waiting') {
      return res.json({
        success: true,
        message: '等待扫码',
        data: { status: 'waiting' }
      });
    }
    
    if (status === 'scanned') {
      return res.json({
        success: true,
        message: '已扫码，等待确认',
        data: { status: 'scanned' }
      });
    }
    
    if (status === 'confirmed') {
      const openid = qrRecord.openid;
      const unionid = qrRecord.unionid;
      
      console.log('[CheckScan] 确认状态，openid:', openid, 'unionid:', unionid);
      
      if (!unionid && !openid) {
        return res.status(500).json({
          success: false,
          message: '用户信息缺失'
        });
      }
      
      // 查询用户信息
      let userRes;
      if (unionid) {
        userRes = await db.collection('users').where({
          unionid: unionid
        }).limit(1).get();
        
        if (!userRes.data || userRes.data.length === 0) {
          console.log('[CheckScan] 通过 unionid 未找到用户，尝试使用 _openid');
          if (openid) {
            userRes = await db.collection('users').where({
              _openid: openid
            }).limit(1).get();
          }
        }
      } else if (openid) {
        userRes = await db.collection('users').where({
          _openid: openid
        }).limit(1).get();
      }
      
      if (!userRes || !userRes.data || userRes.data.length === 0) {
        return res.json({
          success: false,
          message: '用户不存在，请先注册',
          data: { status: 'need_register' }
        });
      }
      
      const userInfo = userRes.data[0];
      
      const jwtSecret = getJwtSecret();
      if (!jwtSecret) {
        console.error('[CheckScan] 生产环境未配置 JWT_SECRET，请在云托管环境变量中设置');
        return res.status(500).json({
          success: false,
          message: '服务器未配置登录密钥（JWT_SECRET），请联系管理员在云托管环境变量中配置'
        });
      }
      const token = generateToken({
        userId: userInfo._id,
        openid: openid,
        unionid: unionid,
        role: userInfo.role || 'user',
        clubId: userInfo.clubId
      }, jwtSecret, 7 * 24 * 60 * 60); // 7天有效期
      
      console.log('[CheckScan] 登录成功，生成 Token');
      
      return res.json({
        success: true,
        message: '登录成功',
        data: {
          status: 'confirmed',
          token: token,
          user: {
            userId: userInfo._id,
            nickname: userInfo.name || userInfo.nickName || '微信用户',
            openid: openid,
            role: userInfo.role || 'user',
            clubId: userInfo.clubId,
            tenantId: userInfo.clubId
          }
        }
      });
    }
    
    // 其他状态
    return res.json({
      success: true,
      message: '未知状态',
      data: { status: status }
    });
    
  } catch (error) {
    console.error('[CheckScan] 检查扫码状态失败:', error);
    res.status(500).json({
      success: false,
      message: '检查扫码状态失败: ' + error.message
    });
  }
});

// 10. 验证 Token
app.get('/api/auth/verify', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '缺少认证 Token'
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const jwtSecret = getJwtSecret();
    if (!jwtSecret) {
      console.error('[VerifyToken] 生产环境未配置 JWT_SECRET');
      return res.status(500).json({
        success: false,
        message: '服务器未配置登录密钥（JWT_SECRET），请联系管理员在云托管环境变量中配置'
      });
    }
    const { payload, expired } = verifyToken(token, jwtSecret);

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: expired ? 'Token 已过期，请重新登录' : 'Token 无效'
      });
    }

    console.log('[VerifyToken] Token 验证成功，userId:', payload.userId);

    // 查询用户最新信息（云开发 doc().get() 的 data 为数组）
    const db = getDb();
    const userRes = await db.collection('users').doc(payload.userId).get();

    if (!userRes.data || userRes.data.length === 0) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    const userInfo = userRes.data[0];
    
    res.json({
      success: true,
      data: {
        userId: userInfo._id,
        nickname: userInfo.name || userInfo.nickName || '微信用户',
        openid: userInfo._openid || payload.openid || null,
        role: userInfo.role || 'user',
        clubId: userInfo.clubId,
        tenantId: userInfo.clubId
      }
    });
    
  } catch (error) {
    console.error('[VerifyToken] 验证失败:', error);
    res.status(401).json({
      success: false,
      message: '验证失败: ' + error.message
    });
  }
});

// 11. 调试接口：查看当前环境下最新一条二维码记录（用于排查环境/库是否一致）
app.get('/api/debug/qrcode-latest', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.collection('qrcode_tickets')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    res.json({
      success: true,
      env: targetEnv,
      useHttpDb: USE_HTTP_DB,
      count: result.data.length,
      latest: result.data[0] || null
    });
  } catch (error) {
    console.error('[Debug] 获取最新二维码记录失败:', error);
    res.status(500).json({
      success: false,
      message: '获取最新二维码记录失败: ' + error.message
    });
  }
});

// ==================== HTML 页面构建函数 ====================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 登录成功后跳转到前端：用 window.top.location 保证无论回调在顶层还是 iframe 内打开，都让整页跳转 */
function buildRedirectHtml(redirectUrl) {
  const escaped = redirectUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录成功，正在跳转</title>
</head>
<body>
  <p style="font-family:sans-serif;text-align:center;margin-top:40px;">登录成功，正在跳转...</p>
  <script>window.top.location.href='${escaped}';<\/script>
</body>
</html>`;
}

function buildSuccessHtml(userInfo) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录成功</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .success-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 12px;
    }
    .message {
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 32px;
    }
    .user-info {
      background: #f9fafb;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 32px;
      text-align: left;
    }
    .user-info-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .user-info-item:last-child { border-bottom: none; }
    .user-info-label {
      color: #6b7280;
      font-size: 14px;
    }
    .user-info-value {
      color: #1f2937;
      font-weight: 600;
      font-size: 14px;
    }
    .countdown {
      display: inline-block;
      color: #667eea;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
    <h1 class="title">登录成功！</h1>
    <p class="message">您已成功完成身份验证</p>
    <div class="user-info">
      <div class="user-info-item">
        <span class="user-info-label">姓名</span>
        <span class="user-info-value">${escapeHtml(userInfo.userName || '未设置')}</span>
      </div>
      <div class="user-info-item">
        <span class="user-info-label">角色</span>
        <span class="user-info-value">${escapeHtml(userInfo.userRole || '未设置')}</span>
      </div>
      <div class="user-info-item">
        <span class="user-info-label">所属球会</span>
        <span class="user-info-value">${escapeHtml(userInfo.clubName || '未设置')}</span>
      </div>
    </div>
    <p style="font-size: 14px; color: #9ca3af;">
      页面将在 <span class="countdown" id="countdown">3</span> 秒后自动关闭
    </p>
  </div>
  <script>
    let seconds = 3;
    const countdownEl = document.getElementById('countdown');
    const timer = setInterval(() => {
      seconds--;
      countdownEl.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(timer);
        window.close();
      }
    }, 1000);
  </script>
</body>
</html>`;
}

function buildNeedRegisterHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>需要注册</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #ffa751 0%, #ffe259 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .warning-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: #f59e0b;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 12px;
    }
    .message {
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 32px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="warning-icon">⚠️</div>
    <h1 class="title">需要注册</h1>
    <p class="message">您的微信账号尚未注册，请先在小程序中完成注册</p>
    <p style="font-size: 14px; color: #9ca3af; margin-top: 20px;">
      页面将在 <span id="countdown" style="color: #f59e0b; font-weight: 600;">3</span> 秒后自动关闭
    </p>
  </div>
  <script>
    let seconds = 3;
    const countdownEl = document.getElementById('countdown');
    const timer = setInterval(() => {
      seconds--;
      countdownEl.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(timer);
        window.close();
      }
    }, 1000);
  </script>
</body>
</html>`;
}

function buildErrorHtml(errorMessage) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录失败</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .error-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: #ef4444;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 12px;
    }
    .message {
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 24px;
    }
    .error-detail {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 32px;
      text-align: left;
      color: #991b1b;
      font-size: 14px;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">❌</div>
    <h1 class="title">登录失败</h1>
    <p class="message">授权过程中发生错误，请重试</p>
    <div class="error-detail">
      <strong>错误详情：</strong><br>
      ${escapeHtml(errorMessage || '未知错误')}
    </div>
    <p style="font-size: 14px; color: #9ca3af;">
      页面将在 <span id="countdown" style="color: #ef4444; font-weight: 600;">5</span> 秒后自动关闭
    </p>
  </div>
  <script>
    let seconds = 5;
    const countdownEl = document.getElementById('countdown');
    const timer = setInterval(() => {
      seconds--;
      countdownEl.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(timer);
        window.close();
      }
    }, 1000);
  </script>
</body>
</html>`;
}

// 7. 托管前端静态文件 (Vite 编译出的 dist 目录)
// 注意：这个必须在 API 路由之后，否则会拦截 API 请求
app.use(express.static(path.join(__dirname, '../dist')));

// 8. 所有非 API 请求指向前端入口，支持 Vue-Router 的 history 模式
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// 9. 启动服务器
const PORT = process.env.PORT || 80;
app.listen(PORT, async () => {
  console.log(`=================================`);
  console.log(`服务器启动成功！`);
  console.log(`端口: ${PORT}`);
  console.log(`云开发环境: ${targetEnv || '未设置 TCB_ENV_ID'}`);
  console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`=================================`);
  
  // 预热数据库连接（超时可通过环境变量 WARMUP_TIMEOUT_MS 配置，默认 5s；USE_HTTP_DB 时用 HTTP 预热）
  const warmupTimeoutMs = parseInt(process.env.WARMUP_TIMEOUT_MS, 10) || 5000;
  try {
    console.log('[预热] 开始预热数据库连接（' + warmupTimeoutMs + 'ms 超时）...');
    const db = getDb();
    const testResult = await Promise.race([
      db.collection('qrcode_tickets').limit(1).get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('预热超时(' + warmupTimeoutMs + 'ms)')), warmupTimeoutMs))
    ]);
    console.log('[预热] 数据库连接预热成功！查询到', testResult.data.length, '条记录');
  } catch (error) {
    console.error('[预热] 数据库连接预热失败:', error.message);
    if (error.message.includes('ETIMEDOUT') || error.message.includes('169.254') || error.message.includes('预热超时')) {
      console.error('[预热] 提示：云托管内 SDK 直连常超时，建议在环境变量中设置 USE_HTTP_DB=true；或设置 WARMUP_TIMEOUT_MS 延长预热超时（仅治标）');
    }
  }
});

// 10. 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  process.exit(0);
});
