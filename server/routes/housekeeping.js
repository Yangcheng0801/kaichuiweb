/**
 * 客房清洁任务管理
 * 集合：housekeeping_tasks
 */
function createHousekeepingRouter(getDb) {
  const express = require('express');
  const router = express.Router();
  const COLLECTION = 'housekeeping_tasks';

  /* ========== GET /api/housekeeping/tasks  任务列表 ========== */
  router.get('/tasks', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', status, floor, priority } = req.query;
      const where = { clubId };
      if (status) where.status = status;
      if (floor) where.floor = floor;
      if (priority) where.priority = priority;

      const r = await db.collection(COLLECTION)
        .where(where)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
      res.json({ success: true, data: r.data || [] });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== POST /api/housekeeping/tasks  创建任务 ========== */
  router.post('/tasks', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', roomId, roomNo, floor,
        taskType = 'checkout_clean', priority = 'normal',
        assignedTo, assignedName, notes,
      } = req.body;
      if (!roomId) return res.status(400).json({ success: false, error: '请选择客房' });

      const now = new Date();
      const doc = {
        clubId, roomId, roomNo: roomNo || '', floor: floor || '',
        taskType, priority, status: 'pending',
        assignedTo: assignedTo || null, assignedName: assignedName || '',
        startedAt: null, completedAt: null, inspectedBy: null, inspectedAt: null,
        notes: notes || '', createdAt: now,
      };
      const r = await db.collection(COLLECTION).add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== PUT /api/housekeeping/tasks/:id/start  开始清洁 ========== */
  router.put('/tasks/:id/start', async (req, res) => {
    try {
      const db = getDb();
      await db.collection(COLLECTION).doc(req.params.id).update({
        status: 'in_progress',
        assignedTo: req.body.assignedTo || null,
        assignedName: req.body.assignedName || '',
        startedAt: new Date(),
      });
      res.json({ success: true, message: '已开始清洁' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== PUT /api/housekeeping/tasks/:id/complete  完成清洁 ========== */
  router.put('/tasks/:id/complete', async (req, res) => {
    try {
      const db = getDb();
      const now = new Date();
      const taskRes = await db.collection(COLLECTION).doc(req.params.id).get();
      const task = (taskRes.data || [])[0] || taskRes.data;

      await db.collection(COLLECTION).doc(req.params.id).update({
        status: 'completed', completedAt: now,
      });

      // 房间状态 → inspected（待查房）
      if (task?.roomId) {
        await db.collection('rooms').doc(task.roomId).update({
          data: { status: 'inspected', updateTime: now },
        });
      }

      res.json({ success: true, message: '清洁完成，待查房' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== PUT /api/housekeeping/tasks/:id/inspect  查房通过 ========== */
  router.put('/tasks/:id/inspect', async (req, res) => {
    try {
      const db = getDb();
      const now = new Date();
      const taskRes = await db.collection(COLLECTION).doc(req.params.id).get();
      const task = (taskRes.data || [])[0] || taskRes.data;

      await db.collection(COLLECTION).doc(req.params.id).update({
        status: 'inspected',
        inspectedBy: req.body.inspectedBy || null,
        inspectedAt: now,
      });

      // 房间状态 → vacant_clean
      if (task?.roomId) {
        await db.collection('rooms').doc(task.roomId).update({
          data: {
            status: 'vacant_clean',
            lastCleaned: {
              cleanedBy: task.assignedTo || null,
              cleanedAt: task.completedAt || now,
              inspectedBy: req.body.inspectedBy || null,
              inspectedAt: now,
            },
            updateTime: now,
          },
        });
      }

      res.json({ success: true, message: '查房通过，客房已就绪' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createHousekeepingRouter;
