/**
 * 系统设置路由
 * 包含：球会基础信息、预订规则、价格规则
 * 三个模块均采用"单文档 upsert"模式（集合内只存一条配置记录，按 clubId 区分）
 *
 * @param {Function} getDb - 由 app.js 注入的 getDb()，返回 cloud.database() 或 HTTP 适配器
 */
function createSettingsRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  // ─── 默认值 ────────────────────────────────────────────────────────────────

  const DEFAULT_CLUB_INFO = {
    name: '',
    shortName: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    description: '',
    timezone: 'Asia/Shanghai',
    currency: 'CNY',
    logo: ''
  };

  const DEFAULT_BOOKING_RULES = {
    teeTimeInterval: 10,          // 发球间隔（分钟）
    openTime: '06:00',
    closeTime: '18:00',
    advanceBookingDays: {
      member: 14,
      guest: 7,
      walkin: 1
    },
    minPlayers: 1,
    maxPlayers: 4,
    cancellationPolicy: {
      freeBeforeHours: 24,        // 免费取消截止（小时前）
      penaltyRate: 0.5,           // 取消手续费比例
      noShowPenalty: 1.0          // 未到场扣除比例
    },
    guestPolicy: {
      maxGuestsPerMember: 3,
      requireMemberPresent: true
    }
  };

  const DEFAULT_PRICING_RULES = {
    memberDiscount: {
      level1: 0.7,
      level2: 0.6,
      level3: 0.5,
      level4: 0.4
    },
    dynamicPricing: false,
    holidayPolicy: {
      enabled: true,
      surchargeRate: 1.5
    },
    timeSlotPricing: {
      morning: { start: '06:00', end: '12:00', rate: 1.0 },
      afternoon: { start: '12:00', end: '18:00', rate: 0.8 }
    },
    additionalFees: {
      caddyFee: 200,
      cartFee: 150,
      lockerFee: 0,
      insuranceFee: 10
    },
    // 点号费（指定球童）配置
    caddyRequestFee: {
      enabled: true,
      defaultAmount: 100,
      byLevel: { gold: 150, silver: 120, trainee: 80 },
      byIdentity: { walkin: 120, guest: 100, member_1: 80, member_2: 80, member_3: 80, member_4: 80 },
      clubShareRatio: 0.6,
    },
  };

  // ─── 工具函数 ───────────────────────────────────────────────────────────────

  /**
   * 从集合中取第一条匹配 clubId 的文档。
   * 若不存在则返回 null。
   */
  async function findOne(db, collection, clubId) {
    const result = await db.collection(collection)
      .where({ clubId })
      .limit(1)
      .get();
    return result.data && result.data.length > 0 ? result.data[0] : null;
  }

  /**
   * 深合并两个对象（只合并一层嵌套，满足当前业务需求）。
   */
  function mergeDeep(target, source) {
    const out = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null
      ) {
        out[key] = { ...target[key], ...source[key] };
      } else {
        out[key] = source[key];
      }
    }
    return out;
  }

  // ─── 球会基础信息 ────────────────────────────────────────────────────────────

  /**
   * GET /api/settings/club
   * 返回球会基础信息，若未配置则返回默认值
   */
  router.get('/club', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';

      const doc = await findOne(db, 'club_info', clubId);
      const data = doc
        ? { ...DEFAULT_CLUB_INFO, ...doc }
        : { ...DEFAULT_CLUB_INFO, clubId };

      res.json({ success: true, data });
    } catch (error) {
      console.error('[Settings] 获取球会信息失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/settings/club
   * 更新球会基础信息（upsert）
   * Body: 任意球会信息字段（部分更新即可）
   */
  router.put('/club', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.body.clubId || req.query.clubId || 'default';

      // 过滤掉不允许客户端直接写入的字段
      const { _id, createTime, ...fields } = req.body;

      const existing = await findOne(db, 'club_info', clubId);

      if (existing) {
        const updateData = {
          ...fields,
          clubId,
          updateTime: new Date()
        };
        await db.collection('club_info').doc(existing._id).update({ data: updateData });
        res.json({ success: true, message: '球会信息更新成功' });
      } else {
        const insertData = {
          ...DEFAULT_CLUB_INFO,
          ...fields,
          clubId,
          createTime: new Date(),
          updateTime: new Date()
        };
        await db.collection('club_info').add({ data: insertData });
        res.json({ success: true, message: '球会信息创建成功' });
      }
    } catch (error) {
      console.error('[Settings] 更新球会信息失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── 预订规则 ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/settings/booking-rules
   * 返回预订规则，若未配置则返回默认值
   */
  router.get('/booking-rules', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';

      const doc = await findOne(db, 'booking_rules', clubId);
      const data = doc
        ? mergeDeep(DEFAULT_BOOKING_RULES, doc)
        : { ...DEFAULT_BOOKING_RULES, clubId };

      res.json({ success: true, data });
    } catch (error) {
      console.error('[Settings] 获取预订规则失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/settings/booking-rules
   * 更新预订规则（upsert，支持部分更新）
   */
  router.put('/booking-rules', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.body.clubId || req.query.clubId || 'default';

      const { _id, createTime, ...fields } = req.body;

      const existing = await findOne(db, 'booking_rules', clubId);

      if (existing) {
        const merged = mergeDeep(existing, fields);
        const updateData = { ...merged, clubId, updateTime: new Date() };
        delete updateData._id;
        await db.collection('booking_rules').doc(existing._id).update({ data: updateData });
        res.json({ success: true, message: '预订规则更新成功' });
      } else {
        const insertData = {
          ...DEFAULT_BOOKING_RULES,
          ...fields,
          clubId,
          createTime: new Date(),
          updateTime: new Date()
        };
        await db.collection('booking_rules').add({ data: insertData });
        res.json({ success: true, message: '预订规则创建成功' });
      }
    } catch (error) {
      console.error('[Settings] 更新预订规则失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── 价格规则 ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/settings/pricing-rules
   * 返回价格规则，若未配置则返回默认值
   */
  router.get('/pricing-rules', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';

      const doc = await findOne(db, 'pricing_rules', clubId);
      const data = doc
        ? mergeDeep(DEFAULT_PRICING_RULES, doc)
        : { ...DEFAULT_PRICING_RULES, clubId };

      res.json({ success: true, data });
    } catch (error) {
      console.error('[Settings] 获取价格规则失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/settings/pricing-rules
   * 更新价格规则（upsert，支持部分更新）
   */
  router.put('/pricing-rules', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.body.clubId || req.query.clubId || 'default';

      const { _id, createTime, ...fields } = req.body;

      const existing = await findOne(db, 'pricing_rules', clubId);

      if (existing) {
        const merged = mergeDeep(existing, fields);
        const updateData = { ...merged, clubId, updateTime: new Date() };
        delete updateData._id;
        await db.collection('pricing_rules').doc(existing._id).update({ data: updateData });
        res.json({ success: true, message: '价格规则更新成功' });
      } else {
        const insertData = {
          ...DEFAULT_PRICING_RULES,
          ...fields,
          clubId,
          createTime: new Date(),
          updateTime: new Date()
        };
        await db.collection('pricing_rules').add({ data: insertData });
        res.json({ success: true, message: '价格规则创建成功' });
      }
    } catch (error) {
      console.error('[Settings] 更新价格规则失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── 团队定价规则 ─────────────────────────────────────────────────────────────

  const DEFAULT_TEAM_PRICING = {
    enabled: true,
    tiers: [
      { minPlayers: 8,  maxPlayers: 15,  discountRate: 0.9,  label: '小型团队9折' },
      { minPlayers: 16, maxPlayers: 23,  discountRate: 0.85, label: '中型团队85折' },
      { minPlayers: 24, maxPlayers: 35,  discountRate: 0.8,  label: '大型团队8折' },
      { minPlayers: 36, maxPlayers: 999, discountRate: 0.75, label: '赛事级75折' },
    ],
    floorPriceRate: 0.6,  // 底价保护：折扣后价格不低于散客价的 60%
  };

  /**
   * GET /api/settings/team-pricing
   * 返回团队定价规则
   */
  router.get('/team-pricing', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';

      const doc = await findOne(db, 'team_pricing', clubId);
      const data = doc
        ? { ...DEFAULT_TEAM_PRICING, ...doc }
        : { ...DEFAULT_TEAM_PRICING, clubId };

      res.json({ success: true, data });
    } catch (error) {
      console.error('[Settings] 获取团队定价失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/settings/team-pricing
   * 更新团队定价规则（upsert）
   */
  router.put('/team-pricing', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.body.clubId || req.query.clubId || 'default';

      const { _id, createTime, ...fields } = req.body;

      const existing = await findOne(db, 'team_pricing', clubId);

      if (existing) {
        const updateData = { ...fields, clubId, updateTime: new Date() };
        delete updateData._id;
        await db.collection('team_pricing').doc(existing._id).update({ data: updateData });
        res.json({ success: true, message: '团队定价规则更新成功' });
      } else {
        const insertData = {
          ...DEFAULT_TEAM_PRICING,
          ...fields,
          clubId,
          createTime: new Date(),
          updateTime: new Date(),
        };
        await db.collection('team_pricing').add({ data: insertData });
        res.json({ success: true, message: '团队定价规则创建成功' });
      }
    } catch (error) {
      console.error('[Settings] 更新团队定价失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createSettingsRouter;
