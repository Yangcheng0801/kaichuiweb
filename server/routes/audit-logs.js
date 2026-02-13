/**
 * 审计日志路由
 * 提供审计日志查询和记录功能
 */
const express = require('express');

module.exports = function (getDb) {
  const router = express.Router();
  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || req.clubId || DEFAULT_CLUB_ID;
  }

  /* ==================== 查询审计日志 ==================== */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { module, action, operatorId, startDate, endDate, page = 1, pageSize = 50 } = req.query;

      let query = db.collection('audit_logs').where({ clubId });

      // TCB 不支持复合 where，先查全量再过滤
      const logsRes = await query
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();

      let logs = logsRes.data || [];

      // 过滤
      if (module) logs = logs.filter(l => l.module === module);
      if (action) logs = logs.filter(l => l.action === action);
      if (operatorId) logs = logs.filter(l => l.operatorId === operatorId);
      if (startDate) logs = logs.filter(l => (l.createdAt || '').toString().slice(0, 10) >= startDate);
      if (endDate) logs = logs.filter(l => (l.createdAt || '').toString().slice(0, 10) <= endDate);

      const total = logs.length;
      const p = Math.max(1, Number(page));
      const ps = Math.min(100, Math.max(1, Number(pageSize)));
      const paged = logs.slice((p - 1) * ps, p * ps);

      res.json({
        success: true,
        data: {
          list: paged,
          total,
          page: p,
          pageSize: ps,
          totalPages: Math.ceil(total / ps)
        }
      });
    } catch (err) {
      console.error('[AuditLogs] 查询失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 记录审计日志（内部调用或 API） ==================== */
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { module, action, targetId, targetType, description, details, operatorId, operatorName } = req.body;

      if (!module || !action) {
        return res.status(400).json({ success: false, message: '模块和操作必填' });
      }

      const now = new Date().toISOString();
      const result = await db.collection('audit_logs').add({
        data: {
          clubId,
          module,
          action,
          targetId: targetId || null,
          targetType: targetType || null,
          description: description || '',
          details: details || null,
          operatorId: operatorId || req.userId || null,
          operatorName: operatorName || '',
          ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '',
          userAgent: (req.headers['user-agent'] || '').slice(0, 200),
          createdAt: now
        }
      });

      res.json({ success: true, data: { _id: result._id } });
    } catch (err) {
      console.error('[AuditLogs] 记录失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 审计日志统计 ==================== */
  router.get('/stats', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { days = 7 } = req.query;

      const since = new Date(Date.now() - Number(days) * 86400000).toISOString().slice(0, 10);

      const logsRes = await db.collection('audit_logs')
        .where({ clubId })
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();

      const logs = (logsRes.data || []).filter(l =>
        (l.createdAt || '').toString().slice(0, 10) >= since
      );

      const byModule = {};
      const byAction = {};
      const byDay = {};
      logs.forEach(l => {
        byModule[l.module] = (byModule[l.module] || 0) + 1;
        byAction[l.action] = (byAction[l.action] || 0) + 1;
        const d = (l.createdAt || '').toString().slice(0, 10);
        byDay[d] = (byDay[d] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          total: logs.length,
          byModule,
          byAction,
          byDay,
          recentDays: Number(days)
        }
      });
    } catch (err) {
      console.error('[AuditLogs] 统计失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
