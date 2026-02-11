/**
 * 预订管理路由（前台代订模式）
 *
 * 业务流程：
 *   创建预订 → confirmed → checked_in（签到）→ completed（完赛）
 *                       → cancelled（取消，含退还球童状态）
 *
 * 球童联动：
 *   创建预订时若指定 caddyId → 球童状态改为 busy
 *   取消/变更球童时           → 旧球童改回 available
 *
 * @param {Function} getDb - 由 app.js 注入
 */
function createBookingsRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  // ─── 状态常量 ────────────────────────────────────────────────────────────────
  const BOOKING_STATUS = {
    PENDING:     'pending',      // 待确认
    CONFIRMED:   'confirmed',    // 已确认
    CHECKED_IN:  'checked_in',   // 已签到
    COMPLETED:   'completed',    // 已完赛
    CANCELLED:   'cancelled',    // 已取消
  };

  // ─── 工具：释放球童（改回 available）───────────────────────────────────────
  async function releaseCaddy(db, caddyId) {
    if (!caddyId) return;
    try {
      await db.collection('caddies').doc(caddyId).update({
        data: { status: 'available', updateTime: new Date() }
      });
      console.log(`[Bookings] 球童 ${caddyId} 已释放`);
    } catch (e) {
      console.warn(`[Bookings] 释放球童失败 ${caddyId}:`, e.message);
    }
  }

  // ─── 工具：占用球童（改为 busy）────────────────────────────────────────────
  async function occupyCaddy(db, caddyId) {
    if (!caddyId) return;
    try {
      await db.collection('caddies').doc(caddyId).update({
        data: { status: 'busy', updateTime: new Date() }
      });
      console.log(`[Bookings] 球童 ${caddyId} 已占用`);
    } catch (e) {
      console.warn(`[Bookings] 占用球童失败 ${caddyId}:`, e.message);
    }
  }

  // ─── 工具：分页参数解析 ─────────────────────────────────────────────────────
  function parsePage(query) {
    let page = parseInt(query.page, 10);
    let pageSize = parseInt(query.pageSize, 10);
    page = Number.isFinite(page) && page > 0 ? page : 1;
    pageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;
    return { page, pageSize };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/bookings/tee-sheet  发球表（某天某球场的全部预订，按时间排序）
  // query: date（YYYY-MM-DD 必填）, courseId（可选）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/tee-sheet', async (req, res) => {
    try {
      const db = getDb();
      const { date, courseId } = req.query;
      if (!date) return res.status(400).json({ success: false, error: '请传入 date 参数（YYYY-MM-DD）' });

      const cond = { date };
      if (courseId) cond.courseId = courseId;

      const result = await db.collection('bookings')
        .where(cond)
        .orderBy('teeTime', 'asc')
        .limit(100)
        .get();

      res.json({ success: true, data: result.data, date, courseId: courseId || null });
    } catch (error) {
      console.error('[Bookings] 获取发球表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/bookings  预订列表（分页 + 多维筛选）
  // query: page, pageSize, status, date, courseId, caddyId
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { page, pageSize } = parsePage(req.query);
      const { status, date, courseId, caddyId } = req.query;

      const cond = {};
      if (status)   cond.status   = status;
      if (date)     cond.date     = date;
      if (courseId) cond.courseId = courseId;
      if (caddyId)  cond.caddyId  = caddyId;

      const hasWhere = Object.keys(cond).length > 0;
      const base = hasWhere
        ? db.collection('bookings').where(cond)
        : db.collection('bookings');

      const result = await base
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      res.json({ success: true, data: result.data, total: result.data.length, page, pageSize });
    } catch (error) {
      console.error('[Bookings] 获取预订列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/bookings/:id  预订详情
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bookings').doc(req.params.id).get();
      const item = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!item) return res.status(404).json({ success: false, error: '预订记录不存在' });
      res.json({ success: true, data: item });
    } catch (error) {
      console.error('[Bookings] 获取预订详情失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/bookings  创建预订
  // Body 必填：date, teeTime, courseId, courseName, players(array)
  // Body 可选：caddyId, caddyName, caddyFee, cartId, cartNo, cartFee,
  //            note, source, createdBy, clubId
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const { date, teeTime, courseId, courseName, players } = req.body;

      // 基础参数校验
      if (!date)       return res.status(400).json({ success: false, error: '请填写预订日期' });
      if (!teeTime)    return res.status(400).json({ success: false, error: '请填写发球时间' });
      if (!courseId)   return res.status(400).json({ success: false, error: '请选择球场' });
      if (!players || !Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ success: false, error: '请至少填写一位球员' });
      }

      const {
        caddyId = null, caddyName = '', caddyFee = 0,
        cartId = null,  cartNo   = '', cartFee  = 0,
        note = '', source = 'staff', createdBy = '',
        clubId = 'default'
      } = req.body;

      const bookingData = {
        // 核心信息
        date, teeTime, courseId, courseName,
        players,          // [{ name, type: 'member'|'guest', phone?, memberId? }]
        playerCount: players.length,
        // 球童
        caddyId, caddyName, caddyFee,
        // 球车
        cartId, cartNo, cartFee,
        // 费用（由前端计算后传入，后续可改为服务端计算）
        totalFee: req.body.totalFee || 0,
        // 元数据
        status: BOOKING_STATUS.CONFIRMED,
        source,           // 'staff'（前台代订）| 'miniprogram'（小程序，预留）
        note,
        createdBy,
        clubId,
        createTime: new Date(),
        updateTime: new Date(),
      };

      const result = await db.collection('bookings').add({ data: bookingData });

      // 占用球童
      if (caddyId) await occupyCaddy(db, caddyId);

      res.json({ success: true, data: { _id: result._id, ...bookingData }, message: '预订创建成功' });
    } catch (error) {
      console.error('[Bookings] 创建预订失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/bookings/:id  更新预订（改信息 / 改状态）
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;

      // 取旧记录（用于球童联动对比）
      const oldResult = await db.collection('bookings').doc(id).get();
      const old = Array.isArray(oldResult.data) ? oldResult.data[0] : oldResult.data;
      if (!old) return res.status(404).json({ success: false, error: '预订记录不存在' });

      const { _id, createTime, ...fields } = req.body;
      const updateData = { ...fields, updateTime: new Date() };

      await db.collection('bookings').doc(id).update({ data: updateData });

      // ── 球童联动 ──────────────────────────────────────────────────────────────
      const newCaddyId = fields.caddyId !== undefined ? fields.caddyId : old.caddyId;
      const oldCaddyId = old.caddyId;

      if (oldCaddyId !== newCaddyId) {
        // 球童换人：释放旧的，占用新的
        await releaseCaddy(db, oldCaddyId);
        await occupyCaddy(db, newCaddyId);
      }

      // 取消预订时也释放球童
      if (fields.status === BOOKING_STATUS.CANCELLED && old.status !== BOOKING_STATUS.CANCELLED) {
        await releaseCaddy(db, newCaddyId || oldCaddyId);
      }

      // 完赛后释放球童
      if (fields.status === BOOKING_STATUS.COMPLETED && old.status !== BOOKING_STATUS.COMPLETED) {
        await releaseCaddy(db, newCaddyId || oldCaddyId);
      }

      res.json({ success: true, message: '预订更新成功' });
    } catch (error) {
      console.error('[Bookings] 更新预订失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE /api/bookings/:id  删除预订（仅限已取消的记录）
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;

      const oldResult = await db.collection('bookings').doc(id).get();
      const old = Array.isArray(oldResult.data) ? oldResult.data[0] : oldResult.data;
      if (!old) return res.status(404).json({ success: false, error: '预订记录不存在' });

      // 删除前确保球童释放（防止状态残留）
      if (old.status !== BOOKING_STATUS.CANCELLED && old.status !== BOOKING_STATUS.COMPLETED) {
        await releaseCaddy(db, old.caddyId);
      }

      await db.collection('bookings').doc(id).remove();
      res.json({ success: true, message: '预订已删除' });
    } catch (error) {
      console.error('[Bookings] 删除预订失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createBookingsRouter;
