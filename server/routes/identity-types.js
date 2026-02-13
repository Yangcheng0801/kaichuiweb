/**
 * 身份类型管理路由 (Identity Types)
 *
 * 集合：identity_types
 * 管理球场可配置的所有球员身份类型（散客/嘉宾/各级会员/青少年/教练/长者/礼遇/员工等）
 *
 * 核心 API：
 *   GET    /              列表（返回所有身份类型，按 sortOrder 排序）
 *   POST   /              新增
 *   PUT    /:id           编辑
 *   DELETE /:id           删除（系统默认身份不可删除）
 *   POST   /seed          初始化默认身份类型（幂等，已有数据时跳过）
 *
 * @param {Function} getDb - 由 app.js 注入
 */
function createIdentityTypesRouter(getDb) {
  const express = require('express');
  const router = express.Router();
  const COLLECTION = 'identity_types';

  // ─── 默认身份类型种子数据 ─────────────────────────────────────────────────
  const DEFAULT_IDENTITIES = [
    { code: 'walkin',    name: '散客',     category: 'standard', memberLevel: null, sortOrder: 10,  color: '#6b7280', isDefault: true },
    { code: 'guest',     name: '嘉宾',     category: 'standard', memberLevel: null, sortOrder: 20,  color: '#3b82f6', isDefault: true },
    { code: 'member_1',  name: '普通会员', category: 'member',   memberLevel: 1,    sortOrder: 30,  color: '#10b981', isDefault: true },
    { code: 'member_2',  name: '金卡会员', category: 'member',   memberLevel: 2,    sortOrder: 40,  color: '#eab308', isDefault: true },
    { code: 'member_3',  name: '钻石会员', category: 'member',   memberLevel: 3,    sortOrder: 50,  color: '#8b5cf6', isDefault: true },
    { code: 'member_4',  name: '白金会员', category: 'member',   memberLevel: 4,    sortOrder: 60,  color: '#f43f5e', isDefault: true },
    { code: 'junior',    name: '青少年',   category: 'special',  memberLevel: null, sortOrder: 70,  color: '#06b6d4', isDefault: true },
    { code: 'senior',    name: '长者',     category: 'special',  memberLevel: null, sortOrder: 80,  color: '#f97316', isDefault: true },
    { code: 'coach',     name: '教练',     category: 'special',  memberLevel: null, sortOrder: 90,  color: '#14b8a6', isDefault: true },
    { code: 'courtesy',  name: '礼遇',     category: 'special',  memberLevel: null, sortOrder: 100, color: '#a855f7', isDefault: true },
    { code: 'staff',     name: '员工',     category: 'special',  memberLevel: null, sortOrder: 110, color: '#64748b', isDefault: true },
  ];

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/identity-types  获取列表
  // query: clubId, category, status
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', category, status } = req.query;
      const cond = { clubId };
      if (category) cond.category = category;
      if (status)   cond.status = status;

      const result = await db.collection(COLLECTION)
        .where(cond)
        .orderBy('sortOrder', 'asc')
        .limit(100)
        .get();

      res.json({ success: true, data: result.data || [] });
    } catch (error) {
      console.error('[IdentityTypes] 获取列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/identity-types  新增身份类型
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', code, name, category = 'special',
        memberLevel = null, sortOrder = 200, color = '#6b7280',
        ageMin, ageMax, description,
      } = req.body;

      if (!code || !name) {
        return res.status(400).json({ success: false, error: '身份代码(code)和名称(name)必填' });
      }

      // 检查 code 唯一
      const existing = await db.collection(COLLECTION).where({ clubId, code }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        return res.status(400).json({ success: false, error: `身份代码 "${code}" 已存在` });
      }

      const now = new Date();
      const doc = {
        clubId, code, name, category,
        memberLevel: memberLevel !== null && memberLevel !== undefined ? Number(memberLevel) : null,
        sortOrder: Number(sortOrder),
        color,
        ageMin: ageMin ? Number(ageMin) : null,
        ageMax: ageMax ? Number(ageMax) : null,
        description: description || '',
        isDefault: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      const r = await db.collection(COLLECTION).add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc }, message: '身份类型创建成功' });
    } catch (error) {
      console.error('[IdentityTypes] 创建失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/identity-types/:id  编辑
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, isDefault, code: _code, ...body } = req.body;

      // 数值字段
      if (body.sortOrder !== undefined) body.sortOrder = Number(body.sortOrder);
      if (body.memberLevel !== undefined && body.memberLevel !== null) body.memberLevel = Number(body.memberLevel);
      if (body.ageMin !== undefined && body.ageMin !== null) body.ageMin = Number(body.ageMin);
      if (body.ageMax !== undefined && body.ageMax !== null) body.ageMax = Number(body.ageMax);

      await db.collection(COLLECTION).doc(req.params.id).update({
        ...body,
        updatedAt: new Date(),
      });

      res.json({ success: true, message: '身份类型更新成功' });
    } catch (error) {
      console.error('[IdentityTypes] 更新失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE /api/identity-types/:id  删除
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      // 检查是否为系统默认
      const docRes = await db.collection(COLLECTION).doc(req.params.id).get();
      const doc = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
      if (doc && doc.isDefault) {
        return res.status(400).json({ success: false, error: '系统默认身份类型不可删除，可设置为停用' });
      }

      await db.collection(COLLECTION).doc(req.params.id).remove();
      res.json({ success: true, message: '身份类型已删除' });
    } catch (error) {
      console.error('[IdentityTypes] 删除失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/identity-types/seed  初始化默认身份类型（幂等）
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/seed', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default' } = req.body;

      // 检查是否已有数据
      const existing = await db.collection(COLLECTION).where({ clubId }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        return res.json({ success: true, message: '身份类型已存在，跳过初始化', data: { skipped: true } });
      }

      const now = new Date();
      const results = [];
      for (const identity of DEFAULT_IDENTITIES) {
        const doc = {
          ...identity,
          clubId,
          status: 'active',
          ageMin: identity.code === 'junior' ? 0 : (identity.code === 'senior' ? 60 : null),
          ageMax: identity.code === 'junior' ? 18 : null,
          description: '',
          createdAt: now,
          updatedAt: now,
        };
        const r = await db.collection(COLLECTION).add(doc);
        results.push({ _id: r.id || r._id, code: identity.code, name: identity.name });
      }

      res.json({
        success: true,
        message: `成功初始化 ${results.length} 种身份类型`,
        data: results,
      });
    } catch (error) {
      console.error('[IdentityTypes] 初始化失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createIdentityTypesRouter;
