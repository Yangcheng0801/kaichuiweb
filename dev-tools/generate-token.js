#!/usr/bin/env node
/**
 * 开发工具：生成测试 JWT Token
 * 用于本地开发时绕过微信登录
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { generateToken } = require('../server/utils/jwt-helper');

// 测试用户数据
const testUser = {
  userId: 'dev-user-001',
  unionid: 'test-unionid-12345',
  openid: 'test-openid-67890',
  nickname: '开发测试用户',
  role: 'admin', // admin | manager | staff | member
  clubId: 'test-club-001'
};

// 获取 JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'kaichui-golf-secret-2026';

// 生成 Token（7天有效期）
const token = generateToken(testUser, JWT_SECRET, 7 * 24 * 60 * 60);

console.log('\n========================================');
console.log('🔑 开发测试 JWT Token 已生成');
console.log('========================================\n');
console.log('Token:');
console.log(token);
console.log('\n用户信息:');
console.log(JSON.stringify(testUser, null, 2));
console.log('\n========================================');
console.log('📋 使用方法：');
console.log('========================================\n');
console.log('1. 打开浏览器开发者工具（F12）');
console.log('2. 进入 Console 标签');
console.log('3. 粘贴以下代码并回车：\n');
console.log(`localStorage.setItem('token', '${token}');`);
console.log(`document.cookie = 'token=${token}; path=/; max-age=604800';`);
console.log(`location.reload();`);
console.log('\n4. 页面刷新后即可登录\n');
console.log('========================================\n');
