/**
 * 球员端首页路由
 * 首页摘要 / 天气信息
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 首页聚合摘要（一次请求返回首页所需的核心数据）
  router.get('/summary', async (req, res) => {
    try {
      const db = getDb();
      const today = new Date().toISOString().slice(0, 10);

      // 并行查询
      const [profileRes, bookingRes, folioRes, unreadRes, announcementRes] = await Promise.all([
        // 球场档案（身份、余额、积分）
        db.collection('player_club_profiles').where({
          playerId: req.playerId, clubId: req.clubId
        }).limit(1).get(),

        // 今日预订
        db.collection('bookings').where({
          playerId: req.playerId,
          date: today,
          status: db.command.in(['confirmed', 'checked_in'])
        }).limit(1).get(),

        // 当前活跃 Folio
        db.collection('folios').where({
          playerId: req.playerId,
          clubId: req.clubId,
          status: 'open'
        }).limit(1).get(),

        // 未读消息数
        db.collection('player_notifications').where({
          playerId: req.playerId,
          read: false
        }).count(),

        // 最新公告（全球会可见）
        db.collection('notifications').where({
          clubId: req.clubId,
          type: 'announcement',
          status: 'active'
        }).orderBy('createdAt', 'desc').limit(3).get()
      ]);

      const clubProfile = profileRes.data && profileRes.data.length > 0 ? profileRes.data[0] : null;
      const todayBooking = bookingRes.data && bookingRes.data.length > 0 ? bookingRes.data[0] : null;
      const activeFolio = folioRes.data && folioRes.data.length > 0 ? folioRes.data[0] : null;

      res.json({
        success: true,
        data: {
          clubProfile: clubProfile ? {
            identityType: clubProfile.identityType,
            identityName: clubProfile.identityName,
            balance: clubProfile.balance || 0,
            points: clubProfile.points || 0,
            consumeCardNo: clubProfile.consumeCardNo || ''
          } : null,
          todayBooking: todayBooking ? {
            _id: todayBooking._id,
            date: todayBooking.date,
            teeTime: todayBooking.teeTime,
            courseName: todayBooking.courseName,
            status: todayBooking.status,
            playerCount: todayBooking.playerCount
          } : null,
          activeFolio: activeFolio ? {
            _id: activeFolio._id,
            totalAmount: activeFolio.totalAmount || 0,
            status: activeFolio.status
          } : null,
          unreadCount: unreadRes.total || 0,
          announcements: (announcementRes.data || []).map(a => ({
            _id: a._id,
            title: a.title,
            summary: (a.content || '').slice(0, 80),
            createdAt: a.createdAt
          }))
        }
      });
    } catch (err) {
      console.error('[MiniappHome] summary:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 天气信息（从球会设置中读取城市，调用天气 API 或返回缓存）
  router.get('/weather', async (req, res) => {
    try {
      const db = getDb();

      // 先检查缓存（1小时内有效）
      const cacheRes = await db.collection('weather_cache').where({
        clubId: req.clubId
      }).limit(1).get();

      const cache = cacheRes.data && cacheRes.data.length > 0 ? cacheRes.data[0] : null;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      if (cache && cache.updatedAt && new Date(cache.updatedAt) > oneHourAgo) {
        return res.json({ success: true, data: cache.weather, cached: true });
      }

      // 获取球会城市
      const clubRes = await db.collection('settings').where({
        clubId: req.clubId,
        key: 'club_info'
      }).limit(1).get();

      const clubInfo = clubRes.data && clubRes.data.length > 0 ? clubRes.data[0].value : null;
      const city = clubInfo ? (clubInfo.city || clubInfo.address || '') : '';

      // 返回基础天气占位（实际生产应对接高德/和风天气 API）
      const weather = {
        city: city || '未设置',
        temp: '--',
        condition: '--',
        humidity: '--',
        wind: '--',
        updatedAt: new Date().toISOString(),
        notice: '天气 API 待接入'
      };

      // 写入缓存
      if (cache) {
        await db.collection('weather_cache').doc(cache._id).update({
          data: { weather, updatedAt: new Date() }
        });
      } else {
        await db.collection('weather_cache').add({
          data: { clubId: req.clubId, weather, updatedAt: new Date() }
        });
      }

      res.json({ success: true, data: weather, cached: false });
    } catch (err) {
      console.error('[MiniappHome] weather:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
