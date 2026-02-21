/**
 * 球员端会籍信息路由
 * 查询我的会籍
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 我的会籍信息
  router.get('/mine', async (req, res) => {
    try {
      const db = getDb();

      // 查询球员会籍订阅（可能有多条：有效 / 已过期）
      const subRes = await db.collection('memberships').where({
        playerId: req.playerId,
        clubId: req.clubId
      }).orderBy('startDate', 'desc').limit(10).get();

      const memberships = subRes.data || [];

      // 找到当前有效会籍
      const now = new Date().toISOString().slice(0, 10);
      const active = memberships.find(m =>
        m.status === 'active' && m.startDate <= now && (!m.endDate || m.endDate >= now)
      ) || null;

      // 若有有效会籍，附带套餐详情
      let plan = null;
      if (active && active.planId) {
        try {
          const planRes = await db.collection('membership_plans').doc(active.planId).get();
          plan = Array.isArray(planRes.data) ? planRes.data[0] : planRes.data;
        } catch (_) { /* plan may have been deleted */ }
      }

      // 查询球场档案中的身份类型
      const cpRes = await db.collection('player_club_profiles').where({
        playerId: req.playerId,
        clubId: req.clubId
      }).limit(1).get();
      const clubProfile = cpRes.data && cpRes.data.length > 0 ? cpRes.data[0] : null;

      res.json({
        success: true,
        data: {
          active,
          plan,
          identityType: clubProfile ? clubProfile.identityType : null,
          identityName: clubProfile ? clubProfile.identityName : null,
          history: memberships
        }
      });
    } catch (err) {
      console.error('[MiniappMemberships] mine:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
