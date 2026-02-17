/**
 * 会籍订阅生命周期路由
 * 开卡 / 激活 / 续费 / 暂停 / 恢复 / 取消 / 到期检查
 */
const express = require('express');

module.exports = function (getDb) {
  const router = express.Router();
  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

  // 通知引擎（惰性加载）
  let _notifyEngine = null;
  function getNotifyEngine() {
    if (!_notifyEngine) {
      try { _notifyEngine = require('../utils/notification-engine'); }
      catch (e) { console.warn('[Memberships] notification-engine 不可用:', e.message); }
    }
    return _notifyEngine;
  }

  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || req.clubId || DEFAULT_CLUB_ID;
  }

  /* 生成会籍编号: MS2602-000001 */
  async function generateMembershipNo(db, clubId) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `MS${yy}${mm}`;

    const existing = await db.collection('memberships')
      .where({ clubId })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    let seq = 1;
    if (existing.data && existing.data.length > 0) {
      const last = existing.data[0].membershipNo || '';
      const match = last.match(/-(\d+)$/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }

    return `${prefix}-${String(seq).padStart(6, '0')}`;
  }

  const ALLOWED_TRANSITIONS = {
    pending: ['active', 'cancelled'],
    active: ['expiring', 'suspended', 'cancelled'],
    expiring: ['active', 'expired', 'cancelled'],
    suspended: ['active', 'cancelled'],
    expired: ['active'],   // 续费可重新激活
    cancelled: [],
  };

  /* ==================== 列表 ==================== */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { status, planId, keyword, page = 1, pageSize = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(pageSize);

      const query = { clubId };

      const result = await db.collection('memberships')
        .where(query)
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(Number(pageSize))
        .get();

      let list = result.data || [];
      if (status) list = list.filter(m => m.status === status);
      if (planId) list = list.filter(m => m.planId === planId);
      if (keyword) {
        const kw = keyword.toLowerCase();
        list = list.filter(m =>
          (m.playerName || '').toLowerCase().includes(kw) ||
          (m.phoneNumber || '').includes(kw) ||
          (m.membershipNo || '').toLowerCase().includes(kw)
        );
      }

      const countRes = await db.collection('memberships').where({ clubId }).count();
      const total = countRes.total || list.length;

      res.json({ success: true, data: list, total, page: Number(page), pageSize: Number(pageSize) });
    } catch (err) {
      console.error('[Memberships] 列表查询失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 详情 ==================== */
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('memberships').doc(req.params.id).get();
      const membership = (result.data || [])[0] || result.data;
      if (!membership) return res.status(404).json({ success: false, message: '会籍不存在' });
      res.json({ success: true, data: membership });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 开卡（创建会籍） ==================== */
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { playerId, playerName, phoneNumber, planId, payment, referredBy, startDate } = req.body;

      if (!playerId || !planId) {
        return res.status(400).json({ success: false, message: '球员ID和套餐ID必填' });
      }

      // 获取套餐信息
      const planRes = await db.collection('membership_plans').doc(planId).get();
      const plan = (planRes.data || [])[0] || planRes.data;
      if (!plan) return res.status(404).json({ success: false, message: '套餐不存在' });
      if (plan.status !== 'active') return res.status(400).json({ success: false, message: '该套餐已下架' });

      const membershipNo = await generateMembershipNo(db, clubId);
      const now = new Date();
      const start = startDate ? new Date(startDate) : now;
      let end = null;
      if (plan.duration > 0) {
        end = new Date(start);
        end.setMonth(end.getMonth() + plan.duration);
      }

      const referralCode = 'REF_' + Math.random().toString(36).substr(2, 6).toUpperCase();

      const membership = {
        clubId,
        playerId,
        playerName: playerName || '',
        phoneNumber: phoneNumber || '',
        planId,
        planName: plan.name,
        planCategory: plan.category,
        membershipNo,
        status: 'active',
        startDate: start.toISOString(),
        endDate: end ? end.toISOString() : null,
        benefits: { ...plan.benefits },
        pointsRules: { ...plan.pointsRules },
        usage: {
          roundsUsed: 0,
          guestBrought: 0,
          totalConsumption: 0,
        },
        payment: {
          amount: Number(payment?.amount) || plan.price,
          method: payment?.method || 'card',
          transactionId: payment?.transactionId || '',
          paidAt: now.toISOString(),
        },
        renewalHistory: [],
        referralCode,
        referredBy: referredBy || null,
        cancelReason: '',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const result = await db.collection('memberships').add({ data: membership });

      // 更新套餐销售数
      try {
        await db.collection('membership_plans').doc(planId).update({
          data: { salesCount: (plan.salesCount || 0) + 1, updatedAt: now.toISOString() }
        });
      } catch (_) { /* ignore */ }

      // 赠送开卡积分
      if (plan.pointsRules?.welcomePoints > 0) {
        try {
          const playerRes = await db.collection('player_club_profiles').where({ clubId, playerId }).limit(1).get();
          const profile = playerRes.data?.[0];
          const currentPoints = Number(profile?.points) || 0;
          const welcomePts = Number(plan.pointsRules.welcomePoints);

          await db.collection('points_transactions').add({
            data: {
              clubId, playerId, playerName: playerName || '',
              type: 'welcome',
              amount: welcomePts,
              balanceBefore: currentPoints,
              balanceAfter: currentPoints + welcomePts,
              source: 'membership',
              sourceId: result._id,
              description: `开卡赠送积分 (${plan.name})`,
              createdAt: now.toISOString(),
            }
          });

          if (profile) {
            await db.collection('player_club_profiles').doc(profile._id).update({
              data: { points: currentPoints + welcomePts, updatedAt: now.toISOString() }
            });
          }
        } catch (e) {
          console.warn('[Memberships] 赠送积分失败:', e.message);
        }
      }

      // ── 通知：会籍激活 ──────────────────────────────────────────────────
      try {
        const ne = getNotifyEngine();
        if (ne) {
          await ne.notifyMembership(db, clubId, ne.NOTIFICATION_TYPES.MEMBERSHIP_ACTIVATED,
            { ...membership, _id: result._id }, playerId);
        }
      } catch (_ne) { /* 通知失败不影响主流程 */ }

      res.json({ success: true, data: { _id: result._id, membershipNo }, message: '开卡成功' });
    } catch (err) {
      console.error('[Memberships] 开卡失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 续费 ==================== */
  router.post('/:id/renew', async (req, res) => {
    try {
      const db = getDb();
      const { months, payment } = req.body;

      const result = await db.collection('memberships').doc(req.params.id).get();
      const membership = (result.data || [])[0] || result.data;
      if (!membership) return res.status(404).json({ success: false, message: '会籍不存在' });

      if (membership.status === 'cancelled') {
        return res.status(400).json({ success: false, message: '已取消的会籍不能续费' });
      }

      const now = new Date();
      const currentEnd = membership.endDate ? new Date(membership.endDate) : now;
      const base = currentEnd > now ? currentEnd : now;
      const newEnd = new Date(base);
      newEnd.setMonth(newEnd.getMonth() + (Number(months) || 12));

      const renewal = {
        from: membership.endDate || now.toISOString(),
        to: newEnd.toISOString(),
        paidAt: now.toISOString(),
        amount: Number(payment?.amount) || 0,
        method: payment?.method || 'card',
      };

      const renewalHistory = [...(membership.renewalHistory || []), renewal];

      // 续费时可重置用量（年费类）
      const resetUsage = ['annual', 'seasonal', 'family'].includes(membership.planCategory);
      const usageUpdate = resetUsage
        ? { roundsUsed: 0, guestBrought: 0, totalConsumption: 0 }
        : membership.usage;

      await db.collection('memberships').doc(req.params.id).update({
        data: {
          status: 'active',
          endDate: newEnd.toISOString(),
          renewalHistory,
          usage: usageUpdate,
          updatedAt: now.toISOString(),
        }
      });

      res.json({ success: true, message: '续费成功', data: { newEndDate: newEnd.toISOString() } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 暂停 ==================== */
  router.post('/:id/suspend', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('memberships').doc(req.params.id).get();
      const membership = (result.data || [])[0] || result.data;
      if (!membership) return res.status(404).json({ success: false, message: '会籍不存在' });
      if (!ALLOWED_TRANSITIONS[membership.status]?.includes('suspended')) {
        return res.status(400).json({ success: false, message: `当前状态 ${membership.status} 不能暂停` });
      }

      await db.collection('memberships').doc(req.params.id).update({
        data: {
          status: 'suspended',
          suspendedAt: new Date().toISOString(),
          suspendReason: req.body.reason || '',
          updatedAt: new Date().toISOString(),
        }
      });

      res.json({ success: true, message: '会籍已暂停' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 恢复 ==================== */
  router.post('/:id/resume', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('memberships').doc(req.params.id).get();
      const membership = (result.data || [])[0] || result.data;
      if (!membership) return res.status(404).json({ success: false, message: '会籍不存在' });
      if (membership.status !== 'suspended') {
        return res.status(400).json({ success: false, message: '仅暂停中的会籍可恢复' });
      }

      // 补偿暂停时间
      if (membership.endDate && membership.suspendedAt) {
        const suspendDays = Math.ceil(
          (Date.now() - new Date(membership.suspendedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        const newEnd = new Date(membership.endDate);
        newEnd.setDate(newEnd.getDate() + suspendDays);

        await db.collection('memberships').doc(req.params.id).update({
          data: {
            status: 'active',
            endDate: newEnd.toISOString(),
            updatedAt: new Date().toISOString(),
          }
        });
      } else {
        await db.collection('memberships').doc(req.params.id).update({
          data: { status: 'active', updatedAt: new Date().toISOString() }
        });
      }

      res.json({ success: true, message: '会籍已恢复' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 取消 ==================== */
  router.post('/:id/cancel', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('memberships').doc(req.params.id).get();
      const membership = (result.data || [])[0] || result.data;
      if (!membership) return res.status(404).json({ success: false, message: '会籍不存在' });
      if (membership.status === 'cancelled') {
        return res.status(400).json({ success: false, message: '会籍已取消' });
      }

      await db.collection('memberships').doc(req.params.id).update({
        data: {
          status: 'cancelled',
          cancelReason: req.body.reason || '',
          cancelledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      });

      res.json({ success: true, message: '会籍已取消' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 到期检查（定时任务 / 手动触发） ==================== */
  router.post('/check-expiry', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const now = new Date();
      const in30Days = new Date(now);
      in30Days.setDate(in30Days.getDate() + 30);

      const result = await db.collection('memberships')
        .where({ clubId })
        .limit(1000)
        .get();

      const memberships = result.data || [];
      let expiredCount = 0;
      let expiringCount = 0;

      for (const m of memberships) {
        if (!m.endDate || m.status === 'cancelled') continue;

        const end = new Date(m.endDate);

        if (m.status === 'active' && end <= now) {
          // 已过期
          await db.collection('memberships').doc(m._id).update({
            data: { status: 'expired', updatedAt: now.toISOString() }
          });
          expiredCount++;
          // 通知：已过期
          try {
            const ne = getNotifyEngine();
            if (ne) await ne.notifyMembership(db, clubId, ne.NOTIFICATION_TYPES.MEMBERSHIP_EXPIRED, m, m.playerId);
          } catch (_) {}
        } else if (m.status === 'active' && end <= in30Days) {
          // 即将过期
          await db.collection('memberships').doc(m._id).update({
            data: { status: 'expiring', updatedAt: now.toISOString() }
          });
          expiringCount++;
          // 通知：即将过期
          try {
            const ne = getNotifyEngine();
            if (ne) await ne.notifyMembership(db, clubId, ne.NOTIFICATION_TYPES.MEMBERSHIP_EXPIRING, m, m.playerId);
          } catch (_) {}
        }
      }

      // 次卡检查：免费轮次用完
      const roundsCards = memberships.filter(m =>
        m.planCategory === 'rounds' && m.status === 'active' && m.benefits?.freeRounds > 0
      );
      for (const m of roundsCards) {
        if ((m.usage?.roundsUsed || 0) >= m.benefits.freeRounds) {
          await db.collection('memberships').doc(m._id).update({
            data: { status: 'expired', updatedAt: now.toISOString() }
          });
          expiredCount++;
        }
      }

      res.json({ success: true, data: { expiredCount, expiringCount }, message: '到期检查完成' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 按球员查询有效会籍 ==================== */
  router.get('/player/:playerId', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);

      const result = await db.collection('memberships')
        .where({ clubId, playerId: req.params.playerId })
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      const memberships = result.data || [];
      const active = memberships.find(m => ['active', 'expiring'].includes(m.status));

      res.json({ success: true, data: { all: memberships, active: active || null } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 会籍统计 ==================== */
  router.get('/stats/overview', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);

      const result = await db.collection('memberships').where({ clubId }).limit(1000).get();
      const memberships = result.data || [];

      const byStatus = {};
      memberships.forEach(m => {
        byStatus[m.status] = (byStatus[m.status] || 0) + 1;
      });

      const active = memberships.filter(m => m.status === 'active');
      const expiring = memberships.filter(m => m.status === 'expiring');
      const totalRevenue = memberships.reduce((s, m) => s + (Number(m.payment?.amount) || 0), 0);
      const renewalRevenue = memberships.reduce(
        (s, m) => s + (m.renewalHistory || []).reduce((rs, r) => rs + (Number(r.amount) || 0), 0), 0
      );

      res.json({
        success: true,
        data: {
          total: memberships.length,
          active: active.length,
          expiring: expiring.length,
          byStatus,
          totalRevenue,
          renewalRevenue,
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
