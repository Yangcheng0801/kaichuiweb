/**
 * 球员端个人中心路由
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

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
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 更新个人资料
  router.put('/', async (req, res) => {
    const { name, gender, avatarUrl } = req.body;
    try {
      const db = getDb();
      const update = { updatedAt: new Date() };
      if (name) update.name = name;
      if (gender) update.gender = gender;
      if (avatarUrl) update.avatarUrl = avatarUrl;

      await db.collection('players').doc(req.playerId).update({ data: update });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
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
      res.status(500).json({ success: false, message: err.message });
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
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 充值/消费流水
  router.get('/transactions', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('transactions').where({
        playerId: req.playerId
      }).orderBy('createdAt', 'desc').limit(50).get();
      res.json({ success: true, data: result.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
