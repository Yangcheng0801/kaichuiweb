/**
 * 球员端预订路由
 * 所有接口需 requirePlayerAuth 中间件
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

  // 查询可用时段
  router.get('/available', async (req, res) => {
    const { date, courseId } = req.query;
    if (!date) return res.status(400).json({ success: false, message: '缺少日期参数' });

    try {
      const db = getDb();
      const existingBookings = await db.collection('bookings').where({
        date, clubId: req.clubId, status: db.command ? db.command.in(['pending', 'confirmed', 'checked_in', 'playing']) : 'confirmed'
      }).get();

      // 生成 07:00 - 16:00 的时段（每 12 分钟一个 slot）
      const slots = [];
      for (let h = 7; h <= 16; h++) {
        for (let m = 0; m < 60; m += 12) {
          const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          const booked = (existingBookings.data || []).filter(b => b.teeTime === time);
          const remaining = 4 - booked.length;
          slots.push({ teeTime: time, time, remaining, availableSlots: remaining, isFull: remaining <= 0 });
        }
      }

      res.json({ success: true, data: { slots, date } });
    } catch (err) {
      console.error('[MiniappBookings] available:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 批量价格预览（实时试算）
  router.post('/price-preview', async (req, res) => {
    const { date, identityType } = req.body;
    if (!date) return res.status(400).json({ success: false, message: '缺少日期' });

    try {
      const db = getDb();
      const identity = identityType || 'guest';

      // 查询对应 rate_sheet
      const rateRes = await db.collection('rate_sheets').where({
        clubId: req.clubId, identityType: identity
      }).limit(1).get();

      const prices = {};
      if (rateRes.data && rateRes.data.length > 0) {
        const rateSheet = rateRes.data[0];
        // 判断日期类型
        const dayOfWeek = new Date(date).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dayType = isWeekend ? 'weekend' : 'weekday';

        // 简化定价：根据时段匹配
        for (let h = 7; h <= 16; h++) {
          for (let m = 0; m < 60; m += 12) {
            const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            let price = rateSheet.basePrice || 680;

            if (rateSheet.timeSlots) {
              for (const slot of rateSheet.timeSlots) {
                if (time >= (slot.start || '00:00') && time < (slot.end || '24:00')) {
                  price = (slot.prices && slot.prices[dayType]) || slot.price || price;
                  break;
                }
              }
            }

            if (isWeekend && rateSheet.weekendMultiplier) {
              price = Math.round(price * rateSheet.weekendMultiplier);
            }

            prices[time] = price;
          }
        }
      }

      res.json({ success: true, data: { prices, date } });
    } catch (err) {
      console.error('[MiniappBookings] price-preview:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 创建预订
  router.post('/', async (req, res) => {
    const { date, teeTime, courseId, caddieId, cartId, companions } = req.body;
    if (!date || !teeTime) return res.status(400).json({ success: false, message: '日期和时段必填' });

    try {
      const db = getDb();
      const playerCount = 1 + (companions ? companions.length : 0);

      const bookingData = {
        date, teeTime, courseId: courseId || null,
        playerId: req.playerId, clubId: req.clubId,
        caddieId: caddieId || null, cartId: cartId || null,
        companions: companions || [],
        playerCount,
        status: 'pending',
        source: 'miniprogram',
        totalAmount: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const addRes = await db.collection('bookings').add({ data: bookingData });

      res.json({
        success: true,
        data: { _id: addRes._id, bookingId: addRes._id, ...bookingData }
      });
    } catch (err) {
      console.error('[MiniappBookings] create:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 我的预订列表
  router.get('/mine', async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    try {
      const db = getDb();
      let query = db.collection('bookings').where({ playerId: req.playerId, clubId: req.clubId });

      const bookings = await query.orderBy('date', 'desc').orderBy('teeTime', 'desc')
        .skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).get();

      let filtered = bookings.data || [];
      if (status) {
        const statuses = status.split(',');
        filtered = filtered.filter(b => statuses.includes(b.status));
      }

      res.json({ success: true, data: { bookings: filtered } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 预订详情
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bookings').doc(req.params.id).get();
      const booking = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!booking || booking.playerId !== req.playerId) {
        return res.status(404).json({ success: false, message: '预订不存在' });
      }
      res.json({ success: true, data: booking });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 取消预订
  router.put('/:id/cancel', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bookings').doc(req.params.id).get();
      const booking = Array.isArray(result.data) ? result.data[0] : result.data;

      if (!booking || booking.playerId !== req.playerId) {
        return res.status(404).json({ success: false, message: '预订不存在' });
      }
      if (!['pending', 'confirmed'].includes(booking.status)) {
        return res.status(400).json({ success: false, message: '当前状态不可取消' });
      }

      await db.collection('bookings').doc(req.params.id).update({
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: req.body.reason || '球员取消',
          updatedAt: new Date()
        }
      });

      res.json({ success: true, message: '已取消' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 当前进行中的预订
  router.get('/active', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bookings').where({
        playerId: req.playerId, status: 'playing'
      }).limit(1).get();

      if (!result.data || result.data.length === 0) {
        return res.json({ success: true, data: null });
      }

      res.json({ success: true, data: result.data[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 邀请加入预订
  router.post('/:id/join', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bookings').doc(req.params.id).get();
      const booking = Array.isArray(result.data) ? result.data[0] : result.data;

      if (!booking) return res.status(404).json({ success: false, message: '预订不存在' });

      const playerCount = (booking.playerCount || 1) + 1;
      if (playerCount > 4) return res.status(400).json({ success: false, message: '已满 4 人' });

      const companions = booking.companions || [];
      // 查询加入者信息
      const playerRes = await db.collection('players').doc(req.playerId).get();
      const joiner = Array.isArray(playerRes.data) ? playerRes.data[0] : playerRes.data;

      companions.push({
        playerId: req.playerId,
        name: joiner?.name || '球员',
        phone: joiner?.phone || ''
      });

      await db.collection('bookings').doc(req.params.id).update({
        data: { companions, playerCount, updatedAt: new Date() }
      });

      res.json({ success: true, message: '已加入' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
