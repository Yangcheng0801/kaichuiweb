// JWT Token 工具函数
// 用于生成和验证登录 Token

const crypto = require('crypto');

/**
 * 生成 JWT Token
 * @param {Object} payload - Token 载荷数据
 * @param {string} secret - 密钥（建议从环境变量获取）
 * @param {number} expiresIn - 过期时间（秒），默认7天
 * @returns {string} JWT Token
 */
function generateToken(payload, secret, expiresIn = 7 * 24 * 60 * 60) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now, // 签发时间
    exp: now + expiresIn // 过期时间
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * 验证 JWT Token
 * @param {string} token - JWT Token
 * @param {string} secret - 密钥
 * @returns {Object|null} 解码后的 payload，验证失败返回 null
 */
function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const [encodedHeader, encodedPayload, signature] = parts;
    
    // 验证签名
    const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);
    if (signature !== expectedSignature) {
      console.error('[JWT] 签名验证失败');
      return null;
    }
    
    // 解码 payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    
    // 验证过期时间
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error('[JWT] Token 已过期');
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('[JWT] Token 验证失败:', error);
    return null;
  }
}

/**
 * Base64 URL 编码
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL 解码
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString();
}

/**
 * HMAC-SHA256 签名
 */
function sign(message, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

module.exports = {
  generateToken,
  verifyToken
};
