/**
 * 会籍套餐管理路由
 * 提供套餐 CRUD、一键初始化默认套餐
 */
const express = require('express');

module.exports = function (getDb) {
  const router = express.Router();
  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || req.clubId || DEFAULT_CLUB_ID;
  }

  const DEFAULT_PLANS = [
    {
      planCode: 'annual_vip',
      name: '年度 VIP 会籍',
      category: 'annual',
      duration: 12,
      price: 88000,
      depositAmount: 0,
      benefits: {
        freeRounds: 48, discountRate: 0.7, guestQuota: 12, guestDiscount: 0.85,
        priorityBooking: true, freeCaddy: false, freeCart: false, freeLocker: true, freeParking: true,
      },
      pointsRules: { earnRate: 1.5, welcomePoints: 8000, birthdayMultiplier: 2 },
      identityCode: 'member_1',
      maxMembers: 1,
      autoRenew: false,
      description: '全年 48 轮免费打球，带客 12 次，7 折续打',
    },
    {
      planCode: 'half_year',
      name: '半年卡',
      category: 'seasonal',
      duration: 6,
      price: 48000,
      depositAmount: 0,
      benefits: {
        freeRounds: 24, discountRate: 0.8, guestQuota: 6, guestDiscount: 0.9,
        priorityBooking: true, freeCaddy: false, freeCart: false, freeLocker: true, freeParking: true,
      },
      pointsRules: { earnRate: 1.2, welcomePoints: 4000, birthdayMultiplier: 2 },
      identityCode: 'member_2',
      maxMembers: 1,
      autoRenew: false,
      description: '半年 24 轮免费打球，带客 6 次，8 折续打',
    },
    {
      planCode: 'quarter',
      name: '季卡',
      category: 'seasonal',
      duration: 3,
      price: 28000,
      depositAmount: 0,
      benefits: {
        freeRounds: 12, discountRate: 0.85, guestQuota: 3, guestDiscount: 0.9,
        priorityBooking: false, freeCaddy: false, freeCart: false, freeLocker: false, freeParking: true,
      },
      pointsRules: { earnRate: 1, welcomePoints: 2000, birthdayMultiplier: 1.5 },
      identityCode: 'member_3',
      maxMembers: 1,
      autoRenew: false,
      description: '季度 12 轮免费打球，带客 3 次，8.5 折续打',
    },
    {
      planCode: 'rounds_20',
      name: '20 次卡',
      category: 'rounds',
      duration: 0,
      price: 18000,
      depositAmount: 0,
      benefits: {
        freeRounds: 20, discountRate: 1, guestQuota: 0, guestDiscount: 1,
        priorityBooking: false, freeCaddy: false, freeCart: false, freeLocker: false, freeParking: false,
      },
      pointsRules: { earnRate: 0.5, welcomePoints: 500, birthdayMultiplier: 1 },
      identityCode: 'member_4',
      maxMembers: 1,
      autoRenew: false,
      description: '20 次打球权益，用完即止，无有效期限制',
    },
    {
      planCode: 'stored_value_50k',
      name: '5 万储值卡',
      category: 'stored_value',
      duration: 24,
      price: 50000,
      depositAmount: 0,
      benefits: {
        freeRounds: 0, discountRate: 0.75, guestQuota: 6, guestDiscount: 0.85,
        priorityBooking: true, freeCaddy: false, freeCart: false, freeLocker: true, freeParking: true,
      },
      pointsRules: { earnRate: 2, welcomePoints: 10000, birthdayMultiplier: 2 },
      identityCode: 'member_2',
      maxMembers: 1,
      autoRenew: false,
      description: '预存 5 万，消费 7.5 折，赠 10000 积分',
    },
    {
      planCode: 'family',
      name: '家庭会籍',
      category: 'family',
      duration: 12,
      price: 128000,
      depositAmount: 0,
      benefits: {
        freeRounds: 96, discountRate: 0.7, guestQuota: 24, guestDiscount: 0.8,
        priorityBooking: true, freeCaddy: false, freeCart: true, freeLocker: true, freeParking: true,
      },
      pointsRules: { earnRate: 2, welcomePoints: 15000, birthdayMultiplier: 3 },
      identityCode: 'member_1',
      maxMembers: 4,
      autoRenew: false,
      description: '全年 96 轮（最多 4 人共享），免球车费，家庭共享权益',
    },
  ];

  /* ==================== 列表 ==================== */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { status, category } = req.query;

      const result = await db.collection('membership_plans')
        .where({ clubId })
        .orderBy('sortOrder', 'asc')
        .limit(100)
        .get();

      let list = result.data || [];
      if (status) list = list.filter(p => p.status === status);
      if (category) list = list.filter(p => p.category === category);

      res.json({ success: true, data: list });
    } catch (err) {
      console.error('[MembershipPlans] 列表查询失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 详情 ==================== */
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('membership_plans').doc(req.params.id).get();
      const plan = (result.data || [])[0] || result.data;
      if (!plan) return res.status(404).json({ success: false, message: '套餐不存在' });
      res.json({ success: true, data: plan });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 创建 ==================== */
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { planCode, name, category, duration, price, depositAmount,
        benefits, pointsRules, identityCode, maxMembers, autoRenew, description } = req.body;

      if (!planCode || !name || !category) {
        return res.status(400).json({ success: false, message: '套餐编码、名称和类型必填' });
      }

      const existing = await db.collection('membership_plans').where({ clubId, planCode }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        return res.status(400).json({ success: false, message: `套餐编码 "${planCode}" 已存在` });
      }

      const now = new Date().toISOString();
      const result = await db.collection('membership_plans').add({
        data: {
          clubId,
          planCode,
          name,
          category: category || 'annual',
          duration: Number(duration) || 12,
          price: Number(price) || 0,
          depositAmount: Number(depositAmount) || 0,
          benefits: benefits || {},
          pointsRules: pointsRules || { earnRate: 1, welcomePoints: 0, birthdayMultiplier: 1 },
          identityCode: identityCode || 'member_1',
          maxMembers: Number(maxMembers) || 1,
          autoRenew: !!autoRenew,
          description: description || '',
          status: 'active',
          sortOrder: 99,
          salesCount: 0,
          createdAt: now,
          updatedAt: now,
        }
      });

      res.json({ success: true, data: { _id: result._id }, message: '创建成功' });
    } catch (err) {
      console.error('[MembershipPlans] 创建失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 更新 ==================== */
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { name, category, duration, price, depositAmount,
        benefits, pointsRules, identityCode, maxMembers, autoRenew, description, status, sortOrder } = req.body;

      const update = { updatedAt: new Date().toISOString() };
      if (name !== undefined) update.name = name;
      if (category !== undefined) update.category = category;
      if (duration !== undefined) update.duration = Number(duration);
      if (price !== undefined) update.price = Number(price);
      if (depositAmount !== undefined) update.depositAmount = Number(depositAmount);
      if (benefits !== undefined) update.benefits = benefits;
      if (pointsRules !== undefined) update.pointsRules = pointsRules;
      if (identityCode !== undefined) update.identityCode = identityCode;
      if (maxMembers !== undefined) update.maxMembers = Number(maxMembers);
      if (autoRenew !== undefined) update.autoRenew = !!autoRenew;
      if (description !== undefined) update.description = description;
      if (status !== undefined) update.status = status;
      if (sortOrder !== undefined) update.sortOrder = Number(sortOrder);

      await db.collection('membership_plans').doc(req.params.id).update({ data: update });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 删除 ==================== */
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('membership_plans').doc(req.params.id).remove();
      res.json({ success: true, message: '删除成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 一键初始化默认套餐 ==================== */
  router.post('/seed', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);

      const existing = await db.collection('membership_plans').where({ clubId }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        return res.json({ success: true, message: '套餐已存在，跳过初始化', data: { seeded: 0 } });
      }

      const now = new Date().toISOString();
      let count = 0;
      for (let i = 0; i < DEFAULT_PLANS.length; i++) {
        const plan = DEFAULT_PLANS[i];
        await db.collection('membership_plans').add({
          data: {
            clubId,
            ...plan,
            status: 'active',
            sortOrder: i + 1,
            salesCount: 0,
            createdAt: now,
            updatedAt: now,
          }
        });
        count++;
      }

      res.json({ success: true, message: `成功初始化 ${count} 个默认套餐`, data: { seeded: count } });
    } catch (err) {
      console.error('[MembershipPlans] 初始化失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 统计 ==================== */
  router.get('/stats/summary', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);

      const plansRes = await db.collection('membership_plans').where({ clubId }).limit(100).get();
      const plans = plansRes.data || [];

      const membershipsRes = await db.collection('memberships').where({ clubId }).limit(1000).get();
      const memberships = membershipsRes.data || [];

      const activePlans = plans.filter(p => p.status === 'active').length;
      const activeMemberships = memberships.filter(m => m.status === 'active').length;
      const totalRevenue = memberships.reduce((s, m) => s + (Number(m.payment?.amount) || 0), 0);

      const byCat = {};
      memberships.forEach(m => {
        const cat = m.planCategory || 'other';
        if (!byCat[cat]) byCat[cat] = { count: 0, revenue: 0 };
        byCat[cat].count++;
        byCat[cat].revenue += Number(m.payment?.amount) || 0;
      });

      res.json({
        success: true,
        data: { activePlans, totalPlans: plans.length, activeMemberships, totalMemberships: memberships.length, totalRevenue, byCategory: byCat }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
