/**
 * 报表与数据分析路由
 * 提供营收报表、预订分析、球员分析、资源利用率等多维度报表
 */
const express = require('express');

module.exports = function (getDb) {
  const router = express.Router();
  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

  /* ==================== 辅助函数 ==================== */

  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || req.clubId || DEFAULT_CLUB_ID;
  }

  /** 根据 period 和 date 获取起止日期 */
  function getDateRange(period, dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    let start, end;
    switch (period) {
      case 'day':
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        break;
      case 'week': {
        const day = d.getDay() || 7;
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 1);
        end = new Date(start.getTime() + 7 * 86400000);
        break;
      }
      case 'month':
        start = new Date(d.getFullYear(), d.getMonth(), 1);
        end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        break;
      case 'year':
        start = new Date(d.getFullYear(), 0, 1);
        end = new Date(d.getFullYear() + 1, 0, 1);
        break;
      default: // custom - 需要额外传 startDate/endDate
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return {
      startStr: start.toISOString().slice(0, 10),
      endStr: end.toISOString().slice(0, 10),
      start,
      end
    };
  }

  function fmt(n) { return Math.round((n || 0) * 100) / 100; }

  /* ==================== 1. 营收报表 ==================== */
  router.get('/revenue', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { period = 'day', date, startDate, endDate } = req.query;

      let range;
      if (period === 'custom' && startDate && endDate) {
        range = { startStr: startDate, endStr: endDate, start: new Date(startDate), end: new Date(endDate) };
      } else {
        range = getDateRange(period, date);
      }

      // 查询 Folio 支付记录
      const paymentsRes = await db.collection('folio_payments')
        .where({ clubId })
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();

      const payments = (paymentsRes.data || []).filter(p => {
        const d = (p.createdAt || '').toString().slice(0, 10);
        return d >= range.startStr && d < range.endStr;
      });

      // 按收款方式汇总
      const byMethod = {};
      let totalRevenue = 0;
      payments.forEach(p => {
        const method = p.method || p.payMethod || 'other';
        const amount = Number(p.amount) || 0;
        byMethod[method] = (byMethod[method] || 0) + amount;
        totalRevenue += amount;
      });

      // 查询 Folio charges 分类汇总
      const chargesRes = await db.collection('folio_charges')
        .where({ clubId })
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();

      const charges = (chargesRes.data || []).filter(c => {
        if (c.status === 'voided') return false;
        const d = (c.createdAt || '').toString().slice(0, 10);
        return d >= range.startStr && d < range.endStr;
      });

      const byCategory = {};
      charges.forEach(c => {
        const cat = c.category || 'other';
        const amount = Number(c.amount) || 0;
        byCategory[cat] = (byCategory[cat] || 0) + amount;
      });

      // 按日期汇总趋势（最多30天）
      const dailyMap = {};
      payments.forEach(p => {
        const d = (p.createdAt || '').toString().slice(0, 10);
        dailyMap[d] = (dailyMap[d] || 0) + (Number(p.amount) || 0);
      });
      const dailyTrend = Object.keys(dailyMap).sort().map(d => ({ date: d, revenue: fmt(dailyMap[d]) }));

      res.json({
        success: true,
        data: {
          period,
          dateRange: { start: range.startStr, end: range.endStr },
          totalRevenue: fmt(totalRevenue),
          byMethod,
          byCategory,
          dailyTrend,
          transactionCount: payments.length
        }
      });
    } catch (err) {
      console.error('[Reports] 营收报表错误:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 2. 预订分析 ==================== */
  router.get('/bookings', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { period = 'month', date, startDate, endDate } = req.query;

      let range;
      if (period === 'custom' && startDate && endDate) {
        range = { startStr: startDate, endStr: endDate };
      } else {
        range = getDateRange(period, date);
      }

      const bookingsRes = await db.collection('bookings')
        .where({ clubId })
        .orderBy('date', 'desc')
        .limit(1000)
        .get();

      const bookings = (bookingsRes.data || []).filter(b => {
        const d = b.date || '';
        return d >= range.startStr && d < range.endStr;
      });

      const total = bookings.length;

      // 状态分布
      const byStatus = {};
      bookings.forEach(b => {
        byStatus[b.status] = (byStatus[b.status] || 0) + 1;
      });

      // 取消率 / No-show率
      const cancelCount = byStatus['cancelled'] || 0;
      const noShowCount = byStatus['no_show'] || 0;
      const cancelRate = total > 0 ? fmt(cancelCount / total * 100) : 0;
      const noShowRate = total > 0 ? fmt(noShowCount / total * 100) : 0;

      // 利用率 - 按时段×日期类型
      const heatmap = {};
      bookings.forEach(b => {
        const slot = b.timeSlot || 'unknown';
        const dtype = b.dayType || 'unknown';
        const key = `${dtype}_${slot}`;
        heatmap[key] = (heatmap[key] || 0) + 1;
      });

      // 每日趋势
      const dailyMap = {};
      bookings.forEach(b => {
        const d = b.date || '';
        dailyMap[d] = (dailyMap[d] || 0) + 1;
      });
      const dailyTrend = Object.keys(dailyMap).sort().map(d => ({ date: d, count: dailyMap[d] }));

      // 身份分布（从 players 字段提取）
      const identityDist = {};
      bookings.forEach(b => {
        (b.players || []).forEach(p => {
          const id = p.identityCode || p.memberType || 'walkin';
          identityDist[id] = (identityDist[id] || 0) + 1;
        });
      });

      // 球场分布
      const courseDist = {};
      bookings.forEach(b => {
        const c = b.courseName || b.courseId || 'unknown';
        courseDist[c] = (courseDist[c] || 0) + 1;
      });

      // 总球员人数
      const totalPlayers = bookings.reduce((s, b) => s + (b.playerCount || (b.players || []).length || 0), 0);

      // 平均每组人数
      const avgGroupSize = total > 0 ? fmt(totalPlayers / total) : 0;

      res.json({
        success: true,
        data: {
          period,
          dateRange: { start: range.startStr, end: range.endStr },
          totalBookings: total,
          totalPlayers,
          avgGroupSize,
          byStatus,
          cancelRate,
          noShowRate,
          heatmap,
          dailyTrend,
          identityDist,
          courseDist
        }
      });
    } catch (err) {
      console.error('[Reports] 预订分析错误:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 3. 球员分析 ==================== */
  router.get('/players', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);

      // 获取球场档案
      const profilesRes = await db.collection('player_club_profiles')
        .where({ clubId })
        .limit(1000)
        .get();
      const profiles = profilesRes.data || [];

      const totalPlayers = profiles.length;
      const activeProfiles = profiles.filter(p => p.status !== 'inactive');

      // 会员等级分布
      const levelDist = {};
      profiles.forEach(p => {
        const level = p.memberLevel || 'none';
        levelDist[level] = (levelDist[level] || 0) + 1;
      });

      // 消费排行榜（从 folio_charges 汇总）
      const chargesRes = await db.collection('folio_charges')
        .where({ clubId })
        .limit(1000)
        .get();
      const charges = (chargesRes.data || []).filter(c => c.status !== 'voided');

      const playerSpending = {};
      charges.forEach(c => {
        const pid = c.playerId || 'unknown';
        if (!playerSpending[pid]) playerSpending[pid] = { total: 0, count: 0, name: c.playerName || '' };
        playerSpending[pid].total += Number(c.amount) || 0;
        playerSpending[pid].count += 1;
      });

      const topSpenders = Object.entries(playerSpending)
        .map(([id, v]) => ({ playerId: id, playerName: v.name, totalSpent: fmt(v.total), visitCount: v.count }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 20);

      // 新增球员趋势（按月）
      const monthlyNew = {};
      profiles.forEach(p => {
        const m = (p.createdAt || '').toString().slice(0, 7);
        if (m) monthlyNew[m] = (monthlyNew[m] || 0) + 1;
      });
      const newTrend = Object.keys(monthlyNew).sort().map(m => ({ month: m, count: monthlyNew[m] }));

      // 余额统计
      const totalBalance = profiles.reduce((s, p) => s + (Number(p.account?.balance) || 0), 0);
      const avgBalance = totalPlayers > 0 ? fmt(totalBalance / totalPlayers) : 0;

      res.json({
        success: true,
        data: {
          totalPlayers,
          activePlayers: activeProfiles.length,
          levelDist,
          topSpenders,
          newTrend,
          totalBalance: fmt(totalBalance),
          avgBalance,
          avgSpendPerVisit: topSpenders.length > 0
            ? fmt(topSpenders.reduce((s, t) => s + t.totalSpent, 0) / topSpenders.reduce((s, t) => s + t.visitCount, 0))
            : 0
        }
      });
    } catch (err) {
      console.error('[Reports] 球员分析错误:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 4. 资源利用率 ==================== */
  router.get('/resources', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { date } = req.query;
      const today = date || new Date().toISOString().slice(0, 10);

      // 球车统计
      const cartsRes = await db.collection('carts').where({ clubId }).limit(500).get();
      const carts = cartsRes.data || [];
      const cartTotal = carts.length;
      const cartAvailable = carts.filter(c => c.status === 'available').length;
      const cartInUse = carts.filter(c => ['dispatched', 'in_use'].includes(c.status)).length;
      const cartMaint = carts.filter(c => c.status === 'maintenance').length;
      const cartUtilization = cartTotal > 0 ? fmt(cartInUse / cartTotal * 100) : 0;

      // 球车使用记录
      const usageRes = await db.collection('cart_usage_records')
        .where({ clubId })
        .orderBy('startTime', 'desc')
        .limit(500)
        .get();
      const usageToday = (usageRes.data || []).filter(u => (u.startTime || '').toString().slice(0, 10) === today);
      const cartTurnover = cartTotal > 0 ? fmt(usageToday.length / cartTotal) : 0;

      // 球童统计
      const caddiesRes = await db.collection('caddies').where({ clubId }).limit(500).get();
      const caddies = caddiesRes.data || [];
      const caddyTotal = caddies.length;
      const caddyAvail = caddies.filter(c => c.status === 'available').length;
      const caddyBusy = caddies.filter(c => c.status === 'busy').length;

      // 更衣柜统计
      const lockersRes = await db.collection('lockers').where({ clubId }).limit(500).get();
      const lockers = lockersRes.data || [];
      const lockerTotal = lockers.length;
      const lockerOccupied = lockers.filter(l => l.status === 'occupied').length;
      const lockerUtilization = lockerTotal > 0 ? fmt(lockerOccupied / lockerTotal * 100) : 0;

      // 客房统计
      const roomsRes = await db.collection('rooms').where({ clubId }).limit(500).get();
      const rooms = roomsRes.data || [];
      const roomTotal = rooms.length;
      const roomOccupied = rooms.filter(r => r.status === 'occupied').length;
      const roomOcc = roomTotal > 0 ? fmt(roomOccupied / roomTotal * 100) : 0;

      res.json({
        success: true,
        data: {
          date: today,
          carts: {
            total: cartTotal,
            available: cartAvailable,
            inUse: cartInUse,
            maintenance: cartMaint,
            utilization: cartUtilization,
            todayUsage: usageToday.length,
            turnover: cartTurnover
          },
          caddies: {
            total: caddyTotal,
            available: caddyAvail,
            busy: caddyBusy,
            utilization: caddyTotal > 0 ? fmt(caddyBusy / caddyTotal * 100) : 0
          },
          lockers: {
            total: lockerTotal,
            occupied: lockerOccupied,
            utilization: lockerUtilization
          },
          rooms: {
            total: roomTotal,
            occupied: roomOccupied,
            occupancyRate: roomOcc
          }
        }
      });
    } catch (err) {
      console.error('[Reports] 资源利用率错误:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 5. 导出 CSV ==================== */
  router.get('/export', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { type = 'revenue', period = 'month', date } = req.query;

      let csvContent = '';
      let filename = '';

      if (type === 'revenue') {
        // 简化导出：查询 folio_payments
        const range = getDateRange(period, date);
        const paymentsRes = await db.collection('folio_payments')
          .where({ clubId })
          .orderBy('createdAt', 'desc')
          .limit(1000)
          .get();
        const payments = (paymentsRes.data || []).filter(p => {
          const d = (p.createdAt || '').toString().slice(0, 10);
          return d >= range.startStr && d < range.endStr;
        });

        csvContent = '日期,金额,收款方式,备注\n';
        payments.forEach(p => {
          csvContent += `${(p.createdAt || '').toString().slice(0, 10)},${p.amount || 0},${p.method || p.payMethod || ''},${(p.note || '').replace(/,/g, '，')}\n`;
        });
        filename = `revenue_${range.startStr}_${range.endStr}.csv`;
      } else if (type === 'bookings') {
        const range = getDateRange(period, date);
        const bookingsRes = await db.collection('bookings')
          .where({ clubId })
          .orderBy('date', 'desc')
          .limit(1000)
          .get();
        const bookings = (bookingsRes.data || []).filter(b => {
          const d = b.date || '';
          return d >= range.startStr && d < range.endStr;
        });

        csvContent = '订单号,日期,开球时间,球场,球员数,状态,总费用\n';
        bookings.forEach(b => {
          csvContent += `${b.orderNo || ''},${b.date || ''},${b.teeTime || ''},${b.courseName || ''},${b.playerCount || 0},${b.status || ''},${b.pricing?.totalFee || 0}\n`;
        });
        filename = `bookings_${range.startStr}_${range.endStr}.csv`;
      }

      // 添加 BOM 头以支持 Excel 中文显示
      const bom = '\uFEFF';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(bom + csvContent);
    } catch (err) {
      console.error('[Reports] 导出错误:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
