/**
 * 出发台管理路由（Starter Station）
 *
 * 职责范围：
 *   - 出发调度：球童/球车/出发洞分配，管理待出发队列
 *   - 场上动态：实时追踪球员在场状态（前9 / 转场 / 后9 / 回场）
 *   - 球包管理：球包入库 / 出库 / 归还
 *   - 状态看板：各状态人数统计
 *   - 时间轴视图：甘特图数据（球童/球车/时间段占用）
 *
 * 状态流（出发台负责的区间）：
 *   checked_in → dispatched → front_9 → turning → back_9 → returned → completed → settled
 *
 * @param {Function} getDb - 由 app.js 注入
 */
function createStarterRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  // ─── 出发台可操作的状态流转 ──────────────────────────────────────────────────
  const STARTER_TRANSITIONS = {
    checked_in: ['dispatched'],
    dispatched: ['front_9'],
    front_9:    ['turning', 'returned'],
    turning:    ['back_9'],
    back_9:     ['returned'],
    returned:   ['completed'],
    completed:  ['settled'],
  };

  // 所有"场上"状态
  const ON_COURSE_STATUSES = ['dispatched', 'front_9', 'turning', 'back_9'];

  // ─── 工具函数 ────────────────────────────────────────────────────────────────

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  function parsePage(query) {
    let page = parseInt(query.page, 10);
    let pageSize = parseInt(query.pageSize, 10);
    page = Number.isFinite(page) && page > 0 ? page : 1;
    pageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 50;
    return { page, pageSize };
  }

  async function getBookingById(db, id) {
    const r = await db.collection('bookings').doc(id).get();
    return Array.isArray(r.data) ? r.data[0] : r.data;
  }

  async function updateBookingStatus(db, id, oldStatus, newStatus, extra = {}, operator = '') {
    const allowed = STARTER_TRANSITIONS[oldStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`状态 ${oldStatus} 不允许流转到 ${newStatus}`);
    }

    const _ = db.command;
    const updateData = {
      status: newStatus,
      updateTime: new Date(),
      statusHistory: _.push([{
        from: oldStatus,
        to: newStatus,
        time: now(),
        operator,
        module: 'starter',
      }]),
      ...extra,
    };

    await db.collection('bookings').doc(id).update({ data: updateData });
    return updateData;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/starter/dashboard  状态看板（当日各状态统计）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/dashboard', async (req, res) => {
    try {
      const db = getDb();
      const date = req.query.date || today();

      const result = await db.collection('bookings')
        .where({ date })
        .orderBy('teeTime', 'asc')
        .limit(1000)
        .get();

      const bookings = result.data || [];
      const totalPlayers = bookings.reduce((s, b) => s + (b.players?.length || b.playerCount || 0), 0);

      const counts = {};
      const statusList = [
        'pending', 'confirmed', 'checked_in', 'dispatched',
        'front_9', 'turning', 'back_9', 'returned',
        'completed', 'settled', 'cancelled',
      ];
      statusList.forEach(s => { counts[s] = 0; });
      bookings.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });

      const onCourse = bookings.filter(b => ON_COURSE_STATUSES.includes(b.status)).length;
      const notArrived = bookings.filter(b => ['pending', 'confirmed'].includes(b.status)).length;

      res.json({
        success: true,
        data: {
          date,
          totalBookings: bookings.length,
          totalPlayers,
          notArrived,
          onCourse,
          counts,
        },
      });
    } catch (error) {
      console.error('[Starter] dashboard 查询失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/starter/queue  待出发队列（status = checked_in）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/queue', async (req, res) => {
    try {
      const db = getDb();
      const date = req.query.date || today();

      const result = await db.collection('bookings')
        .where({ date, status: 'checked_in' })
        .orderBy('teeTime', 'asc')
        .limit(100)
        .get();

      res.json({ success: true, data: result.data || [] });
    } catch (error) {
      console.error('[Starter] 待出发队列查询失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/starter/on-course  场上动态（dispatched / front_9 / turning / back_9）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/on-course', async (req, res) => {
    try {
      const db = getDb();
      const date = req.query.date || today();
      const _ = db.command;

      const result = await db.collection('bookings')
        .where({ date, status: _.in(ON_COURSE_STATUSES) })
        .orderBy('teeTime', 'asc')
        .limit(200)
        .get();

      res.json({ success: true, data: result.data || [] });
    } catch (error) {
      console.error('[Starter] 场上动态查询失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/starter/returned  已回场列表（returned / completed / settled）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/returned', async (req, res) => {
    try {
      const db = getDb();
      const date = req.query.date || today();
      const _ = db.command;

      const result = await db.collection('bookings')
        .where({ date, status: _.in(['returned', 'completed', 'settled']) })
        .orderBy('teeTime', 'asc')
        .limit(200)
        .get();

      res.json({ success: true, data: result.data || [] });
    } catch (error) {
      console.error('[Starter] 已回场列表查询失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/starter/:id/dispatch  出发调度（分配球童/球车/出发洞）
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/dispatch', async (req, res) => {
    try {
      const db = getDb();
      const booking = await getBookingById(db, req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: '预订不存在' });

      const { caddyId, caddyName, cartId, cartNo, startHole, operatorName } = req.body;

      const dispatch = {
        caddyId: caddyId || booking.caddyId || null,
        caddyName: caddyName || booking.caddyName || '',
        cartId: cartId || booking.cartId || null,
        cartNo: cartNo || booking.cartNo || '',
        startHole: startHole || 1,
        dispatchTime: now(),
        dispatchedBy: operatorName || '',
      };

      await updateBookingStatus(db, req.params.id, booking.status, 'dispatched', { dispatch }, operatorName);

      // 占用球童
      if (dispatch.caddyId) {
        try {
          await db.collection('caddies').doc(dispatch.caddyId).update({
            data: { status: 'busy', updateTime: new Date() },
          });
        } catch (e) { console.warn('[Starter] 占用球童失败:', e.message); }
      }

      // 占用球车
      if (dispatch.cartId) {
        try {
          await db.collection('carts').doc(dispatch.cartId).update({
            data: { status: 'in_use', updateTime: new Date() },
          });
        } catch (e) { console.warn('[Starter] 占用球车失败:', e.message); }
      }

      res.json({ success: true, message: '出发调度成功', data: dispatch });
    } catch (error) {
      console.error('[Starter] 出发调度失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/starter/:id/progress  更新场上进程
  //   body: { status: 'front_9' | 'turning' | 'back_9', operatorName }
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/progress', async (req, res) => {
    try {
      const db = getDb();
      const booking = await getBookingById(db, req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: '预订不存在' });

      const { status: newStatus, operatorName } = req.body;
      if (!newStatus) return res.status(400).json({ success: false, error: '请指定目标状态' });

      const progressKey = `courseProgress.${newStatus}Time`;
      await updateBookingStatus(db, req.params.id, booking.status, newStatus, {
        [progressKey]: now(),
      }, operatorName);

      res.json({ success: true, message: `状态已更新为 ${newStatus}` });
    } catch (error) {
      console.error('[Starter] 更新进程失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/starter/:id/return  标记回场
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/return', async (req, res) => {
    try {
      const db = getDb();
      const booking = await getBookingById(db, req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: '预订不存在' });

      const { operatorName } = req.body;

      await updateBookingStatus(db, req.params.id, booking.status, 'returned', {
        'courseProgress.returnTime': now(),
      }, operatorName);

      // 释放球童
      const caddyId = booking.dispatch?.caddyId || booking.caddyId;
      if (caddyId) {
        try {
          await db.collection('caddies').doc(caddyId).update({
            data: { status: 'available', updateTime: new Date() },
          });
        } catch (e) { console.warn('[Starter] 释放球童失败:', e.message); }
      }

      // 释放球车
      const cartId = booking.dispatch?.cartId || booking.cartId;
      if (cartId) {
        try {
          await db.collection('carts').doc(cartId).update({
            data: { status: 'available', updateTime: new Date() },
          });
        } catch (e) { console.warn('[Starter] 释放球车失败:', e.message); }
      }

      res.json({ success: true, message: '已标记回场，球童/球车已释放' });
    } catch (error) {
      console.error('[Starter] 标记回场失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/starter/:id/complete  标记完赛
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/complete', async (req, res) => {
    try {
      const db = getDb();
      const booking = await getBookingById(db, req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: '预订不存在' });

      await updateBookingStatus(db, req.params.id, booking.status, 'completed', {
        'courseProgress.completeTime': now(),
      }, req.body.operatorName);

      res.json({ success: true, message: '已标记完赛' });
    } catch (error) {
      console.error('[Starter] 标记完赛失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/starter/:id/settle  标记结账
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/settle', async (req, res) => {
    try {
      const db = getDb();
      const booking = await getBookingById(db, req.params.id);
      if (!booking) return res.status(404).json({ success: false, error: '预订不存在' });

      await updateBookingStatus(db, req.params.id, booking.status, 'settled', {
        'courseProgress.settleTime': now(),
      }, req.body.operatorName);

      res.json({ success: true, message: '已标记结账' });
    } catch (error) {
      console.error('[Starter] 标记结账失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/starter/timeline  时间轴/甘特图数据
  // 返回当日所有已调度预订，附带球童/球车占用时段
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/timeline', async (req, res) => {
    try {
      const db = getDb();
      const date = req.query.date || today();
      const _ = db.command;

      const result = await db.collection('bookings')
        .where({
          date,
          status: _.in([
            'dispatched', 'front_9', 'turning', 'back_9',
            'returned', 'completed', 'settled',
          ]),
        })
        .orderBy('teeTime', 'asc')
        .limit(200)
        .get();

      const bookings = result.data || [];

      const caddySlots = {};
      const cartSlots = {};

      bookings.forEach(b => {
        const d = b.dispatch || {};
        const cp = b.courseProgress || {};
        const startTime = d.dispatchTime || `${b.date}T${b.teeTime || '07:00'}`;
        const endTime = cp.returnTime || cp.completeTime || null;

        const slot = {
          bookingId: b._id,
          orderNo: b.orderNo,
          players: b.players?.map(p => p.name).join('、') || '',
          playerCount: b.players?.length || 0,
          teeTime: b.teeTime,
          startHole: d.startHole || 1,
          status: b.status,
          startTime,
          endTime,
          courseName: b.courseName || '',
        };

        if (d.caddyId) {
          const key = d.caddyName || d.caddyId;
          if (!caddySlots[key]) caddySlots[key] = [];
          caddySlots[key].push({ ...slot, resourceId: d.caddyId });
        }

        if (d.cartId) {
          const key = d.cartNo || d.cartId;
          if (!cartSlots[key]) cartSlots[key] = [];
          cartSlots[key].push({ ...slot, resourceId: d.cartId });
        }
      });

      res.json({
        success: true,
        data: { date, bookings, caddySlots, cartSlots },
      });
    } catch (error) {
      console.error('[Starter] 时间轴查询失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  //  球包管理 CRUD（集合: bag_storage）
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/starter/bags  球包列表
  router.get('/bags', async (req, res) => {
    try {
      const db = getDb();
      const { page, pageSize } = parsePage(req.query);
      const { status: bagStatus, keyword } = req.query;

      const cond = {};
      if (bagStatus) cond.status = bagStatus;

      const hasWhere = Object.keys(cond).length > 0;
      const base = hasWhere
        ? db.collection('bag_storage').where(cond)
        : db.collection('bag_storage');

      const result = await base
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      let items = result.data || [];
      if (keyword) {
        const kw = keyword.toLowerCase();
        items = items.filter(b =>
          b.playerName?.toLowerCase().includes(kw) ||
          b.bagNo?.toLowerCase().includes(kw) ||
          b.location?.toLowerCase().includes(kw)
        );
      }

      res.json({ success: true, data: items, total: items.length, page, pageSize });
    } catch (error) {
      console.error('[Starter] 球包列表查询失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/starter/bags/stats  球包统计
  router.get('/bags/stats', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bag_storage').limit(1000).get();
      const bags = result.data || [];

      const stats = { total: bags.length, stored: 0, out: 0, returned: 0 };
      bags.forEach(b => {
        if (b.status === 'stored') stats.stored++;
        else if (b.status === 'out') stats.out++;
        else if (b.status === 'returned') stats.returned++;
      });

      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('[Starter] 球包统计失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/starter/bags  球包入库
  router.post('/bags', async (req, res) => {
    try {
      const db = getDb();
      const { playerName, playerId, bagNo, location, brand, note } = req.body;
      if (!playerName) return res.status(400).json({ success: false, error: '请填写球员姓名' });
      if (!bagNo) return res.status(400).json({ success: false, error: '请填写球包编号' });

      const data = {
        playerName,
        playerId: playerId || null,
        bagNo,
        location: location || '',
        brand: brand || '',
        note: note || '',
        status: 'stored',
        checkInTime: now(),
        checkOutTime: null,
        returnTime: null,
        createTime: new Date(),
        updateTime: new Date(),
      };

      const result = await db.collection('bag_storage').add({ data });
      res.json({ success: true, data: { _id: result._id, ...data }, message: '球包入库成功' });
    } catch (error) {
      console.error('[Starter] 球包入库失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUT /api/starter/bags/:id  更新球包（状态变更 / 信息修改）
  router.put('/bags/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createTime, ...body } = req.body;
      const updateData = { ...body, updateTime: new Date() };

      if (body.status === 'out' && !body.checkOutTime) updateData.checkOutTime = now();
      if (body.status === 'returned' && !body.returnTime) updateData.returnTime = now();

      await db.collection('bag_storage').doc(req.params.id).update({ data: updateData });
      res.json({ success: true, message: '球包信息已更新' });
    } catch (error) {
      console.error('[Starter] 更新球包失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE /api/starter/bags/:id  删除球包记录
  router.delete('/bags/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('bag_storage').doc(req.params.id).remove();
      res.json({ success: true, message: '球包记录已删除' });
    } catch (error) {
      console.error('[Starter] 删除球包失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createStarterRouter;
