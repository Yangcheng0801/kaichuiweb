/**
 * 球员端意见反馈路由
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 提交反馈
  router.post('/', async (req, res) => {
    const { type, content, images, contact } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, message: '反馈内容不能为空' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ success: false, message: '反馈内容不超过 2000 字' });
    }

    const validTypes = ['suggestion', 'complaint', 'bug', 'other'];
    const feedbackType = validTypes.includes(type) ? type : 'other';

    if (images && (!Array.isArray(images) || images.length > 9)) {
      return res.status(400).json({ success: false, message: '图片最多上传 9 张' });
    }

    try {
      const db = getDb();
      const now = new Date();
      const feedback = {
        playerId: req.playerId,
        clubId: req.clubId,
        type: feedbackType,
        content: content.trim().slice(0, 2000),
        images: Array.isArray(images) ? images.slice(0, 9) : [],
        contact: (contact || '').trim().slice(0, 100),
        status: 'pending',
        createdAt: now,
        updatedAt: now
      };

      const addRes = await db.collection('feedbacks').add({ data: feedback });

      res.json({
        success: true,
        message: '反馈提交成功，感谢您的意见',
        data: { _id: addRes._id || addRes.id }
      });
    } catch (err) {
      console.error('[MiniappFeedback] submit:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
