/**
 * 维修管理路由（与小程序云函数逻辑对齐）
 */

const express = require('express');
const cloud = require('wx-server-sdk');

const CN_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

function getChinaTodayStr() {
  const d = new Date(Date.now() + CN_TZ_OFFSET_MS);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseChinaDateRange(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
  const yy = y || new Date().getFullYear();
  const mm = (m || 1) - 1;
  const dd = d || 1;
  const startMs = Date.UTC(yy, mm, dd, 0, 0, 0, 0) - CN_TZ_OFFSET_MS;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { start: new Date(startMs), end: new Date(endMs) };
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function createMaintenanceRouter(getDb, requireAuthWithClubId) {
  const router = express.Router();
  router.use(requireAuthWithClubId);

  // GET /api/maintenance - 维修记录列表
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const _ = (db && db.command) ? db.command : cloud.database().command;
      const clubId = req.clubId;
      const { status = 'all', limit = 20, skip = 0, date } = req.query;
      const dateStr = (date && String(date).trim()) || '';
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skipNum = Math.max(0, parseInt(skip, 10) || 0);

      let whereCondition = { clubId };
      if (status && status !== 'all') {
        whereCondition.status = status;
      }
      if (dateStr) {
        const { start, end } = parseChinaDateRange(dateStr);
        whereCondition.reportTime = _.gte(start).and(_.lte(end));
      }

      const [recordsRes, countRes] = await Promise.all([
        db.collection('maintenance_records')
          .where(whereCondition)
          .orderBy('reportTime', 'desc')
          .skip(skipNum)
          .limit(limitNum)
          .get(),
        db.collection('maintenance_records').where(whereCondition).count()
      ]);

      const records = (recordsRes.data || []).map(record => {
        const completedTime = record.completedTime || record.completionTime;
        let duration = '--';
        if (record.reportTime && completedTime) {
          const durationMs = new Date(completedTime) - new Date(record.reportTime);
          const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor((durationMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          duration = days > 0 ? `${days}天${hours}小时` : `${hours}小时`;
        }
        return {
          _id: record._id,
          id: record._id,
          cartId: record.cartId,
          cartNumber: record.cartNumber,
          cartBrand: record.cartBrand,
          faultType: record.faultType || '其他',
          faultDescription: record.faultDescription,
          reportTime: formatDate(record.reportTime),
          reportPerson: record.reportPerson || record.reporterDisplay || '未知',
          status: record.status || 'ongoing',
          completedTime: completedTime ? formatDate(completedTime) : null,
          maintenancePerson: record.maintenancePerson,
          totalCost: record.totalCost || 0,
          partsUsed: record.partsUsed || [],
          duration,
          solution: record.solution || ''
        };
      });

      const statsWhere = dateStr ? whereCondition : { clubId };
      const statsRes = await db.collection('maintenance_records').where(statsWhere).get();
      const stats = { total: countRes.total, ongoing: 0, completed: 0, totalCost: 0 };
      (statsRes.data || []).forEach(r => {
        if (r.status === 'completed') {
          stats.completed++;
          stats.totalCost += (r.totalCost || 0);
        } else {
          stats.ongoing++;
        }
      });

      res.json({ success: true, data: records, total: countRes.total, stats });
    } catch (error) {
      console.error('[Maintenance] 获取维修记录失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // PUT /api/maintenance/:id/complete - 完成维修
  router.put('/:id/complete', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.clubId;
      const { id } = req.params;
      const { notes, cost } = req.body || {};

      const recordRes = await db.collection('maintenance_records').doc(id).get();
      const record = recordRes.data && (Array.isArray(recordRes.data) ? recordRes.data[0] : recordRes.data);
      if (!record) {
        return res.status(404).json({ success: false, message: '维修记录不存在' });
      }
      if (record.clubId && record.clubId !== clubId) {
        return res.status(403).json({ success: false, message: '无权限' });
      }
      const cartId = record.cartId;
      if (!cartId) {
        return res.status(400).json({ success: false, message: '该维修记录未关联球车' });
      }

      const updateData = {
        status: 'completed',
        completionTime: db.serverDate ? db.serverDate() : new Date(),
        notes: notes || '',
        totalCost: cost || 0
      };
      await db.collection('maintenance_records').doc(id).update({ data: updateData });
      await db.collection('carts').doc(cartId).update({
        data: { status: 'notCheckedOut', updatedAt: db.serverDate ? db.serverDate() : new Date() }
      });

      res.json({ success: true, message: '维修已完成，球车状态已恢复' });
    } catch (error) {
      console.error('[Maintenance] 完成维修失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET /api/maintenance/fault-analysis - 故障类型分析（按 faultType 聚合）
  router.get('/fault-analysis', async (req, res) => {
    try {
      const db = getDb();
      const _ = (db && db.command) ? db.command : cloud.database().command;
      const clubId = req.clubId;
      const dateStr = (req.query.date && String(req.query.date).trim()) || getChinaTodayStr();
      const { start, end } = parseChinaDateRange(dateStr);

      const recordsRes = await db.collection('maintenance_records')
        .where({
          clubId,
          reportTime: _.gte(start).and(_.lte(end))
        })
        .get();
      const records = recordsRes.data || [];

      const total = records.length;
      const byType = {};
      records.forEach(r => {
        const t = r.faultType || '其他';
        byType[t] = (byType[t] || 0) + 1;
      });

      const result = Object.entries(byType).map(([name, count]) => ({
        name,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0
      })).sort((a, b) => b.count - a.count);

      res.json({ success: true, data: result, total });
    } catch (error) {
      console.error('[Maintenance] 故障分析失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET /api/maintenance/fault-types - 获取故障类型列表（用于报修表单）
  router.get('/fault-types', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.clubId;
      const res0 = await db.collection('cart_fault_types')
        .where({ clubId })
        .orderBy('useCount', 'desc')
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();
      let types = (res0.data || []).map(t => t.name || '').filter(Boolean);
      const defaultTypes = ['无法充电', '上坡无力', '车轮异响', '行驶抖动', '灯光不亮'];
      types = [...new Set([...defaultTypes, ...types])];
      res.json({ success: true, data: types });
    } catch (error) {
      console.error('[Maintenance] 获取故障类型失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = createMaintenanceRouter;
