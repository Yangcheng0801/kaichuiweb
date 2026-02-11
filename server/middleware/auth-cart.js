/**
 * 球车管理等需 clubId 隔离的路由鉴权中间件
 *
 * 统一使用 users.clubId → JWT clubId 链路：
 * - 扫码登录时从 users 表读取 clubId 写入 JWT payload
 * - 本中间件从 JWT 解析 clubId，注入 req.clubId 供后续路由使用
 */

const { verifyToken } = require('../utils/jwt-helper');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') return s || null;
  return s || 'kaichui-golf-secret-2026';
}

/**
 * 验证 JWT，将 userId、clubId 注入 req，供球车/维修/使用记录等接口使用
 * 若 token 无效或缺失，返回 401
 */
function requireAuthWithClubId(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '缺少认证 Token'
    });
  }

  const token = authHeader.substring(7);
  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    return res.status(500).json({
      success: false,
      message: '服务器未配置 JWT_SECRET'
    });
  }

  const { payload, expired } = verifyToken(token, jwtSecret);

  if (!payload) {
    return res.status(401).json({
      success: false,
      message: expired ? 'Token 已过期，请重新登录' : 'Token 无效'
    });
  }

  // 统一使用 users.clubId → JWT clubId（登录时已写入 payload）
  // 单球会场景：JWT 无 clubId 时回退默认值，后期多球会改为必填
  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';
  req.userId = payload.userId;
  req.clubId = payload.clubId || DEFAULT_CLUB_ID;

  if (!req.clubId) {
    return res.status(403).json({
      success: false,
      message: '用户未绑定球会，无法访问'
    });
  }

  next();
}

module.exports = { requireAuthWithClubId };
