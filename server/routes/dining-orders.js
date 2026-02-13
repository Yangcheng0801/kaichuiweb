/**
 * 餐饮订单 / POS
 * 集合：dining_orders
 *
 * 流程：开单(open) → 加菜 → 打印(printed) → 结账(settled)
 * 结账方式：folio 挂账 | cash/wechat/alipay 等当场结清
 */
function createDiningOrdersRouter(getDb) {
  const express = require('express');
  const router = express.Router();
  const COLLECTION = 'dining_orders';

  /** 生成订单号 */
  async function generateOrderNo(db, clubId) {
    const d = new Date();
    const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = `DO${ds}`;
    try {
      const cnt = await db.collection(COLLECTION)
        .where({ clubId, orderNo: db.RegExp({ regexp: `^${prefix}`, options: '' }) })
        .count();
      return `${prefix}${String((cnt.total || 0) + 1).padStart(3, '0')}`;
    } catch { return `${prefix}${String(Date.now()).slice(-5)}`; }
  }

  /* ========== POST /api/dining-orders  开单 ========== */
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', outletId, outletName,
        tableId, tableNo, guestType = 'walkin', guestName, cardNo, folioId,
        guestCount = 1, serverId, serverName, items = [],
      } = req.body;

      const now = new Date();
      const orderNo = await generateOrderNo(db, clubId);

      // 计算明细
      let subtotal = 0;
      const orderItems = items.map((it, idx) => {
        const sub = (Number(it.unitPrice || it.price || 0)) * (Number(it.quantity || 1));
        subtotal += sub;
        return {
          itemId: it.itemId || it._id || null,
          itemName: it.itemName || '',
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice || it.price || 0),
          modifiers: it.modifiers || [],
          subtotal: Math.round(sub * 100) / 100,
          status: 'pending',
          orderedAt: now, servedAt: null,
        };
      });

      const serviceCharge = 0; // 服务费可配置
      const totalAmount = Math.round((subtotal + serviceCharge) * 100) / 100;

      const doc = {
        clubId, orderNo, outletId: outletId || null, outletName: outletName || '',
        tableId: tableId || null, tableNo: tableNo || '',
        guestType, guestName: guestName || '', cardNo: cardNo || null,
        folioId: folioId || null, guestCount: Number(guestCount),
        items: orderItems, subtotal: Math.round(subtotal * 100) / 100,
        serviceCharge, discount: 0, totalAmount,
        payMethod: null, status: 'open',
        serverId: serverId || null, serverName: serverName || '',
        openedAt: now, settledAt: null, createdAt: now, updatedAt: now,
      };
      const r = await db.collection(COLLECTION).add(doc);
      const orderId = r.id || r._id;

      // 开台：更新餐台状态
      if (tableId) {
        try {
          await db.collection('tables').doc(tableId).update({
            status: 'occupied', currentOrderId: orderId, updatedAt: now,
          });
        } catch (e) { console.warn('[DiningOrders] 开台失败:', e.message); }
      }

      res.json({ success: true, data: { _id: orderId, ...doc } });
    } catch (err) {
      console.error('[DiningOrders] 开单失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ========== PUT /api/dining-orders/:id/items  加菜/退菜 ========== */
  router.put('/:id/items', async (req, res) => {
    try {
      const db = getDb();
      const orderRes = await db.collection(COLLECTION).doc(req.params.id).get();
      const order = (orderRes.data || [])[0] || orderRes.data;
      if (!order) return res.status(404).json({ success: false, error: '订单不存在' });
      if (order.status === 'settled') return res.status(400).json({ success: false, error: '已结账' });

      const { addItems = [], cancelItemIndex } = req.body;
      const now = new Date();
      let items = [...(order.items || [])];

      // 加菜
      for (const it of addItems) {
        const sub = Number(it.unitPrice || it.price || 0) * Number(it.quantity || 1);
        items.push({
          itemId: it.itemId || it._id || null,
          itemName: it.itemName || '', quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice || it.price || 0),
          modifiers: it.modifiers || [], subtotal: Math.round(sub * 100) / 100,
          status: 'pending', orderedAt: now, servedAt: null,
        });
      }

      // 退菜
      if (cancelItemIndex !== undefined && items[cancelItemIndex]) {
        items[cancelItemIndex].status = 'cancelled';
      }

      // 重算
      const subtotal = items.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.subtotal || 0), 0);
      const totalAmount = Math.round((subtotal + (order.serviceCharge || 0) - (order.discount || 0)) * 100) / 100;

      await db.collection(COLLECTION).doc(req.params.id).update({
        items, subtotal: Math.round(subtotal * 100) / 100, totalAmount, updatedAt: now,
      });

      res.json({ success: true, message: '已更新', data: { items, subtotal, totalAmount } });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  /* ========== PUT /api/dining-orders/:id/items/:idx/status  更新菜品状态 ========== */
  router.put('/:id/items/:idx/status', async (req, res) => {
    try {
      const db = getDb();
      const orderRes = await db.collection(COLLECTION).doc(req.params.id).get();
      const order = (orderRes.data || [])[0] || orderRes.data;
      if (!order) return res.status(404).json({ success: false, error: '订单不存在' });

      const idx = Number(req.params.idx);
      const items = [...(order.items || [])];
      if (!items[idx]) return res.status(400).json({ success: false, error: '菜品不存在' });

      items[idx].status = req.body.status || 'served';
      if (req.body.status === 'served') items[idx].servedAt = new Date();

      await db.collection(COLLECTION).doc(req.params.id).update({ items, updatedAt: new Date() });
      res.json({ success: true, message: '状态已更新' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  /* ========== POST /api/dining-orders/:id/settle  结账 ========== */
  router.post('/:id/settle', async (req, res) => {
    try {
      const db = getDb();
      const orderRes = await db.collection(COLLECTION).doc(req.params.id).get();
      const order = (orderRes.data || [])[0] || orderRes.data;
      if (!order) return res.status(404).json({ success: false, error: '订单不存在' });
      if (order.status === 'settled') return res.status(400).json({ success: false, error: '已结账' });

      const { payMethod = 'cash', folioId } = req.body;
      const now = new Date();

      // 挂 Folio
      if (payMethod === 'folio' && (folioId || order.folioId)) {
        const fid = folioId || order.folioId;
        try {
          await db.collection('folio_charges').add({
            clubId: order.clubId, folioId: fid,
            chargeType: 'dining', chargeSource: order.outletName || '餐饮',
            sourceId: req.params.id,
            description: `餐饮订单 ${order.orderNo}（${order.items?.length || 0}道）`,
            amount: order.totalAmount, quantity: 1, unitPrice: order.totalAmount,
            operatorId: order.serverId, operatorName: order.serverName || '',
            chargeTime: now, status: 'posted', voidReason: null, createdAt: now,
          });
          // 重算 folio
          const charges = await db.collection('folio_charges').where({ folioId: fid, status: 'posted' }).get();
          const totalC = (charges.data || []).reduce((s, c) => s + (c.amount || 0), 0);
          const payments = await db.collection('folio_payments').where({ folioId: fid, status: 'success' }).get();
          const totalP = (payments.data || []).reduce((s, p) => s + (p.amount || 0), 0);
          await db.collection('folios').doc(fid).update({
            totalCharges: Math.round(totalC * 100) / 100,
            totalPayments: Math.round(totalP * 100) / 100,
            balance: Math.round((totalC - totalP) * 100) / 100,
            updatedAt: now,
          });
        } catch (e) { console.warn('[DiningOrders] Folio 挂账失败:', e.message); }
      }

      // 更新订单
      await db.collection(COLLECTION).doc(req.params.id).update({
        status: 'settled', payMethod, settledAt: now, updatedAt: now,
      });

      // 释放餐台
      if (order.tableId) {
        try {
          await db.collection('tables').doc(order.tableId).update({
            status: 'cleaning', currentOrderId: null, updatedAt: now,
          });
        } catch (e) { console.warn('[DiningOrders] 释放餐台失败:', e.message); }
      }

      res.json({ success: true, message: '结账成功' });
    } catch (err) {
      console.error('[DiningOrders] 结账失败:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ========== GET /api/dining-orders  订单列表 ========== */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', outletId, status, page = 1, pageSize = 50 } = req.query;
      const where = { clubId };
      if (outletId) where.outletId = outletId;
      if (status) where.status = status;
      const r = await db.collection(COLLECTION)
        .where(where)
        .orderBy('createdAt', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  /* ========== GET /api/dining/reports/daily  日报 ========== */
  router.get('/reports/daily', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', date } = req.query;
      const d = date || new Date().toISOString().slice(0, 10);

      const all = await db.collection(COLLECTION)
        .where({ clubId, status: 'settled' })
        .limit(1000)
        .get();

      const todayOrders = (all.data || []).filter(o => {
        const settledDate = o.settledAt ? new Date(o.settledAt).toISOString().slice(0, 10) : '';
        return settledDate === d;
      });

      const totalRevenue = todayOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      const orderCount = todayOrders.length;
      const avgPerOrder = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

      // 消费点分布
      const byOutlet = {};
      todayOrders.forEach(o => {
        const key = o.outletName || '未知';
        if (!byOutlet[key]) byOutlet[key] = { count: 0, revenue: 0 };
        byOutlet[key].count++;
        byOutlet[key].revenue += o.totalAmount || 0;
      });

      // 菜品销量
      const itemSales = {};
      todayOrders.forEach(o => {
        (o.items || []).forEach(it => {
          if (it.status === 'cancelled') return;
          const key = it.itemName || '未知';
          if (!itemSales[key]) itemSales[key] = { name: key, quantity: 0, revenue: 0 };
          itemSales[key].quantity += it.quantity || 1;
          itemSales[key].revenue += it.subtotal || 0;
        });
      });

      res.json({
        success: true,
        data: {
          date: d, totalRevenue: Math.round(totalRevenue * 100) / 100,
          orderCount, avgPerOrder,
          byOutlet,
          topItems: Object.values(itemSales).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
        },
      });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
  });

  return router;
}
module.exports = createDiningOrdersRouter;
