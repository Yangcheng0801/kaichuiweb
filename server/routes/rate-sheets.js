/**
 * 价格矩阵管理路由 (Rate Sheets)
 *
 * 集合：rate_sheets
 * 每条记录 = dayType × timeSlot 的一组完整价格（散客/嘉宾/会员1-4/附加费）
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

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/rate-sheets  列表
  // query: clubId, dayType, timeSlot, status, courseId
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
  // 返回按 dayType × timeSlot 分组的数据，方便前端渲染矩阵表格
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

      // 按 dayType × timeSlot 分组
      const matrix = {};
      const dayTypes = ['weekday', 'weekend', 'holiday'];
      const timeSlots = ['morning', 'afternoon', 'twilight'];

      for (const dt of dayTypes) {
        matrix[dt] = {};
        for (const ts of timeSlots) {
          // 找到匹配的最高优先级规则
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
        priceWalkin = 0, priceGuest = 0,
        priceMember1 = 0, priceMember2 = 0, priceMember3 = 0, priceMember4 = 0,
        caddyFee = 0, cartFee = 0, insuranceFee = 0,
        priority = 100, validFrom, validTo,
      } = req.body;

      if (!dayType || !timeSlot) {
        return res.status(400).json({ success: false, error: '日期类型(dayType)和时段(timeSlot)必填' });
      }

      const now = new Date();
      const doc = {
        clubId, courseId: courseId || null,
        ruleName: ruleName || `${DAY_TYPE_LABELS[dayType] || dayType}${TIME_SLOT_LABELS[timeSlot] || timeSlot}价格`,
        dayType, timeSlot,
        startTime: startTime || '', endTime: endTime || '',
        holes: Number(holes) || 18,
        priceWalkin: Number(priceWalkin), priceGuest: Number(priceGuest),
        priceMember1: Number(priceMember1), priceMember2: Number(priceMember2),
        priceMember3: Number(priceMember3), priceMember4: Number(priceMember4),
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
  // 一键生成 dayType(3) × timeSlot(3) = 9 条基础价格规则
  // Body: { clubId, basePrice, memberDiscounts, fees }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/batch', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default',
        basePrice = 1200,           // 平日早场散客基准价
        weekendRate = 1.5,          // 周末系数
        holidayRate = 1.8,          // 假日系数
        afternoonRate = 0.8,        // 午场系数
        twilightRate = 0.6,         // 黄昏系数
        memberDiscounts = { level1: 0.7, level2: 0.6, level3: 0.5, level4: 0.4 },
        guestDiscount = 0.85,       // 嘉宾折扣率
        caddyFee = 200,
        cartFee = 150,
        insuranceFee = 10,
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
          const doc = {
            clubId,
            courseId: null,
            ruleName: `${DAY_TYPE_LABELS[dt.key]}${TIME_SLOT_LABELS[ts.key]}价格`,
            dayType: dt.key,
            timeSlot: ts.key,
            startTime: ts.start,
            endTime: ts.end,
            holes: 18,
            priceWalkin: base,
            priceGuest: Math.round(base * Number(guestDiscount)),
            priceMember1: Math.round(base * Number(memberDiscounts.level1 || 0.7)),
            priceMember2: Math.round(base * Number(memberDiscounts.level2 || 0.6)),
            priceMember3: Math.round(base * Number(memberDiscounts.level3 || 0.5)),
            priceMember4: Math.round(base * Number(memberDiscounts.level4 || 0.4)),
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

      // 逐条插入（TCB 不支持批量 add）
      const results = [];
      for (const doc of docs) {
        const r = await db.collection(COLLECTION).add(doc);
        results.push({ _id: r.id || r._id, ruleName: doc.ruleName });
      }

      res.json({
        success: true,
        message: `成功创建 ${results.length} 条价格规则`,
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
  //
  // Body: {
  //   clubId, date, teeTime, courseId?, holes?,
  //   players: [{ memberType, memberLevel, name }],
  //   needCaddy?, needCart?, packageId?, totalPlayers?
  // }
  //
  // 返回：完整价格明细（供前端预览）
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
