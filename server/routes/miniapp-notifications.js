/**
 * 球员端通知消息路由
 * 消息列表 / 标记已读 / 全部已读 / 未读计数
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 未读消息数量（轻量接口，供首页角标调用）
  router.get('/unread-count', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('player_notifications').where({
        playerId: req.playerId,
        read: false
      }).count();

      res.json({ success: true, data: { count: result.total || 0 } });
    } catch (err) {
      console.error('[MiniappNotification] unread-count:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 全部标记为已读
  router.post('/read-all', async (req, res) => {
    try {
      const db = getDb();

      const unread = await db.collection('player_notifications').where({
        playerId: req.playerId,
        read: false
      }).limit(100).get();

      const docs = unread.data || [];
      if (docs.length === 0) {
        return res.json({ success: true, message: '没有未读消息', data: { updated: 0 } });
      }

      const promises = docs.map(d =>
        db.collection('player_notifications').doc(d._id).update({
          data: { read: true, readAt: new Date() }
        })
      );
      await Promise.all(promises);

      res.json({ success: true, message: '已全部标记为已读', data: { updated: docs.length } });
    } catch (err) {
      console.error('[MiniappNotification] read-all:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 消息列表（分页）
  router.get('/', async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));

    try {
      const db = getDb();
      const result = await db.collection('player_notifications').where({
        playerId: req.playerId
      }).orderBy('createdAt', 'desc')
        .skip((pageNum - 1) * limitNum).limit(limitNum).get();

      const countRes = await db.collection('player_notifications').where({
        playerId: req.playerId,
        read: false
      }).count();

      res.json({
        success: true,
        data: {
          list: result.data || [],
          unreadCount: countRes.total || 0,
          page: pageNum,
          limit: limitNum
        }
      });
    } catch (err) {
      console.error('[MiniappNotification] list:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 标记单条消息为已读
  router.post('/:id/read', async (req, res) => {
    try {
      const db = getDb();

      const msgRes = await db.collection('player_notifications').doc(req.params.id).get();
      const msg = Array.isArray(msgRes.data) ? msgRes.data[0] : msgRes.data;

      if (!msg || msg.playerId !== req.playerId) {
        return res.status(404).json({ success: false, message: '消息不存在' });
      }

      if (msg.read) {
        return res.json({ success: true, message: '已读' });
      }

      await db.collection('player_notifications').doc(req.params.id).update({
        data: { read: true, readAt: new Date() }
      });

      res.json({ success: true, message: '已标记为已读' });
    } catch (err) {
      console.error('[MiniappNotification] read:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
