/**
 * 球员端赛事路由
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  // 赛事列表
  router.get('/', async (req, res) => {
    const { status } = req.query;
    try {
      const db = getDb();
      let query = db.collection('tournaments').where({ clubId: req.clubId });
      const result = await query.orderBy('startDate', 'desc').limit(50).get();

      let list = result.data || [];
      if (status && status !== 'all') {
        const mapped = status === 'open' ? ['registration', 'open'] : [status];
        list = list.filter(t => mapped.includes(t.status));
      }

      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 赛事详情
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('tournaments').doc(req.params.id).get();
      const tournament = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!tournament) return res.status(404).json({ success: false, message: '赛事不存在' });

      // 检查是否已报名
      const regRes = await db.collection('tournament_registrations').where({
        tournamentId: req.params.id, playerId: req.playerId
      }).limit(1).get();

      const regCount = await db.collection('tournament_registrations').where({
        tournamentId: req.params.id
      }).count();

      res.json({
        success: true,
        data: {
          ...tournament,
          isRegistered: regRes.data && regRes.data.length > 0,
          registeredCount: regCount.total || 0
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 报名
  router.post('/:id/register', async (req, res) => {
    try {
      const db = getDb();
      // 检查是否已报名
      const existing = await db.collection('tournament_registrations').where({
        tournamentId: req.params.id, playerId: req.playerId
      }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        return res.status(400).json({ success: false, message: '已报名' });
      }

      await db.collection('tournament_registrations').add({
        data: {
          tournamentId: req.params.id,
          playerId: req.playerId,
          clubId: req.clubId,
          remark: req.body.remark || '',
          status: 'registered',
          createdAt: new Date()
        }
      });

      res.json({ success: true, message: '报名成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 我的报名
  router.get('/my-registrations', async (req, res) => {
    try {
      const db = getDb();
      const regs = await db.collection('tournament_registrations').where({
        playerId: req.playerId
      }).get();

      const tournamentIds = (regs.data || []).map(r => r.tournamentId);
      if (tournamentIds.length === 0) return res.json({ success: true, data: [] });

      // 逐个查询赛事信息
      const tournaments = [];
      for (const tid of tournamentIds) {
        try {
          const tRes = await db.collection('tournaments').doc(tid).get();
          const t = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;
          if (t) tournaments.push(t);
        } catch (e) { /* ignore */ }
      }

      res.json({ success: true, data: tournaments });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 排行榜
  router.get('/:id/leaderboard', async (req, res) => {
    try {
      const db = getDb();
      const scores = await db.collection('tournament_scores').where({
        tournamentId: req.params.id
      }).orderBy('totalScore', 'asc').limit(100).get();

      res.json({ success: true, data: scores.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
