/**
 * 统一消费 / 挂账中心 (Folio)
 *
 * 集合：folios / folio_charges / folio_payments
 *
 * 核心流程：签到开户 → 场内各消费点挂账 → 离场统一结算
 */
const express = require('express');

module.exports = function (getDb) {
  const router = express.Router();

  /* ========== 辅助 ========== */

  /** 生成账单号 F + 日期8位 + 3位序号 */
  async function generateFolioNo(db, clubId) {
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = `F${dateStr}`;
    try {
      const cnt = await db.collection('folios')
        .where({ clubId, folioNo: db.RegExp({ regexp: `^${prefix}`, options: '' }) })
        .count();
      const seq = String((cnt.total || 0) + 1).padStart(3, '0');
      return `${prefix}${seq}`;
    } catch {
      return `${prefix}${String(Date.now()).slice(-5)}`;
    }
  }

  /** 生成支付流水号 */
  function generatePayRefNo() {
    const d = new Date();
    const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    return `PAY${ts}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  }

  /** 重新计算 folio 汇总金额 */
  async function recalcFolio(db, folioId) {
    const charges = await db.collection('folio_charges').where({ folioId, status: 'posted' }).get();
    const payments = await db.collection('folio_payments').where({ folioId, status: 'success' }).get();
    const totalCharges = (charges.data || []).reduce((s, c) => s + (c.amount || 0), 0);
    const totalPayments = (payments.data || []).reduce((s, p) => s + (p.amount || 0), 0);
    const balance = Math.round((totalCharges - totalPayments) * 100) / 100;
    await db.collection('folios').doc(folioId).update({
      totalCharges: Math.round(totalCharges * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      balance,
      updatedAt: new Date(),
    });
    return { totalCharges, totalPayments, balance };
  }

  const PAY_METHODS = {
    cash: '现金', wechat: '微信', alipay: '支付宝',
    bank_card: '银行卡', member_card: '会员卡', transfer: '转账', mixed: '组合支付',
  };

  /* ========== POST /api/folios  —— 开户 ========== */
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', folioType = 'booking',
        bookingId, playerId, cardNo, roomNo,
        guestName, guestPhone,
      } = req.body;

      const folioNo = await generateFolioNo(db, clubId);
      const now = new Date();
      const doc = {
        clubId, folioNo, folioType, status: 'open',
        bookingId: bookingId || null,
        playerId: playerId || null,
        cardNo: cardNo || null,
        roomNo: roomNo || null,
        guestName: guestName || '',
        guestPhone: guestPhone || '',
        totalCharges: 0, totalPayments: 0, balance: 0,
        settledAt: null, settledBy: null,
        openedAt: now, closedAt: null,
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('folios').add(doc);
      const id = r.id || r._id;
      res.json({ success: true, data: { _id: id, ...doc } });
    } catch (err) {
      console.error('[Folio] 开户失败:', err);
      res.status(500).json({ success: false, message: '开户失败' });
    }
  });

  /* ========== GET /api/folios/active —— 当前未结算账单 ========== */
  router.get('/active', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';
      const r = await db.collection('folios')
        .where({ clubId, status: 'open' })
        .orderBy('openedAt', 'desc')
        .limit(200)
        .get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) {
      console.error('[Folio] 查询活跃账单失败:', err);
      res.status(500).json({ success: false, message: '查询失败' });
    }
  });

  /* ========== GET /api/folios —— 账单列表 ========== */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';
      const { status, guestName, date, page = 1, pageSize = 20 } = req.query;
      const where = { clubId };
      if (status) where.status = status;
      if (guestName) where.guestName = db.RegExp({ regexp: guestName, options: 'i' });
      if (date) where.openedAt = db.command.gte(new Date(`${date}T00:00:00`));

      const total = await db.collection('folios').where(where).count();
      const list = await db.collection('folios')
        .where(where)
        .orderBy('createdAt', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get();
      res.json({ success: true, data: list.data || [], total: total.total || 0 });
    } catch (err) {
      console.error('[Folio] 列表查询失败:', err);
      res.status(500).json({ success: false, message: '查询失败' });
    }
  });

  /* ========== GET /api/folios/:id —— 账单详情（含 charges + payments） ========== */
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const folioRes = await db.collection('folios').doc(req.params.id).get();
      const folio = (folioRes.data || [])[0] || folioRes.data;
      if (!folio) return res.status(404).json({ success: false, message: '账单不存在' });

      const [chargesRes, paymentsRes] = await Promise.all([
        db.collection('folio_charges').where({ folioId: req.params.id }).orderBy('chargeTime', 'asc').limit(500).get(),
        db.collection('folio_payments').where({ folioId: req.params.id }).orderBy('paidAt', 'asc').limit(200).get(),
      ]);
      res.json({
        success: true,
        data: {
          ...folio,
          charges: chargesRes.data || [],
          payments: paymentsRes.data || [],
        },
      });
    } catch (err) {
      console.error('[Folio] 详情查询失败:', err);
      res.status(500).json({ success: false, message: '查询失败' });
    }
  });

  /* ========== GET /api/folios/:id/charges —— 消费明细 ========== */
  router.get('/:id/charges', async (req, res) => {
    try {
      const db = getDb();
      const r = await db.collection('folio_charges')
        .where({ folioId: req.params.id })
        .orderBy('chargeTime', 'asc')
        .limit(500)
        .get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, message: '查询失败' });
    }
  });

  /* ========== POST /api/folios/:id/charges —— 挂账 ========== */
  router.post('/:id/charges', async (req, res) => {
    try {
      const db = getDb();
      const folioId = req.params.id;

      // 校验 folio 存在且 open
      const folioRes = await db.collection('folios').doc(folioId).get();
      const folio = (folioRes.data || [])[0] || folioRes.data;
      if (!folio) return res.status(404).json({ success: false, message: '账单不存在' });
      if (folio.status !== 'open') return res.status(400).json({ success: false, message: '账单已结算，无法挂账' });

      const {
        chargeType, chargeSource, sourceId,
        description, amount, quantity = 1, unitPrice,
        operatorId, operatorName, clubId,
      } = req.body;

      if (!chargeType || amount === undefined) {
        return res.status(400).json({ success: false, message: 'chargeType 和 amount 必填' });
      }

      const now = new Date();
      const doc = {
        clubId: clubId || folio.clubId,
        folioId,
        chargeType, chargeSource: chargeSource || '',
        sourceId: sourceId || null,
        description: description || '',
        amount: Number(amount),
        quantity: Number(quantity),
        unitPrice: unitPrice !== undefined ? Number(unitPrice) : Number(amount),
        operatorId: operatorId || null,
        operatorName: operatorName || '',
        chargeTime: now,
        status: 'posted',
        voidReason: null,
        createdAt: now,
      };
      const r = await db.collection('folio_charges').add(doc);
      const chargeId = r.id || r._id;

      // 重算汇总
      const totals = await recalcFolio(db, folioId);

      res.json({ success: true, data: { _id: chargeId, ...doc }, totals });
    } catch (err) {
      console.error('[Folio] 挂账失败:', err);
      res.status(500).json({ success: false, message: '挂账失败' });
    }
  });

  /* ========== POST /api/folios/:id/charges/batch —— 批量挂账 ========== */
  router.post('/:id/charges/batch', async (req, res) => {
    try {
      const db = getDb();
      const folioId = req.params.id;

      const folioRes = await db.collection('folios').doc(folioId).get();
      const folio = (folioRes.data || [])[0] || folioRes.data;
      if (!folio) return res.status(404).json({ success: false, message: '账单不存在' });
      if (folio.status !== 'open') return res.status(400).json({ success: false, message: '账单已结算' });

      const items = req.body.items || [];
      if (!items.length) return res.status(400).json({ success: false, message: 'items 不能为空' });

      const now = new Date();
      const ids = [];
      for (const item of items) {
        const doc = {
          clubId: folio.clubId,
          folioId,
          chargeType: item.chargeType || 'other',
          chargeSource: item.chargeSource || '',
          sourceId: item.sourceId || null,
          description: item.description || '',
          amount: Number(item.amount || 0),
          quantity: Number(item.quantity || 1),
          unitPrice: item.unitPrice !== undefined ? Number(item.unitPrice) : Number(item.amount || 0),
          operatorId: item.operatorId || null,
          operatorName: item.operatorName || '',
          chargeTime: now,
          status: 'posted',
          voidReason: null,
          createdAt: now,
        };
        const r = await db.collection('folio_charges').add(doc);
        ids.push(r.id || r._id);
      }

      const totals = await recalcFolio(db, folioId);
      res.json({ success: true, data: { chargeIds: ids, count: ids.length }, totals });
    } catch (err) {
      console.error('[Folio] 批量挂账失败:', err);
      res.status(500).json({ success: false, message: '批量挂账失败' });
    }
  });

  /* ========== POST /api/folios/:id/charges/:chargeId/void —— 冲销 ========== */
  router.post('/:id/charges/:chargeId/void', async (req, res) => {
    try {
      const db = getDb();
      const { id: folioId, chargeId } = req.params;

      const folioRes = await db.collection('folios').doc(folioId).get();
      const folio = (folioRes.data || [])[0] || folioRes.data;
      if (!folio) return res.status(404).json({ success: false, message: '账单不存在' });
      if (folio.status !== 'open') return res.status(400).json({ success: false, message: '已结算账单不可冲销' });

      const chargeRes = await db.collection('folio_charges').doc(chargeId).get();
      const charge = (chargeRes.data || [])[0] || chargeRes.data;
      if (!charge) return res.status(404).json({ success: false, message: '消费记录不存在' });
      if (charge.status === 'voided') return res.status(400).json({ success: false, message: '已冲销' });

      await db.collection('folio_charges').doc(chargeId).update({
        status: 'voided',
        voidReason: req.body.reason || '手动冲销',
      });

      const totals = await recalcFolio(db, folioId);
      res.json({ success: true, message: '冲销成功', totals });
    } catch (err) {
      console.error('[Folio] 冲销失败:', err);
      res.status(500).json({ success: false, message: '冲销失败' });
    }
  });

  /* ========== POST /api/folios/:id/payments —— 收款 ========== */
  router.post('/:id/payments', async (req, res) => {
    try {
      const db = getDb();
      const folioId = req.params.id;

      const folioRes = await db.collection('folios').doc(folioId).get();
      const folio = (folioRes.data || [])[0] || folioRes.data;
      if (!folio) return res.status(404).json({ success: false, message: '账单不存在' });
      if (folio.status !== 'open') return res.status(400).json({ success: false, message: '账单已结算' });

      const {
        amount, payMethod = 'cash',
        operatorId, operatorName, note,
        memberCardNo, balanceBefore, balanceAfter,
      } = req.body;

      if (!amount || amount <= 0) return res.status(400).json({ success: false, message: '金额必须大于 0' });

      const now = new Date();
      const doc = {
        clubId: folio.clubId,
        folioId,
        amount: Number(amount),
        payMethod,
        payMethodName: PAY_METHODS[payMethod] || payMethod,
        referenceNo: generatePayRefNo(),
        memberCardNo: memberCardNo || null,
        balanceBefore: balanceBefore !== undefined ? Number(balanceBefore) : null,
        balanceAfter: balanceAfter !== undefined ? Number(balanceAfter) : null,
        operatorId: operatorId || null,
        operatorName: operatorName || '',
        paidAt: now,
        status: 'success',
        note: note || '',
        createdAt: now,
      };
      const r = await db.collection('folio_payments').add(doc);
      const paymentId = r.id || r._id;

      const totals = await recalcFolio(db, folioId);
      res.json({ success: true, data: { _id: paymentId, ...doc }, totals });
    } catch (err) {
      console.error('[Folio] 收款失败:', err);
      res.status(500).json({ success: false, message: '收款失败' });
    }
  });

  /* ========== POST /api/folios/:id/settle —— 结算 ========== */
  router.post('/:id/settle', async (req, res) => {
    try {
      const db = getDb();
      const folioId = req.params.id;

      const folioRes = await db.collection('folios').doc(folioId).get();
      const folio = (folioRes.data || [])[0] || folioRes.data;
      if (!folio) return res.status(404).json({ success: false, message: '账单不存在' });
      if (folio.status !== 'open') return res.status(400).json({ success: false, message: '账单已结算' });

      // 重算确保最新
      const totals = await recalcFolio(db, folioId);

      // 允许少量浮点误差 (0.01) 或强制结算
      const forceSettle = req.body.force === true;
      if (totals.balance > 0.01 && !forceSettle) {
        return res.status(400).json({
          success: false,
          message: `尚有待收款 ¥${totals.balance.toFixed(2)}，请先完成收款或选择强制结算（挂账）`,
          balance: totals.balance,
        });
      }

      const now = new Date();
      await db.collection('folios').doc(folioId).update({
        status: 'settled',
        settledAt: now,
        settledBy: req.body.operatorId || null,
        closedAt: now,
        updatedAt: now,
      });

      res.json({ success: true, message: '结算成功', totals });
    } catch (err) {
      console.error('[Folio] 结算失败:', err);
      res.status(500).json({ success: false, message: '结算失败' });
    }
  });

  /* ========== POST /api/folios/:id/void —— 作废 ========== */
  router.post('/:id/void', async (req, res) => {
    try {
      const db = getDb();
      const folioId = req.params.id;
      const folioRes = await db.collection('folios').doc(folioId).get();
      const folio = (folioRes.data || [])[0] || folioRes.data;
      if (!folio) return res.status(404).json({ success: false, message: '账单不存在' });

      await db.collection('folios').doc(folioId).update({
        status: 'void',
        closedAt: new Date(),
        updatedAt: new Date(),
      });
      res.json({ success: true, message: '账单已作废' });
    } catch (err) {
      res.status(500).json({ success: false, message: '作废失败' });
    }
  });

  /* ========== GET /api/folios/stats —— 统计 ========== */
  router.get('/stats', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';
      const openFolios = await db.collection('folios').where({ clubId, status: 'open' }).get();
      const openList = openFolios.data || [];
      const totalOpen = openList.length;
      const totalBalance = openList.reduce((s, f) => s + (f.balance || 0), 0);

      // 今日已结算
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const settledToday = await db.collection('folios')
        .where({ clubId, status: 'settled' })
        .limit(1000)
        .get();
      const todaySettled = (settledToday.data || []).filter(f => {
        const d = f.settledAt || f.closedAt;
        return d && new Date(d).toISOString().slice(0, 10) === todayStr;
      });

      res.json({
        success: true,
        data: {
          openCount: totalOpen,
          openBalance: Math.round(totalBalance * 100) / 100,
          todaySettledCount: todaySettled.length,
          todaySettledAmount: Math.round(todaySettled.reduce((s, f) => s + (f.totalCharges || 0), 0) * 100) / 100,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: '统计失败' });
    }
  });

  /* ========== GET /api/folios/lookup —— 按消费卡号查找活跃 Folio ========== */
  router.get('/lookup', async (req, res) => {
    try {
      const db = getDb();
      const { cardNo, bookingId, clubId = 'default' } = req.query;
      if (!cardNo && !bookingId) return res.status(400).json({ success: false, message: '请提供 cardNo 或 bookingId' });

      const where = { clubId, status: 'open' };
      if (cardNo) where.cardNo = cardNo;
      if (bookingId) where.bookingId = bookingId;

      const r = await db.collection('folios').where(where).limit(1).get();
      const folio = (r.data || [])[0];
      if (!folio) return res.json({ success: true, data: null });
      res.json({ success: true, data: folio });
    } catch (err) {
      res.status(500).json({ success: false, message: '查找失败' });
    }
  });

  return router;
};
