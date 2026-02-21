/**
 * 球员端消费账单路由
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  // 我的账单列表
  router.get('/mine', async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    try {
      const db = getDb();
      let query = db.collection('folios').where({ playerId: req.playerId, clubId: req.clubId });
      const result = await query.orderBy('createdAt', 'desc')
        .skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).get();

      let folios = result.data || [];
      if (status) folios = folios.filter(f => f.status === status);

      res.json({ success: true, data: folios });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
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
      res.status(500).json({ success: false, message: err.message });
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
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
