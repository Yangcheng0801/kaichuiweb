/**
 * 球员端个人中心路由
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  const NAME_RE = /^[\u4e00-\u9fa5a-zA-Z\s·]{1,30}$/;

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 获取个人资料 + 球场档案
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const playerRes = await db.collection('players').doc(req.playerId).get();
      const player = Array.isArray(playerRes.data) ? playerRes.data[0] : playerRes.data;
      if (!player) return res.status(404).json({ success: false, message: '球员不存在' });

      const cpRes = await db.collection('player_club_profiles').where({
        playerId: req.playerId, clubId: req.clubId
      }).limit(1).get();
      const clubProfile = cpRes.data && cpRes.data.length > 0 ? cpRes.data[0] : null;

      res.json({ success: true, data: { player, clubProfile } });
    } catch (err) {
      console.error('[MiniappProfile] get:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 更新个人资料 — 增加输入校验
  router.put('/', async (req, res) => {
    const { name, gender, avatarUrl } = req.body;
    try {
      const db = getDb();
      const update = { updatedAt: new Date() };

      if (name !== undefined) {
        const trimmed = (name || '').trim();
        if (!trimmed || !NAME_RE.test(trimmed)) {
          return res.status(400).json({ success: false, message: '姓名格式不正确（1-30字，支持中英文）' });
        }
        update.name = trimmed;
      }

      if (gender !== undefined) {
        const g = Number(gender);
        if (![1, 2].includes(g)) {
          return res.status(400).json({ success: false, message: '性别参数错误' });
        }
        update.gender = g;
      }

      if (avatarUrl !== undefined) {
        if (typeof avatarUrl !== 'string' || avatarUrl.length > 500) {
          return res.status(400).json({ success: false, message: '头像地址无效' });
        }
        update.avatarUrl = avatarUrl;
      }

      if (Object.keys(update).length <= 1) {
        return res.status(400).json({ success: false, message: '未提供需要更新的字段' });
      }

      await db.collection('players').doc(req.playerId).update({ data: update });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      console.error('[MiniappProfile] update:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 获取球场档案
  router.get('/club', async (req, res) => {
    try {
      const db = getDb();
      const cpRes = await db.collection('player_club_profiles').where({
        playerId: req.playerId, clubId: req.clubId
      }).limit(1).get();
      res.json({ success: true, data: cpRes.data && cpRes.data.length > 0 ? cpRes.data[0] : null });
    } catch (err) {
      console.error('[MiniappProfile] club:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 个人统计
  router.get('/stats', async (req, res) => {
    try {
      const db = getDb();
      const now = new Date();
      const thisYear = now.getFullYear();
      const thisMonth = `${thisYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const allBookings = await db.collection('bookings').where({
        playerId: req.playerId, status: 'completed'
      }).get();

      const bookings = allBookings.data || [];
      const thisYearBookings = bookings.filter(b => b.date && b.date.startsWith(String(thisYear)));
      const thisMonthBookings = bookings.filter(b => b.date && b.date.startsWith(thisMonth));
      const totalSpent = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

      res.json({
        success: true,
        data: {
          totalRounds: bookings.length,
          thisYear: thisYearBookings.length,
          thisMonth: thisMonthBookings.length,
          totalSpent: Math.round(totalSpent)
        }
      });
    } catch (err) {
      console.error('[MiniappProfile] stats:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 充值/消费流水
  router.get('/transactions', async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));

    try {
      const db = getDb();
      const result = await db.collection('transactions').where({
        playerId: req.playerId
      }).orderBy('createdAt', 'desc')
        .skip((pageNum - 1) * limitNum).limit(limitNum).get();

      res.json({ success: true, data: result.data || [] });
    } catch (err) {
      console.error('[MiniappProfile] transactions:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
