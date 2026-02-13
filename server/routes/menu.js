/**
 * 菜单管理
 * 集合：menu_categories / menu_items
 */
function createMenuRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  /* ========== 分类 ========== */

  router.get('/categories', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', outletId } = req.query;
      const where = { clubId };
      if (outletId) where.outletId = outletId;
      const r = await db.collection('menu_categories').where(where).orderBy('sortOrder', 'asc').limit(100).get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/categories', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', outletId, categoryName, sortOrder = 0 } = req.body;
      if (!categoryName) return res.status(400).json({ success: false, error: '分类名称必填' });
      const doc = { clubId, outletId: outletId || null, categoryName, sortOrder: Number(sortOrder), status: 'active', createdAt: new Date() };
      const r = await db.collection('menu_categories').add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.put('/categories/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...body } = req.body;
      await db.collection('menu_categories').doc(req.params.id).update(body);
      res.json({ success: true, message: '分类更新成功' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.delete('/categories/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('menu_categories').doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  /* ========== 菜品 ========== */

  router.get('/items', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', outletId, categoryId, status } = req.query;
      const where = { clubId };
      if (outletId) where.outletId = outletId;
      if (categoryId) where.categoryId = categoryId;
      if (status) where.status = status;
      const r = await db.collection('menu_items').where(where).orderBy('sortOrder', 'asc').limit(500).get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.post('/items', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', categoryId, outletId,
        itemName, itemCode, price = 0, memberPrice, unit = '份',
        description, tags, isTimePrice, modifiers,
        dailyStock, sortOrder = 0,
      } = req.body;
      if (!itemName) return res.status(400).json({ success: false, error: '菜品名称必填' });
      const now = new Date();
      const doc = {
        clubId, categoryId: categoryId || null, outletId: outletId || null,
        itemName, itemCode: itemCode || '',
        price: Number(price), memberPrice: memberPrice !== undefined ? Number(memberPrice) : null,
        unit, description: description || '', tags: tags || [],
        isTimePrice: isTimePrice || false, modifiers: modifiers || [],
        dailyStock: dailyStock !== undefined ? Number(dailyStock) : null,
        soldOut: false, status: 'active', sortOrder: Number(sortOrder),
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('menu_items').add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.put('/items/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...body } = req.body;
      await db.collection('menu_items').doc(req.params.id).update({ ...body, updatedAt: new Date() });
      res.json({ success: true, message: '菜品更新成功' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  // 估清/恢复
  router.post('/items/:id/sold-out', async (req, res) => {
    try {
      const db = getDb();
      const { soldOut = true } = req.body;
      await db.collection('menu_items').doc(req.params.id).update({ soldOut, updatedAt: new Date() });
      res.json({ success: true, message: soldOut ? '已估清' : '已恢复' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  router.delete('/items/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('menu_items').doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  return router;
}
module.exports = createMenuRouter;
