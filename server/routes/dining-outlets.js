/**
 * 餐饮消费点管理
 * 集合：dining_outlets
 */
function createDiningOutletsRouter(getDb) {
  const express = require('express');
  const router = express.Router();
  const COLLECTION = 'dining_outlets';

  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', status } = req.query;
      const where = { clubId };
      if (status) where.status = status;
      const r = await db.collection(COLLECTION).where(where).orderBy('createdAt', 'asc').limit(50).get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', outletName, outletCode, outletType = 'restaurant',
        location, hasTables = true, hasKitchen = true, operatingHours,
      } = req.body;
      if (!outletName) return res.status(400).json({ success: false, error: '消费点名称必填' });
      const now = new Date();
      const doc = {
        clubId, outletName, outletCode: outletCode || '',
        outletType, location: location || '', hasTables, hasKitchen,
        operatingHours: operatingHours || { open: '07:00', close: '22:00' },
        status: 'active', createdAt: now, updatedAt: now,
      };
      const r = await db.collection(COLLECTION).add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...body } = req.body;
      await db.collection(COLLECTION).doc(req.params.id).update({ ...body, updatedAt: new Date() });
      res.json({ success: true, message: '消费点更新成功' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection(COLLECTION).doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  return router;
}
module.exports = createDiningOutletsRouter;
