/**
 * 球员端赛事路由
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 赛事列表
  router.get('/', async (req, res) => {
    const { status } = req.query;
    try {
      const db = getDb();
      const _ = db.command;
      const where = { clubId: req.clubId };

      if (status && status !== 'all' && _) {
        const mapped = status === 'open' ? ['registration', 'open'] : [status];
        where.status = _.in(mapped);
      }

      const result = await db.collection('tournaments').where(where)
        .orderBy('startDate', 'desc').limit(50).get();

      res.json({ success: true, data: result.data || [] });
    } catch (err) {
      console.error('[MiniappTournaments] list:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 我的报名（必须在 /:id 之前）
  router.get('/my-registrations', async (req, res) => {
    try {
      const db = getDb();
      const regs = await db.collection('tournament_registrations').where({
        playerId: req.playerId
      }).get();

      const tournamentIds = (regs.data || []).map(r => r.tournamentId);
      if (tournamentIds.length === 0) return res.json({ success: true, data: [] });

      const tournaments = [];
      for (const tid of tournamentIds) {
        try {
          const tRes = await db.collection('tournaments').doc(tid).get();
          const t = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;
          if (t) tournaments.push(t);
        } catch (e) { /* ignore deleted tournaments */ }
      }

      res.json({ success: true, data: tournaments });
    } catch (err) {
      console.error('[MiniappTournaments] my-registrations:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 赛事详情
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('tournaments').doc(req.params.id).get();
      const tournament = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!tournament) return res.status(404).json({ success: false, message: '赛事不存在' });

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
      console.error('[MiniappTournaments] detail:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 报名 — 增加赛事状态校验 + 名额校验
  router.post('/:id/register', async (req, res) => {
    try {
      const db = getDb();

      // 查询赛事信息，校验报名状态
      const tResult = await db.collection('tournaments').doc(req.params.id).get();
      const tournament = Array.isArray(tResult.data) ? tResult.data[0] : tResult.data;
      if (!tournament) {
        return res.status(404).json({ success: false, message: '赛事不存在' });
      }

      const allowedStatuses = ['registration', 'open'];
      if (!allowedStatuses.includes(tournament.status)) {
        return res.status(400).json({ success: false, message: '该赛事当前不接受报名' });
      }

      // 检查报名截止时间
      if (tournament.registrationDeadline && new Date() > new Date(tournament.registrationDeadline)) {
        return res.status(400).json({ success: false, message: '报名已截止' });
      }

      // 检查名额
      if (tournament.maxPlayers) {
        const regCount = await db.collection('tournament_registrations').where({
          tournamentId: req.params.id
        }).count();
        if ((regCount.total || 0) >= tournament.maxPlayers) {
          return res.status(400).json({ success: false, message: '报名名额已满' });
        }
      }

      // 检查是否已报名
      const existing = await db.collection('tournament_registrations').where({
        tournamentId: req.params.id, playerId: req.playerId
      }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        return res.status(400).json({ success: false, message: '已报名，请勿重复提交' });
      }

      await db.collection('tournament_registrations').add({
        data: {
          tournamentId: req.params.id,
          playerId: req.playerId,
          clubId: req.clubId,
          remark: (req.body.remark || '').substring(0, 200),
          status: 'registered',
          createdAt: new Date()
        }
      });

      res.json({ success: true, message: '报名成功' });
    } catch (err) {
      console.error('[MiniappTournaments] register:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
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
      console.error('[MiniappTournaments] leaderboard:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
