/**
 * 球员端小程序认证路由
 * POST /api/miniapp/auth/login    - 小程序登录（code 换 token）
 * POST /api/miniapp/auth/register - 球员注册
 * POST /api/miniapp/auth/phone    - 获取手机号
 * GET  /api/miniapp/auth/verify   - 验证 token
 */

const axios = require('axios');
const { generateToken, verifyToken } = require('../utils/jwt-helper');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') return s || null;
  return s || 'kaichui-golf-secret-2026';
}

const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

module.exports = function (getDb) {
  const router = require('express').Router();

  // 小程序登录：code → openid/unionid → 查找球员 → 签发 JWT
  router.post('/login', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: '缺少 code' });

    try {
      const appId = process.env.WX_MINIAPP_APPID || process.env.WX_APPID;
      const appSecret = process.env.WX_MINIAPP_SECRET || process.env.WX_APP_SECRET;

      if (!appId || !appSecret) {
        return res.status(500).json({ success: false, message: '未配置小程序 AppID/Secret' });
      }

      // code2Session
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: { appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' },
        timeout: 10000
      });

      if (wxRes.data.errcode) {
        return res.status(400).json({ success: false, message: wxRes.data.errmsg || '微信登录失败' });
      }

      const { openid, unionid, session_key } = wxRes.data;
      const db = getDb();

      // 通过 unionid 查找球员
      let playerRes;
      if (unionid) {
        playerRes = await db.collection('players').where({ unionid }).limit(1).get();
      }
      if ((!playerRes || !playerRes.data || playerRes.data.length === 0) && openid) {
        playerRes = await db.collection('players').where({ miniapp_openid: openid }).limit(1).get();
      }

      if (!playerRes || !playerRes.data || playerRes.data.length === 0) {
        // 新用户，返回 isNew
        return res.json({
          success: true,
          data: { isNew: true, openid, unionid }
        });
      }

      const player = playerRes.data[0];

      // 更新 miniapp_openid
      if (openid && player.miniapp_openid !== openid) {
        await db.collection('players').doc(player._id).update({
          data: { miniapp_openid: openid, lastLoginAt: new Date() }
        }).catch(() => {});
      }

      // 查询球场档案
      let clubProfile = null;
      const cpRes = await db.collection('player_club_profiles').where({
        playerId: player._id, clubId: DEFAULT_CLUB_ID
      }).limit(1).get();
      if (cpRes.data && cpRes.data.length > 0) clubProfile = cpRes.data[0];

      const jwtSecret = getJwtSecret();
      if (!jwtSecret) return res.status(500).json({ success: false, message: '未配置 JWT_SECRET' });

      const token = generateToken({
        playerId: player._id,
        unionid: unionid || player.unionid,
        phone: player.phone,
        clubId: DEFAULT_CLUB_ID
      }, jwtSecret, 30 * 24 * 60 * 60); // 30 天

      res.json({
        success: true,
        data: {
          isNew: false,
          token,
          playerId: player._id,
          clubId: DEFAULT_CLUB_ID,
          userInfo: {
            name: player.name,
            phone: player.phone,
            playerNo: player.playerNo,
            avatarUrl: player.avatarUrl,
            gender: player.gender
          }
        }
      });
    } catch (err) {
      console.error('[MiniappAuth] login error:', err);
      res.status(500).json({ success: false, message: '登录失败: ' + err.message });
    }
  });

  // 球员注册
  router.post('/register', async (req, res) => {
    const { name, gender, phone, openid, unionid, clubId } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, message: '姓名和手机号必填' });

    try {
      const db = getDb();
      const targetClub = clubId || DEFAULT_CLUB_ID;

      // 检查手机号是否已注册
      const existRes = await db.collection('players').where({ phone }).limit(1).get();
      if (existRes.data && existRes.data.length > 0) {
        return res.status(400).json({ success: false, message: '该手机号已注册' });
      }

      // 生成六位球员编号
      const countRes = await db.collection('players').count();
      const playerNo = String((countRes.total || 0) + 1).padStart(6, '0');

      // 创建平台级球员记录
      const playerData = {
        name, gender: gender || 1, phone, playerNo,
        unionid: unionid || null,
        miniapp_openid: openid || null,
        avatarUrl: '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const addRes = await db.collection('players').add({ data: playerData });
      const playerId = addRes._id;

      // 创建球场级档案
      await db.collection('player_club_profiles').add({
        data: {
          playerId, clubId: targetClub,
          balance: 0, points: 0,
          memberLevel: '普通球员',
          identityType: 'guest',
          consumeCardNo: `KC${playerNo}`,
          qrCode: '',
          createdAt: new Date()
        }
      });

      const jwtSecret = getJwtSecret();
      const token = generateToken({ playerId, unionid, phone, clubId: targetClub }, jwtSecret, 30 * 24 * 60 * 60);

      res.json({
        success: true,
        data: {
          token, playerId, clubId: targetClub,
          userInfo: { name, phone, playerNo, gender, avatarUrl: '' }
        }
      });
    } catch (err) {
      console.error('[MiniappAuth] register error:', err);
      res.status(500).json({ success: false, message: '注册失败: ' + err.message });
    }
  });

  // 获取手机号
  router.post('/phone', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: '缺少 code' });

    try {
      const appId = process.env.WX_MINIAPP_APPID || process.env.WX_APPID;
      const appSecret = process.env.WX_MINIAPP_SECRET || process.env.WX_APP_SECRET;

      // 获取 access_token
      const tokenRes = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
        params: { grant_type: 'client_credential', appid: appId, secret: appSecret },
        timeout: 10000
      });

      const accessToken = tokenRes.data.access_token;
      if (!accessToken) return res.status(500).json({ success: false, message: '获取 access_token 失败' });

      // 获取手机号
      const phoneRes = await axios.post(
        `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
        { code },
        { timeout: 10000 }
      );

      if (phoneRes.data.errcode !== 0) {
        return res.status(400).json({ success: false, message: phoneRes.data.errmsg || '获取手机号失败' });
      }

      res.json({
        success: true,
        data: {
          phoneNumber: phoneRes.data.phone_info.phoneNumber,
          purePhoneNumber: phoneRes.data.phone_info.purePhoneNumber,
          countryCode: phoneRes.data.phone_info.countryCode
        }
      });
    } catch (err) {
      console.error('[MiniappAuth] phone error:', err);
      res.status(500).json({ success: false, message: '获取手机号失败: ' + err.message });
    }
  });

  // 验证 token
  router.get('/verify', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: '缺少 Token' });
    }

    const jwtSecret = getJwtSecret();
    const { payload, expired } = verifyToken(authHeader.substring(7), jwtSecret);

    if (!payload) {
      return res.status(401).json({ success: false, message: expired ? 'Token 已过期' : 'Token 无效' });
    }

    res.json({ success: true, data: { playerId: payload.playerId, clubId: payload.clubId } });
  });

  return router;
};
