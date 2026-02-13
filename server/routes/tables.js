/**
 * 餐台管理
 * 集合：tables
 */
function createTablesRouter(getDb) {
  const express = require('express');
  const router = express.Router();
  const COLLECTION = 'tables';

  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', outletId, status } = req.query;
      const where = { clubId };
      if (outletId) where.outletId = outletId;
      if (status) where.status = status;
      const r = await db.collection(COLLECTION).where(where).orderBy('tableNo', 'asc').limit(200).get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', outletId, tableNo, tableName, area, capacity = 4,
      } = req.body;
      if (!tableNo || !outletId) return res.status(400).json({ success: false, error: '餐台号和消费点必填' });
      const now = new Date();
      const doc = {
        clubId, outletId, tableNo, tableName: tableName || tableNo,
        area: area || '', capacity: Number(capacity),
        status: 'available', currentOrderId: null,
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection(COLLECTION).add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  // 批量创建
  router.post('/batch', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', outletId, tables = [] } = req.body;
      if (!outletId || tables.length === 0) return res.status(400).json({ success: false, error: '参数不完整' });
      const now = new Date();
      const ids = [];
      for (const t of tables) {
        const doc = {
          clubId, outletId, tableNo: t.tableNo, tableName: t.tableName || t.tableNo,
          area: t.area || '', capacity: Number(t.capacity || 4),
          status: 'available', currentOrderId: null, createdAt: now, updatedAt: now,
        };
        const r = await db.collection(COLLECTION).add(doc);
        ids.push(r.id || r._id);
      }
      res.json({ success: true, data: { count: ids.length } });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...body } = req.body;
      await db.collection(COLLECTION).doc(req.params.id).update({ ...body, updatedAt: new Date() });
      res.json({ success: true, message: '餐台更新成功' });
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
module.exports = createTablesRouter;
