/**
 * 住宿套餐管理
 * 集合：stay_packages
 */
function createStayPackagesRouter(getDb) {
  const express = require('express');
  const router = express.Router();
  const COLLECTION = 'stay_packages';

  /* ========== GET /api/stay-packages  列表 ========== */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', status } = req.query;
      const where = { clubId };
      if (status) where.status = status;
      const r = await db.collection(COLLECTION).where(where).orderBy('createdAt', 'desc').limit(100).get();
      res.json({ success: true, data: r.data || [] });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== POST /api/stay-packages  创建 ========== */
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', packageName, packageCode, description,
        includes = {}, pricing = {}, validFrom, validTo,
      } = req.body;
      if (!packageName) return res.status(400).json({ success: false, error: '套餐名称必填' });

      const now = new Date();
      const doc = {
        clubId, packageName, packageCode: packageCode || '',
        description: description || '',
        includes: {
          nights: includes.nights || 1,
          rounds: includes.rounds || 0,
          breakfast: includes.breakfast || false,
          dinner: includes.dinner || false,
          cartIncluded: includes.cartIncluded || false,
          caddyIncluded: includes.caddyIncluded || false,
        },
        pricing: {
          basePrice: Number(pricing.basePrice || 0),
          memberPrice: Number(pricing.memberPrice || 0),
          weekendSurcharge: Number(pricing.weekendSurcharge || 0),
          // v2: 按身份分价（可选，有值时覆盖 basePrice/memberPrice）
          priceWalkin: Number(pricing.priceWalkin || pricing.basePrice || 0),
          priceGuest: Number(pricing.priceGuest || pricing.basePrice || 0),
          priceMember1: Number(pricing.priceMember1 || pricing.memberPrice || 0),
          priceMember2: Number(pricing.priceMember2 || pricing.memberPrice || 0),
          priceMember3: Number(pricing.priceMember3 || pricing.memberPrice || 0),
          priceMember4: Number(pricing.priceMember4 || pricing.memberPrice || 0),
        },
        status: 'active',
        validFrom: validFrom || now.toISOString().slice(0, 10),
        validTo: validTo || '',
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection(COLLECTION).add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== PUT /api/stay-packages/:id  更新 ========== */
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...body } = req.body;
      await db.collection(COLLECTION).doc(req.params.id).update({ ...body, updatedAt: new Date() });
      res.json({ success: true, message: '套餐更新成功' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== DELETE /api/stay-packages/:id  删除 ========== */
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection(COLLECTION).doc(req.params.id).remove();
      res.json({ success: true, message: '套餐已删除' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createStayPackagesRouter;
