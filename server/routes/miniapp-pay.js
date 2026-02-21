/**
 * 球员端支付路由
 * 充值 / 支付结果查询 / Folio 结账
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 充值（创建充值订单，返回微信支付参数）
  router.post('/recharge', async (req, res) => {
    const { amount } = req.body;
    const num = Number(amount);

    if (!num || num < 1 || num > 500000) {
      return res.status(400).json({ success: false, message: '充值金额无效（1-500000）' });
    }
    if (!Number.isInteger(num * 100)) {
      return res.status(400).json({ success: false, message: '金额精度最多两位小数' });
    }

    try {
      const db = getDb();
      const now = new Date();

      const orderNo = `RC${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

      const order = {
        orderNo,
        playerId: req.playerId,
        clubId: req.clubId,
        type: 'recharge',
        amount: num,
        amountFen: Math.round(num * 100),
        status: 'pending',
        createdAt: now,
        updatedAt: now
      };

      const addRes = await db.collection('pay_orders').add({ data: order });
      const orderId = addRes._id || addRes.id;

      // 实际项目中此处调用微信支付统一下单 API 获取 prepay_id
      // 当前返回订单信息，前端使用 wx.requestPayment 时需要的参数由服务端签名后下发
      res.json({
        success: true,
        data: {
          orderId,
          orderNo,
          amount: num,
          status: 'pending',
          message: '充值订单已创建，请完成支付'
        }
      });
    } catch (err) {
      console.error('[MiniappPay] recharge:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 查询支付结果
  router.get('/result/:id', async (req, res) => {
    try {
      const db = getDb();
      const orderRes = await db.collection('pay_orders').doc(req.params.id).get();
      const order = Array.isArray(orderRes.data) ? orderRes.data[0] : orderRes.data;

      if (!order || order.playerId !== req.playerId) {
        return res.status(404).json({ success: false, message: '订单不存在' });
      }

      res.json({
        success: true,
        data: {
          orderId: order._id,
          orderNo: order.orderNo,
          amount: order.amount,
          status: order.status,
          paidAt: order.paidAt || null
        }
      });
    } catch (err) {
      console.error('[MiniappPay] result:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // Folio 账单结账
  router.post('/folio/:id', async (req, res) => {
    try {
      const db = getDb();
      const folioRes = await db.collection('folios').doc(req.params.id).get();
      const folio = Array.isArray(folioRes.data) ? folioRes.data[0] : folioRes.data;

      if (!folio || folio.playerId !== req.playerId) {
        return res.status(404).json({ success: false, message: '账单不存在' });
      }
      if (folio.status !== 'open') {
        return res.status(400).json({ success: false, message: '账单状态不允许结账' });
      }

      // 计算总额
      const chargesRes = await db.collection('folio_charges').where({
        folioId: req.params.id
      }).get();
      const total = (chargesRes.data || []).reduce((s, c) => s + (c.amount || 0), 0);

      const now = new Date();
      const orderNo = `FP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

      const payOrder = {
        orderNo,
        playerId: req.playerId,
        clubId: req.clubId,
        type: 'folio_payment',
        folioId: req.params.id,
        amount: total,
        amountFen: Math.round(total * 100),
        status: 'pending',
        createdAt: now,
        updatedAt: now
      };

      const addRes = await db.collection('pay_orders').add({ data: payOrder });

      res.json({
        success: true,
        data: {
          orderId: addRes._id || addRes.id,
          orderNo,
          amount: total,
          status: 'pending',
          message: '支付订单已创建'
        }
      });
    } catch (err) {
      console.error('[MiniappPay] folio:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
