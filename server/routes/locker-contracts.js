/**
 * 更衣柜租赁合同管理
 * 集合：locker_contracts
 *
 * 功能：合同 CRUD / 续约 / 终止 / 到期提醒
 */
function createLockerContractsRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  const COLLECTION = 'locker_contracts';

  /* ---------- 生成合同编号 ---------- */
  async function generateContractNo(db, clubId) {
    const d = new Date();
    const y = d.getFullYear();
    const prefix = `LC${y}`;
    try {
      const cnt = await db.collection(COLLECTION)
        .where({ clubId, contractNo: db.RegExp({ regexp: `^${prefix}`, options: '' }) })
        .count();
      return `${prefix}${String((cnt.total || 0) + 1).padStart(4, '0')}`;
    } catch {
      return `${prefix}${String(Date.now()).slice(-6)}`;
    }
  }

  /* ========== GET /api/locker-contracts  合同列表 ========== */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', status, rentalType, page = 1, pageSize = 50 } = req.query;
      const where = { clubId };
      if (status) where.status = status;
      if (rentalType) where.rentalType = rentalType;

      const list = await db.collection(COLLECTION)
        .where(where)
        .orderBy('createdAt', 'desc')
        .skip((Number(page) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .get();

      res.json({ success: true, data: list.data || [] });
    } catch (error) {
      console.error('[LockerContracts] 列表查询失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== GET /api/locker-contracts/expiring  即将到期 ========== */
  router.get('/expiring', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', days = 30 } = req.query;
      const now = new Date();
      const deadline = new Date(now.getTime() + Number(days) * 86400000);
      const deadlineStr = deadline.toISOString().slice(0, 10);

      // 查询 active 且 endDate <= deadline
      const all = await db.collection(COLLECTION)
        .where({ clubId, status: 'active' })
        .limit(500)
        .get();

      const expiring = (all.data || []).filter(c => c.endDate && c.endDate <= deadlineStr);
      res.json({ success: true, data: expiring });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== POST /api/locker-contracts  创建合同 ========== */
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default', lockerId, lockerNo,
        tenantId, tenantName, tenantPhone,
        rentalType = 'annual', startDate, endDate,
        fee = 0, paymentStatus = 'unpaid',
        renewalRemindDays = 30,
      } = req.body;

      if (!lockerId || !lockerNo) return res.status(400).json({ success: false, error: '请选择更衣柜' });
      if (!tenantName) return res.status(400).json({ success: false, error: '租户姓名不能为空' });

      const contractNo = await generateContractNo(db, clubId);
      const now = new Date();

      const doc = {
        clubId, contractNo, lockerId, lockerNo,
        tenantId: tenantId || null, tenantName, tenantPhone: tenantPhone || '',
        rentalType, startDate: startDate || now.toISOString().slice(0, 10),
        endDate: endDate || '',
        fee: Number(fee), paymentStatus,
        status: 'active',
        renewalRemindDays: Number(renewalRemindDays),
        renewalReminded: false,
        previousContractId: null,
        createdAt: now, updatedAt: now,
      };

      const r = await db.collection(COLLECTION).add(doc);
      const contractId = r.id || r._id;

      // 更新 locker 的租赁信息
      await db.collection('lockers').doc(lockerId).update({
        data: {
          rentalType,
          currentContract: {
            contractId,
            tenantId: tenantId || null,
            tenantName,
            startDate: doc.startDate,
            endDate: doc.endDate,
            monthlyFee: rentalType === 'monthly' ? Number(fee) : Math.round(Number(fee) / 12),
          },
          status: 'occupied',
          currentPlayerName: tenantName,
          updateTime: now,
        }
      });

      // 记录日志
      await db.collection('locker_usage_logs').add({
        clubId, lockerId, lockerNo,
        action: 'contract_created',
        playerId: tenantId || null, playerName: tenantName,
        bookingId: null, contractId,
        keyNo: '', operatorId: null, operatorName: '',
        actionTime: now,
        note: `创建${rentalType === 'annual' ? '年租' : '月租'}合同 ${contractNo}`,
        createdAt: now,
      });

      res.json({ success: true, data: { _id: contractId, ...doc }, message: '合同创建成功' });
    } catch (error) {
      console.error('[LockerContracts] 创建失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== PUT /api/locker-contracts/:id  更新合同 ========== */
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...body } = req.body;
      await db.collection(COLLECTION).doc(req.params.id).update({
        ...body,
        updatedAt: new Date(),
      });
      res.json({ success: true, message: '合同更新成功' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== POST /api/locker-contracts/:id/renew  续约 ========== */
  router.post('/:id/renew', async (req, res) => {
    try {
      const db = getDb();
      const oldRes = await db.collection(COLLECTION).doc(req.params.id).get();
      const old = (oldRes.data || [])[0] || oldRes.data;
      if (!old) return res.status(404).json({ success: false, error: '合同不存在' });

      const { startDate, endDate, fee, rentalType } = req.body;
      const now = new Date();
      const newContractNo = await generateContractNo(db, old.clubId);

      // 终止旧合同
      await db.collection(COLLECTION).doc(req.params.id).update({
        status: 'expired', updatedAt: now,
      });

      // 创建新合同
      const newDoc = {
        clubId: old.clubId, contractNo: newContractNo,
        lockerId: old.lockerId, lockerNo: old.lockerNo,
        tenantId: old.tenantId, tenantName: old.tenantName, tenantPhone: old.tenantPhone,
        rentalType: rentalType || old.rentalType,
        startDate: startDate || old.endDate,
        endDate: endDate || '',
        fee: fee !== undefined ? Number(fee) : old.fee,
        paymentStatus: 'unpaid', status: 'active',
        renewalRemindDays: old.renewalRemindDays,
        renewalReminded: false,
        previousContractId: req.params.id,
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection(COLLECTION).add(newDoc);
      const newId = r.id || r._id;

      // 更新 locker
      await db.collection('lockers').doc(old.lockerId).update({
        data: {
          currentContract: {
            contractId: newId,
            tenantId: old.tenantId, tenantName: old.tenantName,
            startDate: newDoc.startDate, endDate: newDoc.endDate,
            monthlyFee: newDoc.rentalType === 'monthly' ? newDoc.fee : Math.round(newDoc.fee / 12),
          },
          updateTime: now,
        }
      });

      res.json({ success: true, data: { _id: newId, ...newDoc }, message: '续约成功' });
    } catch (error) {
      console.error('[LockerContracts] 续约失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /* ========== POST /api/locker-contracts/:id/terminate  终止 ========== */
  router.post('/:id/terminate', async (req, res) => {
    try {
      const db = getDb();
      const now = new Date();
      const contractRes = await db.collection(COLLECTION).doc(req.params.id).get();
      const contract = (contractRes.data || [])[0] || contractRes.data;
      if (!contract) return res.status(404).json({ success: false, error: '合同不存在' });

      await db.collection(COLLECTION).doc(req.params.id).update({
        status: 'terminated', updatedAt: now,
      });

      // 释放 locker
      await db.collection('lockers').doc(contract.lockerId).update({
        data: {
          rentalType: 'daily',
          currentContract: null,
          status: 'available',
          currentBookingId: null,
          currentPlayerName: null,
          updateTime: now,
        }
      });

      // 日志
      await db.collection('locker_usage_logs').add({
        clubId: contract.clubId, lockerId: contract.lockerId, lockerNo: contract.lockerNo,
        action: 'contract_terminated',
        playerId: contract.tenantId, playerName: contract.tenantName,
        bookingId: null, contractId: req.params.id,
        keyNo: '', operatorId: null, operatorName: '',
        actionTime: now,
        note: `终止合同 ${contract.contractNo}`,
        createdAt: now,
      });

      res.json({ success: true, message: '合同已终止，更衣柜已释放' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createLockerContractsRouter;
