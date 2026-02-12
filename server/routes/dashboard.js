/**
 * 首页仪表盘 API
 * GET /api/dashboard  —— 聚合今日预订/营收/资源使用/近期动态
 */
const express = require('express');

module.exports = function (getDb) {
  const router = express.Router();

  /* ---------- 辅助 ---------- */
  function todayRange() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    return { dateStr, startOfDay: `${dateStr}T00:00:00`, endOfDay: `${dateStr}T23:59:59` };
  }

  async function safeCount(collection, where) {
    try {
      const res = await collection.where(where).count();
      return res.total || 0;
    } catch { return 0; }
  }

  async function safeGet(collection, where, limit = 1000) {
    try {
      const res = await collection.where(where).limit(limit).get();
      return res.data || [];
    } catch { return []; }
  }

  /* ---------- GET /api/dashboard ---------- */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';
      const { dateStr } = todayRange();

      // -------- 并行拉取各项统计 --------
      const [
        todayBookings,
        recentBookings,
        lockerStats,
        roomStats,
        caddieAll,
      ] = await Promise.all([
        // 1) 今日所有预订
        safeGet(db.collection('bookings'), { clubId, date: dateStr }),

        // 2) 最近 8 条预订（不限日期）
        (async () => {
          try {
            const r = await db.collection('bookings')
              .where({ clubId })
              .orderBy('createdAt', 'desc')
              .limit(8)
              .get();
            return r.data || [];
          } catch { return []; }
        })(),

        // 3) 更衣柜按状态统计
        (async () => {
          try {
            const all = await safeGet(db.collection('lockers'), { clubId });
            const stats = { total: all.length, available: 0, occupied: 0, maintenance: 0 };
            all.forEach(l => { if (stats[l.status] !== undefined) stats[l.status]++; });
            return stats;
          } catch { return { total: 0, available: 0, occupied: 0, maintenance: 0 }; }
        })(),

        // 4) 客房按状态统计
        (async () => {
          try {
            const all = await safeGet(db.collection('rooms'), { clubId });
            const stats = { total: all.length, available: 0, occupied: 0, cleaning: 0, maintenance: 0 };
            all.forEach(r => { if (stats[r.status] !== undefined) stats[r.status]++; });
            return stats;
          } catch { return { total: 0, available: 0, occupied: 0, cleaning: 0, maintenance: 0 }; }
        })(),

        // 5) 球童可用/忙碌
        (async () => {
          try {
            const all = await safeGet(db.collection('caddies'), { clubId });
            const stats = { total: all.length, available: 0, busy: 0, off: 0 };
            all.forEach(c => {
              if (c.status === 'available') stats.available++;
              else if (c.status === 'busy' || c.status === 'assigned') stats.busy++;
              else stats.off++;
            });
            return stats;
          } catch { return { total: 0, available: 0, busy: 0, off: 0 }; }
        })(),
      ]);

      // -------- 球车统计（复用现有 carts 集合） --------
      let cartStats = { total: 0, available: 0, inUse: 0, maintenance: 0 };
      try {
        const allCarts = await safeGet(db.collection('carts'), { clubId });
        cartStats.total = allCarts.length;
        allCarts.forEach(c => {
          if (c.status === 'available' || c.status === '未出库') cartStats.available++;
          else if (c.status === 'in_use' || c.status === '使用中' || c.status === '已出库') cartStats.inUse++;
          else if (c.status === 'maintenance' || c.status === '维修中') cartStats.maintenance++;
        });
      } catch {}

      // -------- 从今日预订中聚合 --------
      let todayTotal = todayBookings.length;
      let todayCheckedIn = 0;
      let todayCompleted = 0;
      let todayPending = 0;
      let todayRevenue = 0;
      let todayPaid = 0;

      todayBookings.forEach(b => {
        if (b.status === 'checked_in' || b.status === 'playing') todayCheckedIn++;
        if (b.status === 'completed') todayCompleted++;
        if (b.status === 'pending' || b.status === 'confirmed') todayPending++;
        if (b.pricing) {
          todayRevenue += (b.pricing.totalFee || 0);
          todayPaid += (b.pricing.paidFee || 0);
        }
      });

      // -------- 临时消费卡统计 --------
      let tempCardStats = { total: 0, available: 0, inUse: 0 };
      try {
        const allCards = await safeGet(db.collection('temp_consume_cards'), { clubId });
        tempCardStats.total = allCards.length;
        allCards.forEach(c => {
          if (c.status === 'available') tempCardStats.available++;
          else if (c.status === 'in_use') tempCardStats.inUse++;
        });
      } catch {}

      // -------- 组装返回 --------
      res.json({
        success: true,
        data: {
          // KPI 卡片
          kpi: {
            todayBookings: todayTotal,
            todayCheckedIn,
            todayCompleted,
            todayPending,
            todayRevenue:  Math.round(todayRevenue * 100) / 100,
            todayPaid:     Math.round(todayPaid * 100) / 100,
            todayPendingFee: Math.round((todayRevenue - todayPaid) * 100) / 100,
          },

          // 资源概况
          resources: {
            carts:    cartStats,
            lockers:  lockerStats,
            rooms:    roomStats,
            caddies:  caddieAll,
            tempCards: tempCardStats,
          },

          // 近期预订动态
          recentBookings: recentBookings.map(b => ({
            _id:        b._id,
            orderNo:    b.orderNo,
            date:       b.date,
            teeTime:    b.teeTime,
            playerName: b.playerName,
            playerCount:b.playerCount || b.players?.length || 1,
            courseName: b.courseName,
            status:     b.status,
            totalFee:   b.pricing?.totalFee || 0,
            createdAt:  b.createdAt,
          })),
        }
      });
    } catch (err) {
      console.error('[Dashboard] 获取仪表盘数据失败:', err);
      res.status(500).json({ success: false, message: '获取仪表盘数据失败' });
    }
  });

  return router;
};
