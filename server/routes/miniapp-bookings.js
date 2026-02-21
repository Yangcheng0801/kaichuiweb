/**
 * 球员端预订路由
 * 所有接口需 requirePlayerAuth 中间件
 */

module.exports = function (getDb) {
  const router = require('express').Router();
  const { requirePlayerAuth } = require('../middleware/player-auth');

  router.use(requirePlayerAuth);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^\d{2}:\d{2}$/;
  const MAX_PLAYERS_PER_SLOT = 4;

  function safeErrorMessage(err) {
    if (process.env.NODE_ENV === 'production') return '服务器内部错误';
    return err.message || '未知错误';
  }

  // 查询可用时段
  router.get('/available', async (req, res) => {
    const { date, courseId } = req.query;
    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ success: false, message: '日期参数格式错误，应为 YYYY-MM-DD' });
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ success: false, message: '无效日期' });
    }

    try {
      const db = getDb();
      const _ = db.command;
      const activeStatuses = _ ? _.in(['pending', 'confirmed', 'checked_in', 'playing']) : 'confirmed';
      const existingBookings = await db.collection('bookings').where({
        date, clubId: req.clubId, status: activeStatuses
      }).get();

      const bookedMap = {};
      (existingBookings.data || []).forEach(b => {
        const key = b.teeTime;
        bookedMap[key] = (bookedMap[key] || 0) + (b.playerCount || 1);
      });

      const slots = [];
      for (let h = 7; h <= 16; h++) {
        for (let m = 0; m < 60; m += 12) {
          const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          const booked = bookedMap[time] || 0;
          const remaining = MAX_PLAYERS_PER_SLOT - booked;
          slots.push({
            teeTime: time,
            time,
            remaining,
            availableSlots: remaining,
            isFull: remaining <= 0
          });
        }
      }

      res.json({ success: true, data: { slots, date } });
    } catch (err) {
      console.error('[MiniappBookings] available:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 批量价格预览（实时试算）—— 复用定价引擎
  router.post('/price-preview', async (req, res) => {
    const { date, identityType } = req.body;
    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ success: false, message: '日期参数格式错误' });
    }

    try {
      const db = getDb();
      const { determineDayType, determineTimeSlot, matchRateSheet, getGreenFee } = require('../utils/pricing-engine');

      const identity = identityType || 'guest';
      const dayInfo = await determineDayType(db, req.clubId, date);

      if (dayInfo.isClosed) {
        return res.json({ success: true, data: { prices: {}, date, closed: true, closedReason: dayInfo.dateName } });
      }

      const prices = {};
      const slotCache = {};

      for (let h = 7; h <= 16; h++) {
        for (let m = 0; m < 60; m += 12) {
          const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          const timeSlot = determineTimeSlot(time);

          if (!slotCache[timeSlot]) {
            slotCache[timeSlot] = await matchRateSheet(db, req.clubId, null, dayInfo.dayType, timeSlot, 18, date);
          }

          const rateSheet = slotCache[timeSlot];
          const fee = getGreenFee(rateSheet, identity);
          if (fee > 0) prices[time] = fee;
        }
      }

      res.json({ success: true, data: { prices, date, dayType: dayInfo.dayType } });
    } catch (err) {
      console.error('[MiniappBookings] price-preview:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 单次价格计算（确认页使用）—— 复用定价引擎
  router.post('/calculate', async (req, res) => {
    const { date, teeTime, identityType, playerCount, courseId } = req.body;

    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ success: false, message: '日期格式错误' });
    }
    if (!teeTime || !TIME_RE.test(teeTime)) {
      return res.status(400).json({ success: false, message: '时段格式错误' });
    }

    try {
      const db = getDb();
      const { calculateBookingPrice } = require('../utils/pricing-engine');

      const identity = identityType || 'guest';
      const count = Math.max(1, Math.min(4, Number(playerCount) || 1));

      const players = [];
      for (let i = 0; i < count; i++) {
        players.push({ identityCode: identity, name: i === 0 ? '预订人' : `球员${i + 1}` });
      }

      const result = await calculateBookingPrice(db, {
        clubId: req.clubId,
        date,
        teeTime,
        courseId: courseId || null,
        holes: 18,
        players
      });

      const perPlayer = result.greenFee > 0 ? Math.round(result.greenFee / count) : 0;

      res.json({
        success: true,
        data: {
          price: perPlayer,
          totalPrice: result.greenFee,
          playerCount: count,
          dayType: result.dayType,
          dayTypeName: result.dayTypeName,
          timeSlot: result.timeSlot,
          timeSlotName: result.timeSlotName,
          hasRateSheet: result.hasRateSheet,
          playerBreakdown: result.playerBreakdown
        }
      });
    } catch (err) {
      console.error('[MiniappBookings] calculate:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 创建预订 — 含防超卖校验 + 乐观锁
  router.post('/', async (req, res) => {
    const { date, teeTime, courseId, caddieId, playerCount: reqPlayerCount } = req.body;

    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ success: false, message: '日期格式错误' });
    }
    if (!teeTime || !TIME_RE.test(teeTime)) {
      return res.status(400).json({ success: false, message: '时段格式错误' });
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ success: false, message: '无效日期' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateObj < today) {
      return res.status(400).json({ success: false, message: '不能预订过去的日期' });
    }

    const playerCount = Math.max(1, Math.min(4, Number(reqPlayerCount) || 1));

    try {
      const db = getDb();
      const _ = db.command;

      // 防超卖：查询该时段已预订人数
      const activeStatuses = _ ? _.in(['pending', 'confirmed', 'checked_in', 'playing']) : 'confirmed';
      const existing = await db.collection('bookings').where({
        date, teeTime, clubId: req.clubId, status: activeStatuses
      }).get();

      const bookedCount = (existing.data || []).reduce((sum, b) => sum + (b.playerCount || 1), 0);
      if (bookedCount + playerCount > MAX_PLAYERS_PER_SLOT) {
        return res.status(409).json({
          success: false,
          message: `该时段剩余 ${MAX_PLAYERS_PER_SLOT - bookedCount} 个位置，无法预订 ${playerCount} 人`
        });
      }

      // 防重复预订：同一球员同一天同一时段不能重复预订
      const duplicateCheck = await db.collection('bookings').where({
        date, teeTime, playerId: req.playerId, clubId: req.clubId, status: activeStatuses
      }).limit(1).get();
      if (duplicateCheck.data && duplicateCheck.data.length > 0) {
        return res.status(409).json({ success: false, message: '您已预订该时段，请勿重复提交' });
      }

      const bookingData = {
        date, teeTime,
        courseId: courseId || null,
        playerId: req.playerId,
        clubId: req.clubId,
        playerCount,
        caddieId: caddieId || null,
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
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 我的预订列表 — status 过滤移到数据库层
  router.get('/mine', async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));

    try {
      const db = getDb();
      const _ = db.command;
      const where = { playerId: req.playerId, clubId: req.clubId };

      if (status && _) {
        const statuses = status.split(',').filter(Boolean);
        if (statuses.length === 1) {
          where.status = statuses[0];
        } else if (statuses.length > 1) {
          where.status = _.in(statuses);
        }
      }

      const bookings = await db.collection('bookings').where(where)
        .orderBy('date', 'desc').orderBy('teeTime', 'desc')
        .skip((pageNum - 1) * limitNum).limit(limitNum).get();

      res.json({ success: true, data: { bookings: bookings.data || [] } });
    } catch (err) {
      console.error('[MiniappBookings] mine:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 当前进行中的预订（必须在 /:id 之前）
  router.get('/active', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const activeStatuses = _ ? _.in(['checked_in', 'playing']) : 'playing';
      const result = await db.collection('bookings').where({
        playerId: req.playerId, status: activeStatuses
      }).orderBy('date', 'desc').limit(1).get();

      if (!result.data || result.data.length === 0) {
        return res.json({ success: true, data: null });
      }

      res.json({ success: true, data: result.data[0] });
    } catch (err) {
      console.error('[MiniappBookings] active:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 预订详情 — 支持邀请者和被邀请同组球员查看
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bookings').doc(req.params.id).get();
      const booking = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!booking) {
        return res.status(404).json({ success: false, message: '预订不存在' });
      }

      const isOwner = booking.playerId === req.playerId;
      const isCompanion = (booking.companions || []).some(c => c.playerId === req.playerId);
      if (!isOwner && !isCompanion) {
        return res.status(403).json({ success: false, message: '无权查看此预订' });
      }

      res.json({ success: true, data: booking });
    } catch (err) {
      console.error('[MiniappBookings] detail:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 取消预订 — 乐观锁 (version 字段防并发)
  router.put('/:id/cancel', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const result = await db.collection('bookings').doc(req.params.id).get();
      const booking = Array.isArray(result.data) ? result.data[0] : result.data;

      if (!booking || booking.playerId !== req.playerId) {
        return res.status(404).json({ success: false, message: '预订不存在' });
      }
      if (!['pending', 'confirmed'].includes(booking.status)) {
        return res.status(400).json({ success: false, message: '当前状态不可取消' });
      }

      const currentVersion = booking.version || 1;
      const updateWhere = {
        _id: req.params.id,
        playerId: req.playerId,
        status: _ ? _.in(['pending', 'confirmed']) : booking.status
      };

      if (_) {
        updateWhere.version = currentVersion;
      }

      const updateRes = await db.collection('bookings').where(updateWhere).update({
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: (req.body.reason || '球员取消').substring(0, 200),
          updatedAt: new Date(),
          version: _ ? _.inc(1) : currentVersion + 1
        }
      });

      if (!updateRes.stats || updateRes.stats.updated === 0) {
        return res.status(409).json({ success: false, message: '预订状态已变更，请刷新后重试' });
      }

      res.json({ success: true, message: '已取消' });
    } catch (err) {
      console.error('[MiniappBookings] cancel:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  // 邀请加入预订 — 防并发超过4人
  router.post('/:id/join', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const result = await db.collection('bookings').doc(req.params.id).get();
      const booking = Array.isArray(result.data) ? result.data[0] : result.data;

      if (!booking) {
        return res.status(404).json({ success: false, message: '预订不存在' });
      }
      if (!['pending', 'confirmed'].includes(booking.status)) {
        return res.status(400).json({ success: false, message: '该预订已无法加入' });
      }

      const currentCount = booking.playerCount || 1;
      if (currentCount >= MAX_PLAYERS_PER_SLOT) {
        return res.status(400).json({ success: false, message: '已满 4 人' });
      }

      // 防重复加入
      const isAlreadyIn = booking.playerId === req.playerId ||
        (booking.companions || []).some(c => c.playerId === req.playerId);
      if (isAlreadyIn) {
        return res.status(400).json({ success: false, message: '您已在该预订中' });
      }

      const playerRes = await db.collection('players').doc(req.playerId).get();
      const joiner = Array.isArray(playerRes.data) ? playerRes.data[0] : playerRes.data;

      const newCompanion = {
        playerId: req.playerId,
        name: joiner?.name || '球员',
        phone: joiner?.phone || '',
        joinedAt: new Date()
      };

      // 乐观锁：只在 playerCount 未变时更新
      const currentVersion = booking.version || 1;
      const updateWhere = { _id: req.params.id };
      if (_) {
        updateWhere.playerCount = _.lt(MAX_PLAYERS_PER_SLOT);
        updateWhere.version = currentVersion;
      }

      const updateRes = await db.collection('bookings').where(updateWhere).update({
        data: {
          companions: _ ? _.push(newCompanion) : [...(booking.companions || []), newCompanion],
          playerCount: _ ? _.inc(1) : currentCount + 1,
          updatedAt: new Date(),
          version: _ ? _.inc(1) : currentVersion + 1
        }
      });

      if (!updateRes.stats || updateRes.stats.updated === 0) {
        return res.status(409).json({ success: false, message: '该时段已满员或预订已变更，请刷新重试' });
      }

      res.json({ success: true, message: '已加入' });
    } catch (err) {
      console.error('[MiniappBookings] join:', err);
      res.status(500).json({ success: false, message: safeErrorMessage(err) });
    }
  });

  return router;
};
