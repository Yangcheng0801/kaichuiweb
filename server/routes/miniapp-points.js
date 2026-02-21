/**
 * 球员端积分系统路由
 * 我的积分 / 积分流水
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 我的积分概览
  router.get('/mine', async (req, res) => {
    try {
      const db = getDb();

      // 从球场档案中读取积分
      const cpRes = await db.collection('player_club_profiles').where({
        playerId: req.playerId,
        clubId: req.clubId
      }).limit(1).get();

      const profile = cpRes.data && cpRes.data.length > 0 ? cpRes.data[0] : null;
      const balance = profile ? (profile.points || 0) : 0;

      // 本月获得 / 本月消耗
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const monthRecords = await db.collection('point_records').where({
        playerId: req.playerId,
        clubId: req.clubId,
        date: db.command.gte(monthStart)
      }).get();

      const records = monthRecords.data || [];
      let earned = 0;
      let spent = 0;
      for (const r of records) {
        if (r.amount > 0) earned += r.amount;
        else spent += Math.abs(r.amount);
      }

      res.json({
        success: true,
        data: {
          balance,
          monthEarned: earned,
          monthSpent: spent
        }
      });
    } catch (err) {
      console.error('[MiniappPoints] mine:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 积分流水（分页）
  router.get('/history', async (req, res) => {
    const { page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 30));

    try {
      const db = getDb();
      const result = await db.collection('point_records').where({
        playerId: req.playerId,
        clubId: req.clubId
      }).orderBy('createdAt', 'desc')
        .skip((pageNum - 1) * limitNum).limit(limitNum).get();

      res.json({
        success: true,
        data: {
          list: result.data || [],
          page: pageNum,
          limit: limitNum
        }
      });
    } catch (err) {
      console.error('[MiniappPoints] history:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
