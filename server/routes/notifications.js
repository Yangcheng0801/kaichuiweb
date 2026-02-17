/**
 * 通知中心路由
 *
 * 集合：notifications
 *
 * 功能：
 *   - 通知列表（分页、按类型/已读/未读筛选）
 *   - 未读计数
 *   - 标记已读（单条/批量/全部）
 *   - 归档/删除
 *   - 发送通知（管理员系统公告）
 *   - 通知统计
 */
module.exports = function (getDb) {
  const express = require('express');
  const router = express.Router();
  const { NOTIFICATION_TYPES, TYPE_META, send, sendBatch, sendToRole } = require('../utils/notification-engine');

  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';
  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || DEFAULT_CLUB_ID;
  }

  // ══════════════════════════════════════════════════════════════════════
  // GET /api/notifications  通知列表（分页）
  // query: recipientId(必填), category, read(true/false), page, pageSize
  // ══════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const {
        recipientId, recipientRole, category,
        read, archived,
        page = 1, pageSize = 20,
      } = req.query;

      const where = { clubId, archived: archived === 'true' ? true : false };

      if (recipientId) {
        where.recipientId = recipientId;
      } else if (recipientRole) {
        where.recipientRole = recipientRole;
      }

      if (category) where.category = category;
      if (read === 'true') where.read = true;
      if (read === 'false') where.read = false;

      const skip = (Number(page) - 1) * Number(pageSize);

      const [countRes, listRes] = await Promise.all([
        db.collection('notifications').where(where).count(),
        db.collection('notifications').where(where)
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(Number(pageSize))
          .get(),
      ]);

      res.json({
        success: true,
        data: listRes.data || [],
        total: countRes.total || 0,
        page: Number(page),
        pageSize: Number(pageSize),
      });
    } catch (err) {
      console.error('[Notifications] 列表查询失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // GET /api/notifications/unread-count  未读计数
  // query: recipientId(必填)
  // ══════════════════════════════════════════════════════════════════════
  router.get('/unread-count', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { recipientId, recipientRole } = req.query;

      const where = { clubId, read: false, archived: false };
      if (recipientId) where.recipientId = recipientId;
      else if (recipientRole) where.recipientRole = recipientRole;

      const countRes = await db.collection('notifications').where(where).count();

      // 按类别统计
      const allRes = await db.collection('notifications')
        .where(where)
        .limit(500)
        .get();
      const list = allRes.data || [];
      const byCategory = {};
      list.forEach(n => {
        const cat = n.category || 'system';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          total: countRes.total || 0,
          byCategory,
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // GET /api/notifications/:id  通知详情
  // ══════════════════════════════════════════════════════════════════════
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('notifications').doc(req.params.id).get();
      const item = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!item) return res.status(404).json({ success: false, message: '通知不存在' });
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // PUT /api/notifications/:id/read  标记单条已读
  // ══════════════════════════════════════════════════════════════════════
  router.put('/:id/read', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('notifications').doc(req.params.id).update({
        data: { read: true, readAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      });
      res.json({ success: true, message: '已标记已读' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // PUT /api/notifications/read-batch  批量标记已读
  // Body: { ids: string[] } 或 { recipientId: string, markAll: true }
  // ══════════════════════════════════════════════════════════════════════
  router.put('/read-batch', async (req, res) => {
    try {
      const db = getDb();
      const { ids, recipientId, markAll } = req.body;
      const clubId = getClubId(req);
      const now = new Date().toISOString();
      let count = 0;

      if (markAll && recipientId) {
        // 全部标记已读
        const unreadRes = await db.collection('notifications')
          .where({ clubId, recipientId, read: false, archived: false })
          .limit(500)
          .get();
        const unreadList = unreadRes.data || [];
        for (const n of unreadList) {
          await db.collection('notifications').doc(n._id).update({
            data: { read: true, readAt: now, updatedAt: now }
          });
          count++;
        }
      } else if (ids && ids.length > 0) {
        for (const id of ids) {
          try {
            await db.collection('notifications').doc(id).update({
              data: { read: true, readAt: now, updatedAt: now }
            });
            count++;
          } catch { /* skip */ }
        }
      }

      res.json({ success: true, message: `已标记 ${count} 条已读`, data: { count } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // PUT /api/notifications/:id/archive  归档通知
  // ══════════════════════════════════════════════════════════════════════
  router.put('/:id/archive', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('notifications').doc(req.params.id).update({
        data: { archived: true, updatedAt: new Date().toISOString() }
      });
      res.json({ success: true, message: '已归档' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // DELETE /api/notifications/:id  删除通知
  // ══════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('notifications').doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // POST /api/notifications/send  管理员发送通知（系统公告等）
  // Body: { type, title, content, recipientId?, recipientRole?, priority }
  // ══════════════════════════════════════════════════════════════════════
  router.post('/send', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const {
        type = NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
        title, content, recipientId, recipientRole, recipientIds,
        priority = 'normal', sourceId, sourceType, extra,
      } = req.body;

      if (!title) return res.status(400).json({ success: false, message: '标题必填' });

      let result;
      if (recipientIds && recipientIds.length > 0) {
        result = await sendBatch(db, { clubId, type, title, content, recipientIds, priority, sourceId, sourceType, extra });
      } else if (recipientRole) {
        result = await sendToRole(db, { clubId, type, title, content, recipientRole, priority, sourceId, sourceType, extra });
      } else {
        const id = await send(db, { clubId, type, title, content, recipientId, priority, sourceId, sourceType, extra });
        result = { notificationId: id };
      }

      res.json({ success: true, message: '通知已发送', data: result });
    } catch (err) {
      console.error('[Notifications] 发送失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // GET /api/notifications/types  获取通知类型枚举（前端用）
  // ══════════════════════════════════════════════════════════════════════
  router.get('/types/all', async (_req, res) => {
    const types = Object.entries(TYPE_META).map(([key, meta]) => ({
      type: key,
      ...meta,
    }));
    res.json({ success: true, data: types });
  });

  // ══════════════════════════════════════════════════════════════════════
  // GET /api/notifications/stats  通知统计
  // query: recipientId, days(默认30)
  // ══════════════════════════════════════════════════════════════════════
  router.get('/stats/overview', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { recipientId } = req.query;

      const where = { clubId };
      if (recipientId) where.recipientId = recipientId;

      const allRes = await db.collection('notifications')
        .where(where)
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();
      const all = allRes.data || [];

      const total = all.length;
      const unread = all.filter(n => !n.read && !n.archived).length;
      const today = new Date().toISOString().slice(0, 10);
      const todayCount = all.filter(n => (n.createdAt || '').startsWith(today)).length;

      const byCategory = {};
      all.forEach(n => {
        const cat = n.category || 'system';
        if (!byCategory[cat]) byCategory[cat] = { total: 0, unread: 0 };
        byCategory[cat].total++;
        if (!n.read) byCategory[cat].unread++;
      });

      const byPriority = {};
      all.forEach(n => {
        const p = n.priority || 'normal';
        byPriority[p] = (byPriority[p] || 0) + 1;
      });

      res.json({
        success: true,
        data: { total, unread, todayCount, byCategory, byPriority },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
