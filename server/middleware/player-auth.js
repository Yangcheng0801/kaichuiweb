/**
 * 球员端小程序鉴权中间件
 * 区别于 auth-cart.js（面向管理端员工），本中间件面向球员端用户
 * JWT payload 结构：{ playerId, unionid, phone, clubId }
 */

const { verifyToken } = require('../utils/jwt-helper');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') return s || null;
  return s || 'kaichui-golf-secret-2026';
}

function requirePlayerAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '缺少认证 Token' });
  }

  const token = authHeader.substring(7);
  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    return res.status(500).json({ success: false, message: '服务器未配置 JWT_SECRET' });
  }

  const { payload, expired } = verifyToken(token, jwtSecret);

  if (!payload) {
    return res.status(401).json({
      success: false,
      message: expired ? 'Token 已过期，请重新登录' : 'Token 无效'
    });
  }

  req.playerId = payload.playerId;
  req.unionid = payload.unionid;
  req.phone = payload.phone;
  req.clubId = payload.clubId || process.env.DEFAULT_CLUB_ID || '80a8bd4f680c3bb901e1269130e92a37';

  next();
}

module.exports = { requirePlayerAuth };
