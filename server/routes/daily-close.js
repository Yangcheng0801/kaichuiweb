/**
 * 日结/夜审路由
 * 支持交班操作、夜审检查、自动 No-Show、日结报表生成、历史查询
 */
const express = require('express');

module.exports = function (getDb) {
  const router = express.Router();
  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || req.clubId || DEFAULT_CLUB_ID;
  }

  function fmt(n) { return Math.round((n || 0) * 100) / 100; }

  /* ==================== 1. 夜审预检（不执行，只返回待处理项） ==================== */
  router.get('/preview', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { date } = req.query;
      const targetDate = date || new Date().toISOString().slice(0, 10);

      // 1) 未结算 Folio
      const foliosRes = await db.collection('folios')
        .where({ clubId, status: 'open' })
        .limit(500)
        .get();
      const openFolios = foliosRes.data || [];
      const openFolioCount = openFolios.length;
      const openFolioBalance = openFolios.reduce((s, f) => s + (Number(f.balance) || 0), 0);

      // 2) 当日确认未签到的预订（可标记 No-Show）
      const bookingsRes = await db.collection('bookings')
        .where({ clubId })
        .limit(1000)
        .get();
      const noShowCandidates = (bookingsRes.data || []).filter(b =>
        b.date === targetDate && b.status === 'confirmed'
      );

      // 3) 当日已完成但未结算的预订
      const unsettledCompleted = (bookingsRes.data || []).filter(b =>
        b.date === targetDate && b.status === 'completed' && (b.pricing?.pendingFee > 0)
      );

      // 4) 当日收款汇总
      const paymentsRes = await db.collection('folio_payments')
        .where({ clubId })
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();
      const todayPayments = (paymentsRes.data || []).filter(p =>
        (p.createdAt || '').toString().slice(0, 10) === targetDate
      );

      const paymentSummary = {};
      let totalCollected = 0;
      todayPayments.forEach(p => {
        const method = p.method || p.payMethod || 'other';
        const amount = Number(p.amount) || 0;
        paymentSummary[method] = (paymentSummary[method] || 0) + amount;
        totalCollected += amount;
      });

      // 5) 当日预订统计
      const todayBookings = (bookingsRes.data || []).filter(b => b.date === targetDate);
      const bookingStats = {
        total: todayBookings.length,
        confirmed: todayBookings.filter(b => b.status === 'confirmed').length,
        checkedIn: todayBookings.filter(b => b.status === 'checked_in').length,
        playing: todayBookings.filter(b => b.status === 'playing').length,
        completed: todayBookings.filter(b => b.status === 'completed').length,
        cancelled: todayBookings.filter(b => b.status === 'cancelled').length,
        noShow: todayBookings.filter(b => b.status === 'no_show').length,
      };

      // 6) 当日消费汇总
      const chargesRes = await db.collection('folio_charges')
        .where({ clubId })
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();
      const todayCharges = (chargesRes.data || []).filter(c =>
        c.status !== 'voided' && (c.createdAt || '').toString().slice(0, 10) === targetDate
      );
      const chargeSummary = {};
      let totalCharged = 0;
      todayCharges.forEach(c => {
        const cat = c.category || 'other';
        const amount = Number(c.amount) || 0;
        chargeSummary[cat] = (chargeSummary[cat] || 0) + amount;
        totalCharged += amount;
      });

      res.json({
        success: true,
        data: {
          date: targetDate,
          openFolios: { count: openFolioCount, balance: fmt(openFolioBalance) },
          noShowCandidates: noShowCandidates.map(b => ({
            _id: b._id, orderNo: b.orderNo, teeTime: b.teeTime,
            playerName: b.playerName || (b.players?.[0]?.name) || '',
            playerCount: b.playerCount || 0
          })),
          unsettledCompleted: unsettledCompleted.map(b => ({
            _id: b._id, orderNo: b.orderNo, pendingFee: b.pricing?.pendingFee || 0,
            playerName: b.playerName || (b.players?.[0]?.name) || ''
          })),
          paymentSummary,
          totalCollected: fmt(totalCollected),
          chargeSummary,
          totalCharged: fmt(totalCharged),
          bookingStats,
          transactionCount: todayPayments.length
        }
      });
    } catch (err) {
      console.error('[DailyClose] 预检失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 2. 执行自动 No-Show ==================== */
  router.post('/auto-noshow', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { date, operatorId, operatorName } = req.body;
      const targetDate = date || new Date().toISOString().slice(0, 10);

      const bookingsRes = await db.collection('bookings')
        .where({ clubId })
        .limit(1000)
        .get();

      const candidates = (bookingsRes.data || []).filter(b =>
        b.date === targetDate && b.status === 'confirmed'
      );

      let count = 0;
      const now = new Date().toISOString();
      for (const b of candidates) {
        try {
          await db.collection('bookings').doc(b._id).update({
            data: {
              status: 'no_show',
              updatedAt: now,
              statusHistory: [...(b.statusHistory || []), {
                from: 'confirmed',
                to: 'no_show',
                at: now,
                by: operatorName || 'system',
                reason: '日结自动标记 No-Show'
              }]
            }
          });
          count++;
        } catch (e) {
          console.warn('[DailyClose] No-Show 标记失败:', b._id, e.message);
        }
      }

      // 记录审计日志
      if (count > 0) {
        await db.collection('audit_logs').add({
          data: {
            clubId,
            module: 'daily_close',
            action: 'auto_noshow',
            description: `日结自动标记 ${count} 笔 No-Show（${targetDate}）`,
            details: { date: targetDate, count },
            operatorId: operatorId || null,
            operatorName: operatorName || 'system',
            createdAt: now
          }
        });
      }

      res.json({ success: true, message: `成功标记 ${count} 笔 No-Show`, data: { count } });
    } catch (err) {
      console.error('[DailyClose] Auto No-Show 失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 3. 执行日结（生成日结报告） ==================== */
  router.post('/execute', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { date, operatorId, operatorName, notes, cashDeclared } = req.body;
      const targetDate = date || new Date().toISOString().slice(0, 10);

      // 检查是否已有日结报告
      const existingRes = await db.collection('daily_close_reports')
        .where({ clubId, date: targetDate })
        .limit(1)
        .get();
      if (existingRes.data && existingRes.data.length > 0) {
        return res.status(400).json({ success: false, message: `${targetDate} 已完成日结` });
      }

      // 收集日结数据（同 preview 逻辑）
      const bookingsRes = await db.collection('bookings').where({ clubId }).limit(1000).get();
      const todayBookings = (bookingsRes.data || []).filter(b => b.date === targetDate);

      const paymentsRes = await db.collection('folio_payments')
        .where({ clubId }).orderBy('createdAt', 'desc').limit(1000).get();
      const todayPayments = (paymentsRes.data || []).filter(p =>
        (p.createdAt || '').toString().slice(0, 10) === targetDate
      );

      const paymentSummary = {};
      let totalCollected = 0;
      todayPayments.forEach(p => {
        const method = p.method || p.payMethod || 'other';
        const amount = Number(p.amount) || 0;
        paymentSummary[method] = (paymentSummary[method] || 0) + amount;
        totalCollected += amount;
      });

      const chargesRes = await db.collection('folio_charges')
        .where({ clubId }).orderBy('createdAt', 'desc').limit(1000).get();
      const todayCharges = (chargesRes.data || []).filter(c =>
        c.status !== 'voided' && (c.createdAt || '').toString().slice(0, 10) === targetDate
      );
      const chargeSummary = {};
      let totalCharged = 0;
      todayCharges.forEach(c => {
        const cat = c.category || 'other';
        const amount = Number(c.amount) || 0;
        chargeSummary[cat] = (chargeSummary[cat] || 0) + amount;
        totalCharged += amount;
      });

      const foliosRes = await db.collection('folios').where({ clubId, status: 'open' }).limit(500).get();
      const openFolios = foliosRes.data || [];

      const bookingStats = {
        total: todayBookings.length,
        completed: todayBookings.filter(b => b.status === 'completed').length,
        cancelled: todayBookings.filter(b => b.status === 'cancelled').length,
        noShow: todayBookings.filter(b => b.status === 'no_show').length,
        totalPlayers: todayBookings.reduce((s, b) => s + (b.playerCount || 0), 0),
      };

      // 现金差异
      const cashCollected = paymentSummary['cash'] || 0;
      const cashDiff = cashDeclared !== undefined ? fmt(Number(cashDeclared) - cashCollected) : null;

      const now = new Date().toISOString();
      const report = {
        clubId,
        date: targetDate,
        status: 'closed',
        bookingStats,
        paymentSummary,
        totalCollected: fmt(totalCollected),
        chargeSummary,
        totalCharged: fmt(totalCharged),
        openFolios: { count: openFolios.length, balance: fmt(openFolios.reduce((s, f) => s + (Number(f.balance) || 0), 0)) },
        cashDeclared: cashDeclared !== undefined ? Number(cashDeclared) : null,
        cashDiff,
        transactionCount: todayPayments.length,
        chargeCount: todayCharges.length,
        notes: notes || '',
        operatorId: operatorId || null,
        operatorName: operatorName || '',
        closedAt: now,
        createdAt: now
      };

      const result = await db.collection('daily_close_reports').add({ data: report });

      // 记录审计日志
      await db.collection('audit_logs').add({
        data: {
          clubId,
          module: 'daily_close',
          action: 'execute',
          description: `完成 ${targetDate} 日结，营收 ¥${fmt(totalCollected)}`,
          details: { date: targetDate, totalCollected: fmt(totalCollected) },
          operatorId: operatorId || null,
          operatorName: operatorName || '',
          createdAt: now
        }
      });

      res.json({ success: true, message: `${targetDate} 日结完成`, data: { _id: result._id, ...report } });
    } catch (err) {
      console.error('[DailyClose] 执行日结失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 4. 查询日结报告 ==================== */
  router.get('/reports', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { date, startDate, endDate, page = 1, pageSize = 30 } = req.query;

      const reportsRes = await db.collection('daily_close_reports')
        .where({ clubId })
        .orderBy('date', 'desc')
        .limit(500)
        .get();

      let reports = reportsRes.data || [];

      // 按日期过滤
      if (date) {
        reports = reports.filter(r => r.date === date);
      } else if (startDate || endDate) {
        if (startDate) reports = reports.filter(r => r.date >= startDate);
        if (endDate) reports = reports.filter(r => r.date <= endDate);
      }

      const total = reports.length;
      const p = Math.max(1, Number(page));
      const ps = Math.min(100, Math.max(1, Number(pageSize)));
      const paged = reports.slice((p - 1) * ps, p * ps);

      res.json({
        success: true,
        data: {
          list: paged,
          total,
          page: p,
          pageSize: ps
        }
      });
    } catch (err) {
      console.error('[DailyClose] 查询日结报告失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 5. 查询单日报告详情 ==================== */
  router.get('/reports/:date', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { date } = req.params;

      const reportsRes = await db.collection('daily_close_reports')
        .where({ clubId, date })
        .limit(1)
        .get();

      if (!reportsRes.data || reportsRes.data.length === 0) {
        return res.status(404).json({ success: false, message: `${date} 未找到日结报告` });
      }

      res.json({ success: true, data: reportsRes.data[0] });
    } catch (err) {
      console.error('[DailyClose] 查询报告详情失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
