/**
 * 价格矩阵管理路由 (Rate Sheets) v2
 *
 * 集合：rate_sheets
 * 每条记录 = dayType × timeSlot 的一组完整价格
 *
 * v2 升级：
 *   - prices: Record<string, number>   动态身份定价（替代固定 priceWalkin 等 6 个字段）
 *   - addOnPrices: Record<string, number>  加打 9 洞的身份定价
 *   - reducedPlayPolicy: { type, rate, fixedPrices }  减打策略
 *   - 向后兼容：仍然保留旧字段读写（getGreenFee 内部自动转换）
 *
 * 核心 API：
 *   GET    /              列表（支持筛选）
 *   GET    /matrix        矩阵视图（按 dayType × timeSlot 分组）
 *   POST   /              新增规则
 *   POST   /batch         批量初始化（一键生成全矩阵 3×3=9 条）
 *   PUT    /:id           编辑
 *   DELETE /:id           删除
 *   POST   /calculate     定价计算 API（前端调用，返回自动算出的价格）
 */
function createRateSheetsRouter(getDb) {
  const express = require('express');
  const router = express.Router();
  const { calculateBookingPrice, determineDayType, determineTimeSlot, DAY_TYPE_LABELS, TIME_SLOT_LABELS } = require('../utils/pricing-engine');
  const COLLECTION = 'rate_sheets';

  // ── 辅助：从 body 中提取 prices / addOnPrices / reducedPlayPolicy ──
  function extractPricingFields(body) {
    const fields = {};

    // 新版 prices 对象
    if (body.prices && typeof body.prices === 'object') {
      const cleaned = {};
      for (const [k, v] of Object.entries(body.prices)) {
        cleaned[k] = Number(v) || 0;
      }
      fields.prices = cleaned;
    }

    // 向后兼容：如果传了旧字段 priceWalkin 等，也同步写入 prices
    const legacyMap = { priceWalkin: 'walkin', priceGuest: 'guest', priceMember1: 'member_1', priceMember2: 'member_2', priceMember3: 'member_3', priceMember4: 'member_4' };
    let hasLegacy = false;
    for (const [oldKey, newKey] of Object.entries(legacyMap)) {
      if (body[oldKey] !== undefined) {
        if (!fields.prices) fields.prices = {};
        fields.prices[newKey] = Number(body[oldKey]) || 0;
        fields[oldKey] = Number(body[oldKey]) || 0; // 保留旧字段以兼容
        hasLegacy = true;
      }
    }

    // 加打价格
    if (body.addOnPrices && typeof body.addOnPrices === 'object') {
      const cleaned = {};
      for (const [k, v] of Object.entries(body.addOnPrices)) {
        cleaned[k] = Number(v) || 0;
      }
      fields.addOnPrices = cleaned;
    }

    // 减打策略
    if (body.reducedPlayPolicy && typeof body.reducedPlayPolicy === 'object') {
      const rp = body.reducedPlayPolicy;
      fields.reducedPlayPolicy = {
        type: rp.type || 'proportional',
        rate: Number(rp.rate) || 0.6,
        fixedPrices: {},
      };
      if (rp.fixedPrices && typeof rp.fixedPrices === 'object') {
        for (const [k, v] of Object.entries(rp.fixedPrices)) {
          fields.reducedPlayPolicy.fixedPrices[k] = Number(v) || 0;
        }
      }
    }

    return fields;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/rate-sheets  列表
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', dayType, timeSlot, status, courseId } = req.query;
      const cond = { clubId };
      if (dayType)  cond.dayType  = dayType;
      if (timeSlot) cond.timeSlot = timeSlot;
      if (status)   cond.status   = status;
      if (courseId)  cond.courseId = courseId;

      const result = await db.collection(COLLECTION)
        .where(cond)
        .orderBy('priority', 'desc')
        .limit(100)
        .get();

      res.json({ success: true, data: result.data || [] });
    } catch (error) {
      console.error('[RateSheets] 获取列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/rate-sheets/matrix  矩阵视图
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/matrix', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default' } = req.query;

      const result = await db.collection(COLLECTION)
        .where({ clubId, status: 'active' })
        .orderBy('priority', 'desc')
        .limit(100)
        .get();

      const rules = result.data || [];

      const matrix = {};
      const dayTypes = ['weekday', 'weekend', 'holiday'];
      const timeSlots = ['morning', 'afternoon', 'twilight'];

      for (const dt of dayTypes) {
        matrix[dt] = {};
        for (const ts of timeSlots) {
          const match = rules.find(r => r.dayType === dt && r.timeSlot === ts);
          matrix[dt][ts] = match || null;
        }
      }

      res.json({
        success: true,
        data: {
          matrix,
          dayTypes: dayTypes.map(dt => ({ key: dt, label: DAY_TYPE_LABELS[dt] })),
          timeSlots: timeSlots.map(ts => ({ key: ts, label: TIME_SLOT_LABELS[ts] })),
          totalRules: rules.length,
        },
      });
    } catch (error) {
      console.error('[RateSheets] 获取矩阵失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/rate-sheets  新增规则
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', courseId = null,
        ruleName, dayType, timeSlot,
        startTime, endTime, holes = 18,
        // 旧字段向后兼容
        priceWalkin = 0, priceGuest = 0,
        priceMember1 = 0, priceMember2 = 0, priceMember3 = 0, priceMember4 = 0,
        caddyFee = 0, cartFee = 0, insuranceFee = 0,
        priority = 100, validFrom, validTo,
      } = req.body;

      if (!dayType || !timeSlot) {
        return res.status(400).json({ success: false, error: '日期类型(dayType)和时段(timeSlot)必填' });
      }

      const pricingFields = extractPricingFields(req.body);

      const now = new Date();
      const doc = {
        clubId, courseId: courseId || null,
        ruleName: ruleName || `${DAY_TYPE_LABELS[dayType] || dayType}${TIME_SLOT_LABELS[timeSlot] || timeSlot}价格`,
        dayType, timeSlot,
        startTime: startTime || '', endTime: endTime || '',
        holes: Number(holes) || 18,
        // 新版动态定价
        prices: pricingFields.prices || {
          walkin: Number(priceWalkin), guest: Number(priceGuest),
          member_1: Number(priceMember1), member_2: Number(priceMember2),
          member_3: Number(priceMember3), member_4: Number(priceMember4),
        },
        addOnPrices: pricingFields.addOnPrices || {},
        reducedPlayPolicy: pricingFields.reducedPlayPolicy || { type: 'proportional', rate: 0.6, fixedPrices: {} },
        // 旧字段保留（向后兼容）
        priceWalkin: Number(priceWalkin), priceGuest: Number(priceGuest),
        priceMember1: Number(priceMember1), priceMember2: Number(priceMember2),
        priceMember3: Number(priceMember3), priceMember4: Number(priceMember4),
        // 附加费
        caddyFee: Number(caddyFee), cartFee: Number(cartFee), insuranceFee: Number(insuranceFee),
        priority: Number(priority) || 100,
        status: 'active',
        validFrom: validFrom || now.toISOString().slice(0, 10),
        validTo: validTo || '',
        createdAt: now, updatedAt: now,
      };

      const r = await db.collection(COLLECTION).add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc }, message: '价格规则创建成功' });
    } catch (error) {
      console.error('[RateSheets] 创建失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/rate-sheets/batch  批量初始化
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/batch', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default',
        basePrice = 1200,
        weekendRate = 1.5,
        holidayRate = 1.8,
        afternoonRate = 0.8,
        twilightRate = 0.6,
        memberDiscounts = { level1: 0.7, level2: 0.6, level3: 0.5, level4: 0.4 },
        guestDiscount = 0.85,
        // 特殊身份折扣（可选配置）
        specialDiscounts = { junior: 0.5, senior: 0.65, coach: 0, courtesy: 0, staff: 0.25 },
        caddyFee = 200,
        cartFee = 150,
        insuranceFee = 10,
        // 加打默认系数
        addOnRate = 0.5,
        // 减打策略
        reducedPlayType = 'proportional',
        reducedPlayRate = 0.6,
      } = req.body;

      const dayTypes = [
        { key: 'weekday', rate: 1 },
        { key: 'weekend', rate: Number(weekendRate) },
        { key: 'holiday', rate: Number(holidayRate) },
      ];
      const timeSlots = [
        { key: 'morning',   rate: 1, start: '06:00', end: '12:00' },
        { key: 'afternoon', rate: Number(afternoonRate), start: '12:00', end: '16:00' },
        { key: 'twilight',  rate: Number(twilightRate),  start: '16:00', end: '19:00' },
      ];

      const now = new Date();
      const docs = [];
      let priority = 100;

      for (const dt of dayTypes) {
        for (const ts of timeSlots) {
          const base = Math.round(Number(basePrice) * dt.rate * ts.rate);

          // 构建动态 prices 对象
          const prices = {
            walkin:   base,
            guest:    Math.round(base * Number(guestDiscount)),
            member_1: Math.round(base * Number(memberDiscounts.level1 || 0.7)),
            member_2: Math.round(base * Number(memberDiscounts.level2 || 0.6)),
            member_3: Math.round(base * Number(memberDiscounts.level3 || 0.5)),
            member_4: Math.round(base * Number(memberDiscounts.level4 || 0.4)),
          };

          // 特殊身份定价
          const sd = specialDiscounts || {};
          if (sd.junior !== undefined) prices.junior   = sd.junior === 0 ? 0 : Math.round(base * Number(sd.junior));
          if (sd.senior !== undefined) prices.senior   = sd.senior === 0 ? 0 : Math.round(base * Number(sd.senior));
          if (sd.coach !== undefined)  prices.coach    = sd.coach === 0  ? 0 : Math.round(base * Number(sd.coach));
          if (sd.courtesy !== undefined) prices.courtesy = sd.courtesy === 0 ? 0 : Math.round(base * Number(sd.courtesy));
          if (sd.staff !== undefined)  prices.staff    = sd.staff === 0  ? 0 : Math.round(base * Number(sd.staff));

          // 加打价格
          const addOnPrices = {};
          for (const [k, v] of Object.entries(prices)) {
            addOnPrices[k] = Math.round(v * Number(addOnRate));
          }

          // 减打策略
          const reducedPlayPolicy = {
            type: reducedPlayType,
            rate: Number(reducedPlayRate),
            fixedPrices: {},
          };

          const doc = {
            clubId,
            courseId: null,
            ruleName: `${DAY_TYPE_LABELS[dt.key]}${TIME_SLOT_LABELS[ts.key]}价格`,
            dayType: dt.key,
            timeSlot: ts.key,
            startTime: ts.start,
            endTime: ts.end,
            holes: 18,
            // 新版动态定价
            prices,
            addOnPrices,
            reducedPlayPolicy,
            // 旧字段保留
            priceWalkin: prices.walkin,
            priceGuest: prices.guest,
            priceMember1: prices.member_1,
            priceMember2: prices.member_2,
            priceMember3: prices.member_3,
            priceMember4: prices.member_4,
            // 附加费
            caddyFee: Number(caddyFee),
            cartFee: Number(cartFee),
            insuranceFee: Number(insuranceFee),
            priority: priority--,
            status: 'active',
            validFrom: now.toISOString().slice(0, 10),
            validTo: '',
            createdAt: now,
            updatedAt: now,
          };
          docs.push(doc);
        }
      }

      const results = [];
      for (const doc of docs) {
        const r = await db.collection(COLLECTION).add(doc);
        results.push({ _id: r.id || r._id, ruleName: doc.ruleName });
      }

      res.json({
        success: true,
        message: `成功创建 ${results.length} 条价格规则（含特殊身份/加打/减打定价）`,
        data: results,
      });
    } catch (error) {
      console.error('[RateSheets] 批量创建失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/rate-sheets/:id  编辑
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...body } = req.body;

      // 数值字段强制转 Number
      const numFields = ['priceWalkin', 'priceGuest', 'priceMember1', 'priceMember2', 'priceMember3', 'priceMember4', 'caddyFee', 'cartFee', 'insuranceFee', 'priority', 'holes'];
      for (const f of numFields) {
        if (body[f] !== undefined) body[f] = Number(body[f]);
      }

      // 提取新版定价字段
      const pricingFields = extractPricingFields(body);
      // 合并到 body
      if (pricingFields.prices) body.prices = pricingFields.prices;
      if (pricingFields.addOnPrices) body.addOnPrices = pricingFields.addOnPrices;
      if (pricingFields.reducedPlayPolicy) body.reducedPlayPolicy = pricingFields.reducedPlayPolicy;

      // 同步旧字段（如果更新了 prices）
      if (body.prices) {
        if (body.prices.walkin !== undefined) body.priceWalkin = body.prices.walkin;
        if (body.prices.guest !== undefined) body.priceGuest = body.prices.guest;
        if (body.prices.member_1 !== undefined) body.priceMember1 = body.prices.member_1;
        if (body.prices.member_2 !== undefined) body.priceMember2 = body.prices.member_2;
        if (body.prices.member_3 !== undefined) body.priceMember3 = body.prices.member_3;
        if (body.prices.member_4 !== undefined) body.priceMember4 = body.prices.member_4;
      }

      await db.collection(COLLECTION).doc(req.params.id).update({
        ...body,
        updatedAt: new Date(),
      });

      res.json({ success: true, message: '价格规则更新成功' });
    } catch (error) {
      console.error('[RateSheets] 更新失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE /api/rate-sheets/:id  删除
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection(COLLECTION).doc(req.params.id).remove();
      res.json({ success: true, message: '价格规则已删除' });
    } catch (error) {
      console.error('[RateSheets] 删除失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/rate-sheets/calculate  定价计算 API
  // 支持 isAddOn / isReduced 参数
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/calculate', async (req, res) => {
    try {
      const db = getDb();
      const result = await calculateBookingPrice(db, req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('[RateSheets] 价格计算失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createRateSheetsRouter;
