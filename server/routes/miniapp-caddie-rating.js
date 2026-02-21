/**
 * 球员端球童评价路由
 * 提交评价 / 查询待评价列表
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 待评价球童列表（近期已完成的预订中未评价的球童）
  router.get('/pending-ratings', async (req, res) => {
    try {
      const db = getDb();

      // 查询最近 30 天已完成的预订
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

      const bookings = await db.collection('bookings').where({
        playerId: req.playerId,
        status: 'completed',
        date: db.command.gte(cutoff)
      }).orderBy('date', 'desc').limit(50).get();

      const bookingList = bookings.data || [];
      if (bookingList.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // 提取所有涉及的 caddieId
      const caddieBookings = bookingList.filter(b => b.caddieId);
      if (caddieBookings.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const bookingIds = caddieBookings.map(b => b._id);

      // 查询已评价记录
      const rated = await db.collection('caddie_ratings').where({
        playerId: req.playerId,
        bookingId: db.command.in(bookingIds)
      }).get();
      const ratedBookingIds = new Set((rated.data || []).map(r => r.bookingId));

      // 过滤出未评价的
      const pending = caddieBookings
        .filter(b => !ratedBookingIds.has(b._id))
        .map(b => ({
          bookingId: b._id,
          caddieId: b.caddieId,
          caddieName: b.caddieName || '',
          date: b.date,
          courseName: b.courseName || ''
        }));

      res.json({ success: true, data: pending });
    } catch (err) {
      console.error('[MiniappCaddieRating] pending:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 提交球童评价
  router.post('/:caddieId/rate', async (req, res) => {
    const { caddieId } = req.params;
    const { bookingId, scores, tags, comment, anonymous } = req.body;

    if (!caddieId) {
      return res.status(400).json({ success: false, message: '缺少球童 ID' });
    }
    if (!bookingId) {
      return res.status(400).json({ success: false, message: '缺少预订 ID' });
    }
    if (!scores || typeof scores !== 'object') {
      return res.status(400).json({ success: false, message: '评分数据不正确' });
    }

    const scoreFields = ['attitude', 'skill', 'knowledge', 'pace', 'overall'];
    for (const field of scoreFields) {
      const v = Number(scores[field]);
      if (!v || v < 1 || v > 5) {
        return res.status(400).json({ success: false, message: `${field} 评分需在 1-5 之间` });
      }
    }

    if (comment && typeof comment === 'string' && comment.length > 500) {
      return res.status(400).json({ success: false, message: '评论不超过 500 字' });
    }

    try {
      const db = getDb();

      // 防止重复评价
      const dup = await db.collection('caddie_ratings').where({
        playerId: req.playerId,
        bookingId
      }).limit(1).get();

      if (dup.data && dup.data.length > 0) {
        return res.status(400).json({ success: false, message: '该次服务已评价，不可重复提交' });
      }

      // 验证预订归属
      const bookingRes = await db.collection('bookings').doc(bookingId).get();
      const booking = Array.isArray(bookingRes.data) ? bookingRes.data[0] : bookingRes.data;
      if (!booking || booking.playerId !== req.playerId) {
        return res.status(403).json({ success: false, message: '无权评价该预订' });
      }

      const numScores = {};
      for (const f of scoreFields) numScores[f] = Number(scores[f]);
      const avgScore = +(scoreFields.reduce((s, f) => s + numScores[f], 0) / scoreFields.length).toFixed(1);

      const now = new Date();
      const rating = {
        playerId: req.playerId,
        clubId: req.clubId,
        caddieId,
        bookingId,
        scores: numScores,
        avgScore,
        tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
        comment: (comment || '').trim().slice(0, 500),
        anonymous: !!anonymous,
        createdAt: now
      };

      await db.collection('caddie_ratings').add({ data: rating });

      // 更新球童平均评分（异步，不阻塞响应）
      setImmediate(async () => {
        try {
          const allRatings = await db.collection('caddie_ratings').where({ caddieId }).get();
          const list = allRatings.data || [];
          if (list.length > 0) {
            const totalAvg = +(list.reduce((s, r) => s + r.avgScore, 0) / list.length).toFixed(1);
            await db.collection('caddies').where({ _id: caddieId }).update({
              data: { avgRating: totalAvg, ratingCount: list.length, updatedAt: new Date() }
            });
          }
        } catch (e) {
          console.error('[MiniappCaddieRating] updateAvg:', e);
        }
      });

      res.json({ success: true, message: '评价提交成功' });
    } catch (err) {
      console.error('[MiniappCaddieRating] rate:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
