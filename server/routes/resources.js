/**
 * 资源管理路由
 * 包含：球场（courses）、球童（caddies）、球车（carts）
 * 三个集合均支持完整 CRUD + 分页查询
 *
 * @param {Function} getDb - 由 app.js 注入的 getDb()
 */
function createResourcesRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  // ─── 工具函数 ───────────────────────────────────────────────────────────────

  function parsePage(query) {
    let page = parseInt(query.page, 10);
    let pageSize = parseInt(query.pageSize, 10);
    page = Number.isFinite(page) && page > 0 ? page : 1;
    pageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;
    return { page, pageSize };
  }

  /**
   * 通用 CRUD 路由工厂，为每个集合生成标准的增删改查端点
   * @param {string} collection - TCB 集合名
   * @param {string} label - 中文名（用于错误提示）
   */
  function mountCrud(collection, label) {

    // GET / - 列表（支持分页、status 筛选、clubId 筛选）
    router.get(`/${collection}`, async (req, res) => {
      try {
        const db = getDb();
        const { page, pageSize } = parsePage(req.query);
        const { status, clubId } = req.query;

        const cond = {};
        if (status) cond.status = status;
        if (clubId) cond.clubId = clubId;

        const hasWhere = Object.keys(cond).length > 0;
        const base = hasWhere ? db.collection(collection).where(cond) : db.collection(collection);

        const result = await base
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get();

        res.json({ success: true, data: result.data, total: result.data.length, page, pageSize });
      } catch (error) {
        console.error(`[Resources] 获取${label}列表失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /:collection/:id - 详情
    router.get(`/${collection}/:id`, async (req, res) => {
      try {
        const db = getDb();
        const result = await db.collection(collection).doc(req.params.id).get();
        const item = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!item) return res.status(404).json({ success: false, error: `${label}不存在` });
        res.json({ success: true, data: item });
      } catch (error) {
        console.error(`[Resources] 获取${label}详情失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // POST /:collection - 创建
    router.post(`/${collection}`, async (req, res) => {
      try {
        const db = getDb();
        const { _id, ...body } = req.body;
        const data = { ...body, createTime: new Date(), updateTime: new Date() };
        const result = await db.collection(collection).add({ data });
        res.json({ success: true, data: { _id: result._id, ...data }, message: `${label}创建成功` });
      } catch (error) {
        console.error(`[Resources] 创建${label}失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // PUT /:collection/:id - 更新
    router.put(`/${collection}/:id`, async (req, res) => {
      try {
        const db = getDb();
        const { _id, createTime, ...body } = req.body;
        const data = { ...body, updateTime: new Date() };
        await db.collection(collection).doc(req.params.id).update({ data });
        res.json({ success: true, message: `${label}更新成功` });
      } catch (error) {
        console.error(`[Resources] 更新${label}失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // DELETE /:collection/:id - 删除
    router.delete(`/${collection}/:id`, async (req, res) => {
      try {
        const db = getDb();
        await db.collection(collection).doc(req.params.id).remove();
        res.json({ success: true, message: `${label}删除成功` });
      } catch (error) {
        console.error(`[Resources] 删除${label}失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  // ─── 挂载三个资源集合 ─────────────────────────────────────────────────────────
  mountCrud('courses', '球场');

  // 球童点号可用性校验（需在 mountCrud caddies/:id 之前注册）
  router.get('/caddies/check-availability', async (req, res) => {
    try {
      const db = getDb();
      const { caddyId, date, teeTime, bookingId } = req.query;
      if (!caddyId || !date || !teeTime) {
        return res.status(400).json({ success: false, error: '请传入 caddyId、date、teeTime' });
      }

      // 1. 球童存在且状态可用（available/reserved 可被点号，busy 不可）
      const caddyRes = await db.collection('caddies').doc(caddyId).get();
      const caddy = Array.isArray(caddyRes.data) ? caddyRes.data[0] : caddyRes.data;
      if (!caddy) {
        return res.json({ success: true, available: false, reason: '球童不存在' });
      }
      if (caddy.status === 'busy') {
        return res.json({ success: true, available: false, reason: '球童已在场上服务' });
      }

      // 2. 时间重叠校验：18洞约 4.5 小时 + 球童周转缓冲区（回场后需洗澡/补给/换包）
      const CADDY_TURNOVER_BUFFER = 20; // 分钟
      const teeHour = parseInt(teeTime.split(':')[0], 10);
      const teeMin = parseInt(teeTime.split(':')[1] || '0', 10);
      const slotStart = teeHour * 60 + teeMin;
      const slotEnd = slotStart + 270; // 4.5h = 270min

      const bookingsRes = await db.collection('bookings')
        .where({ date })
        .limit(500)
        .get();

      const bookings = (bookingsRes.data || []).filter(b => {
        const cid = b.caddyDesignation?.caddyId || b.caddyId || b.assignedResources?.caddyId;
        return cid === caddyId && b.status !== 'cancelled' && b.status !== 'settled' && b._id !== bookingId;
      });

      for (const b of bookings) {
        const [bh, bm] = (b.teeTime || '08:00').split(':').map(Number);
        const bStart = bh * 60 + bm;
        const bEnd = bStart + 270;
        // 冲突条件：新时段开始 < 前一场结束 + 缓冲区，且新时段结束 > 前一场开始
        if (slotStart < bEnd + CADDY_TURNOVER_BUFFER && slotEnd > bStart) {
          return res.json({
            success: true,
            available: false,
            reason: `该时段已与订单 ${b.orderNo || b._id} 冲突（含${CADDY_TURNOVER_BUFFER}分钟周转缓冲）`,
          });
        }
      }

      res.json({ success: true, available: true, caddy: { _id: caddy._id, caddyNo: caddy.caddyNo || caddy.no, name: caddy.name, level: caddy.level } });
    } catch (error) {
      console.error('[Resources] 球童可用性校验失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 球童批量可用性（用于列表置灰展示，避免 N+1 请求）
  router.get('/caddies/availability-map', async (req, res) => {
    try {
      const db = getDb();
      const { date, teeTime, bookingId, clubId } = req.query;
      if (!date || !teeTime) {
        return res.status(400).json({ success: false, error: '请传入 date、teeTime' });
      }

      const CADDY_TURNOVER_BUFFER = 20;
      const teeHour = parseInt(teeTime.split(':')[0], 10);
      const teeMin = parseInt(teeTime.split(':')[1] || '0', 10);
      const slotStart = teeHour * 60 + teeMin;
      const slotEnd = slotStart + 270;

      const caddyCond = clubId ? { clubId } : {};
      const [caddiesRes, bookingsRes] = await Promise.all([
        Object.keys(caddyCond).length > 0
          ? db.collection('caddies').where(caddyCond).limit(200).get()
          : db.collection('caddies').limit(200).get(),
        db.collection('bookings').where({ date }).limit(500).get(),
      ]);

      const caddies = caddiesRes.data || [];
      const bookings = (bookingsRes.data || []).filter(b =>
        b.status !== 'cancelled' && b.status !== 'settled' && b._id !== bookingId
      );

      const map = {};
      for (const c of caddies) {
        const cid = c._id;
        if (c.status === 'busy') {
          map[cid] = { available: false, reason: '已在场上服务' };
          continue;
        }
        const conflictBooking = bookings.find(b => {
          const cid2 = b.caddyDesignation?.caddyId || b.caddyId || b.assignedResources?.caddyId;
          if (cid2 !== cid) return false;
          const [bh, bm] = (b.teeTime || '08:00').split(':').map(Number);
          const bStart = bh * 60 + bm;
          const bEnd = bStart + 270;
          return slotStart < bEnd + CADDY_TURNOVER_BUFFER && slotEnd > bStart;
        });
        if (conflictBooking) {
          map[cid] = { available: false, reason: '已点满' };
        } else {
          map[cid] = { available: true };
        }
      }

      res.json({ success: true, data: map });
    } catch (error) {
      console.error('[Resources] 批量可用性查询失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  mountCrud('caddies', '球童');
  mountCrud('carts',   '球车');

  return router;
}

module.exports = createResourcesRouter;
