/**
 * 球员端消费账单路由
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 我的账单列表 — status 过滤移到数据库层
  router.get('/mine', async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));

    try {
      const db = getDb();
      const _ = db.command;
      const where = { playerId: req.playerId, clubId: req.clubId };

      if (status && _) {
        const validStatuses = ['open', 'settled', 'void'];
        if (validStatuses.includes(status)) {
          where.status = status;
        }
      }

      const result = await db.collection('folios').where(where)
        .orderBy('createdAt', 'desc')
        .skip((pageNum - 1) * limitNum).limit(limitNum).get();

      res.json({ success: true, data: result.data || [] });
    } catch (err) {
      console.error('[MiniappFolios] mine:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 账单详情（含消费明细）
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const folioRes = await db.collection('folios').doc(req.params.id).get();
      const folio = Array.isArray(folioRes.data) ? folioRes.data[0] : folioRes.data;
      if (!folio || folio.playerId !== req.playerId) {
        return res.status(404).json({ success: false, message: '账单不存在' });
      }

      const chargesRes = await db.collection('folio_charges').where({
        folioId: req.params.id
      }).orderBy('createdAt', 'asc').get();

      res.json({
        success: true,
        data: { folio, charges: chargesRes.data || [] }
      });
    } catch (err) {
      console.error('[MiniappFolios] detail:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 实时账单（场中消费透明化）
  router.get('/:id/live', async (req, res) => {
    try {
      const db = getDb();
      const folioRes = await db.collection('folios').doc(req.params.id).get();
      const folio = Array.isArray(folioRes.data) ? folioRes.data[0] : folioRes.data;
      if (!folio || folio.playerId !== req.playerId) {
        return res.status(404).json({ success: false, message: '账单不存在' });
      }

      const chargesRes = await db.collection('folio_charges').where({
        folioId: req.params.id
      }).orderBy('createdAt', 'desc').get();

      res.json({
        success: true,
        data: { folio, charges: chargesRes.data || [] }
      });
    } catch (err) {
      console.error('[MiniappFolios] live:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
