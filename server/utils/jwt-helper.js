// JWT Token 工具函数（基于 jsonwebtoken，HS256 算法）
// jsonwebtoken 是 Node.js 生态事实标准，周下载量 1.5 亿，内置时序安全签名比较。

const jwt = require('jsonwebtoken');

/**
 * 生成 JWT Token
 * @param {Object} payload   - Token 载荷数据
 * @param {string} secret    - 密钥（从环境变量获取）
 * @param {number} expiresIn - 过期时间（秒），默认 7 天
 * @returns {string} JWT Token
 */
function generateToken(payload, secret, expiresIn = 7 * 24 * 60 * 60) {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn
  });
}

/**
 * 验证 JWT Token
 * @param {string} token  - JWT Token
 * @param {string} secret - 密钥
 * @returns {{ payload: Object|null, expired: boolean }} 解码后的 payload；验证失败返回 null，过期时 expired 为 true
 */
function verifyToken(token, secret) {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return { payload, expired: false };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.error('[JWT] Token 已过期');
      return { payload: null, expired: true };
    }
    console.error('[JWT] Token 验证失败:', err.message);
    return { payload: null, expired: false };
  }
}

module.exports = { generateToken, verifyToken };
