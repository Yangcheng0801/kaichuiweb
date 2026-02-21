/**
 * 球员端球包追踪路由
 * 扫码绑定 / 解绑 / 查询我的球包
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 我的球包列表
  router.get('/mine', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bag_storage').where({
        playerId: req.playerId,
        clubId: req.clubId
      }).orderBy('boundAt', 'desc').get();

      res.json({ success: true, data: result.data || [] });
    } catch (err) {
      console.error('[MiniappBag] mine:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 扫码绑定球包
  router.post('/bind', async (req, res) => {
    const { qrCode, tagNo } = req.body;
    const code = (qrCode || tagNo || '').trim();

    if (!code) {
      return res.status(400).json({ success: false, message: '请扫描球包二维码或输入球包号' });
    }
    if (code.length > 64) {
      return res.status(400).json({ success: false, message: '球包码格式无效' });
    }

    try {
      const db = getDb();

      // 检查该球包码是否已被其他人绑定
      const existing = await db.collection('bag_storage').where({
        tagNo: code,
        clubId: req.clubId,
        status: 'bound'
      }).limit(1).get();

      if (existing.data && existing.data.length > 0) {
        const owner = existing.data[0];
        if (owner.playerId === req.playerId) {
          return res.status(400).json({ success: false, message: '该球包已绑定在您名下' });
        }
        return res.status(400).json({ success: false, message: '该球包码已被其他球员绑定' });
      }

      const now = new Date();
      const record = {
        playerId: req.playerId,
        clubId: req.clubId,
        tagNo: code,
        status: 'bound',
        boundAt: now,
        createdAt: now,
        updatedAt: now
      };

      const addRes = await db.collection('bag_storage').add({ data: record });

      res.json({
        success: true,
        message: '球包绑定成功',
        data: { _id: addRes._id || addRes.id, ...record }
      });
    } catch (err) {
      console.error('[MiniappBag] bind:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 解绑球包
  router.post('/unbind', async (req, res) => {
    const { bagId, tagNo } = req.body;

    if (!bagId && !tagNo) {
      return res.status(400).json({ success: false, message: '请提供球包 ID 或球包号' });
    }

    try {
      const db = getDb();

      let where;
      if (bagId) {
        where = { _id: bagId, playerId: req.playerId };
      } else {
        where = { tagNo, playerId: req.playerId, clubId: req.clubId, status: 'bound' };
      }

      const bagRes = await db.collection('bag_storage').where(where).limit(1).get();
      if (!bagRes.data || bagRes.data.length === 0) {
        return res.status(404).json({ success: false, message: '未找到该球包记录' });
      }

      const bag = bagRes.data[0];
      await db.collection('bag_storage').doc(bag._id).update({
        data: { status: 'unbound', unboundAt: new Date(), updatedAt: new Date() }
      });

      res.json({ success: true, message: '球包已解绑' });
    } catch (err) {
      console.error('[MiniappBag] unbind:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
