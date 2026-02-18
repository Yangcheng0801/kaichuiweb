/**
 * 员工排班与考勤路由
 *
 * 集合：
 *   employees           — 员工档案
 *   departments         — 部门
 *   shift_templates     — 班次模板
 *   schedules           — 排班记录（日期 + 员工 + 班次）
 *   attendance_records  — 考勤记录
 *   leave_requests      — 请假申请
 *   shift_swap_requests — 换班申请
 *
 * @param {Function} getDb
 */
module.exports = function (getDb) {
  const express = require('express');
  const router = express.Router();

  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';
  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || DEFAULT_CLUB_ID;
  }

  // 通知引擎（惰性加载）
  let _ne = null;
  function getNotify() {
    if (!_ne) { try { _ne = require('../utils/notification-engine'); } catch (_) {} }
    return _ne;
  }

  // ══════════════════════════════════════════════════════════════════════
  //                          部 门 管 理
  // ══════════════════════════════════════════════════════════════════════

  router.get('/departments', async (req, res) => {
    try {
      const db = getDb();
      const r = await db.collection('departments').where({ clubId: getClubId(req) }).orderBy('sortOrder', 'asc').limit(50).get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.post('/departments', async (req, res) => {
    try {
      const db = getDb();
      const { name, headName, headPhone, description, sortOrder } = req.body;
      if (!name) return res.status(400).json({ success: false, message: '部门名称必填' });
      const now = new Date().toISOString();
      const doc = {
        clubId: getClubId(req), name,
        headName: headName || '', headPhone: headPhone || '',
        description: description || '', sortOrder: Number(sortOrder) || 0,
        employeeCount: 0, status: 'active',
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('departments').add({ data: doc });
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.put('/departments/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, employeeCount, ...fields } = req.body;
      fields.updatedAt = new Date().toISOString();
      await db.collection('departments').doc(req.params.id).update({ data: fields });
      res.json({ success: true, message: '更新成功' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.delete('/departments/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('departments').doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                         员 工 档 案
  // ══════════════════════════════════════════════════════════════════════

  async function generateEmpNo(db, clubId) {
    const now = new Date();
    const prefix = `EMP${String(now.getFullYear()).slice(-2)}`;
    const existing = await db.collection('employees').where({ clubId }).orderBy('createdAt', 'desc').limit(1).get();
    let seq = 1;
    if (existing.data?.length > 0) {
      const last = existing.data[0].empNo || '';
      const m = last.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `${prefix}-${String(seq).padStart(4, '0')}`;
  }

  router.get('/employees', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { departmentId, position, status, keyword, page = 1, pageSize = 30 } = req.query;
      const skip = (Number(page) - 1) * Number(pageSize);
      const where = { clubId };
      if (departmentId) where.departmentId = departmentId;
      if (position) where.position = position;
      if (status) where.status = status;

      const [countRes, listRes] = await Promise.all([
        db.collection('employees').where(where).count(),
        db.collection('employees').where(where).orderBy('createdAt', 'desc').skip(skip).limit(Number(pageSize)).get(),
      ]);
      let list = listRes.data || [];
      if (keyword) {
        const kw = keyword.toLowerCase();
        list = list.filter(e =>
          (e.name || '').toLowerCase().includes(kw) ||
          (e.empNo || '').toLowerCase().includes(kw) ||
          (e.phone || '').includes(kw)
        );
      }
      res.json({ success: true, data: list, total: countRes.total || 0 });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.get('/employees/:id', async (req, res) => {
    try {
      const db = getDb();
      const r = await db.collection('employees').doc(req.params.id).get();
      const item = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!item) return res.status(404).json({ success: false, message: '员工不存在' });
      res.json({ success: true, data: item });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.post('/employees', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const {
        name, phone, gender, idCard, avatar,
        departmentId, departmentName, position, skills,
        contractType, hireDate, hourlyRate, baseSalary, outingFee,
        emergencyContact, emergencyPhone, address, notes,
      } = req.body;
      if (!name) return res.status(400).json({ success: false, message: '姓名必填' });

      const empNo = await generateEmpNo(db, clubId);
      const now = new Date().toISOString();
      const doc = {
        clubId, empNo, name,
        phone: phone || '', gender: gender || '',
        idCard: idCard || '', avatar: avatar || '',
        departmentId: departmentId || null,
        departmentName: departmentName || '',
        position: position || '',
        skills: skills || [],
        contractType: contractType || 'fulltime',
        hireDate: hireDate || now.slice(0, 10),
        hourlyRate: Number(hourlyRate) || 0,
        baseSalary: Number(baseSalary) || 0,
        outingFee: Number(outingFee) || 0,
        emergencyContact: emergencyContact || '',
        emergencyPhone: emergencyPhone || '',
        address: address || '',
        notes: notes || '',
        // 统计
        totalWorkHours: 0,
        totalOutings: 0,
        lateCount: 0,
        absentCount: 0,
        leaveBalance: { annual: 10, sick: 15, personal: 5, compensatory: 0 },
        status: 'active',
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('employees').add({ data: doc });

      // 更新部门人数
      if (departmentId) {
        try {
          const dRes = await db.collection('departments').doc(departmentId).get();
          const dept = Array.isArray(dRes.data) ? dRes.data[0] : dRes.data;
          if (dept) {
            await db.collection('departments').doc(departmentId).update({
              data: { employeeCount: (dept.employeeCount || 0) + 1, updatedAt: now }
            });
          }
        } catch (_) {}
      }

      console.log(`[Staff] 员工创建: ${empNo} ${name}`);
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.put('/employees/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, empNo, createdAt, totalWorkHours, totalOutings, lateCount, absentCount, ...fields } = req.body;
      fields.updatedAt = new Date().toISOString();
      if (fields.hourlyRate !== undefined) fields.hourlyRate = Number(fields.hourlyRate);
      if (fields.baseSalary !== undefined) fields.baseSalary = Number(fields.baseSalary);
      if (fields.outingFee !== undefined) fields.outingFee = Number(fields.outingFee);
      await db.collection('employees').doc(req.params.id).update({ data: fields });
      res.json({ success: true, message: '更新成功' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.delete('/employees/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('employees').doc(req.params.id).update({
        data: { status: 'resigned', updatedAt: new Date().toISOString() }
      });
      res.json({ success: true, message: '已离职处理' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                       班 次 模 板
  // ══════════════════════════════════════════════════════════════════════

  router.get('/shifts', async (req, res) => {
    try {
      const db = getDb();
      const r = await db.collection('shift_templates').where({ clubId: getClubId(req) }).orderBy('startTime', 'asc').limit(50).get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.post('/shifts', async (req, res) => {
    try {
      const db = getDb();
      const { name, startTime, endTime, breakMinutes, color, positions, minStaff, maxStaff, notes } = req.body;
      if (!name || !startTime || !endTime) return res.status(400).json({ success: false, message: '名称和时间必填' });

      const start = startTime.split(':').map(Number);
      const end = endTime.split(':').map(Number);
      const totalMinutes = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
      const workHours = Math.max(0, (totalMinutes - (Number(breakMinutes) || 0)) / 60);

      const now = new Date().toISOString();
      const doc = {
        clubId: getClubId(req), name,
        startTime, endTime,
        breakMinutes: Number(breakMinutes) || 0,
        workHours: Math.round(workHours * 100) / 100,
        color: color || '#3B82F6',
        positions: positions || [],
        minStaff: Number(minStaff) || 1,
        maxStaff: Number(maxStaff) || 10,
        notes: notes || '',
        status: 'active',
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('shift_templates').add({ data: doc });
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.put('/shifts/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...fields } = req.body;
      fields.updatedAt = new Date().toISOString();
      await db.collection('shift_templates').doc(req.params.id).update({ data: fields });
      res.json({ success: true, message: '更新成功' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.delete('/shifts/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('shift_templates').doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                        排 班 管 理
  // ══════════════════════════════════════════════════════════════════════

  /* GET /api/staff/schedules?startDate=&endDate=&employeeId=&departmentId= */
  router.get('/schedules', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { startDate, endDate, employeeId, departmentId } = req.query;
      const where = { clubId };
      if (employeeId) where.employeeId = employeeId;
      if (departmentId) where.departmentId = departmentId;

      const r = await db.collection('schedules').where(where).orderBy('date', 'asc').limit(1000).get();
      let list = r.data || [];
      if (startDate) list = list.filter(s => s.date >= startDate);
      if (endDate) list = list.filter(s => s.date <= endDate);
      res.json({ success: true, data: list });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  /* POST /api/staff/schedules  手动排班（单条） */
  router.post('/schedules', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { date, employeeId, employeeName, shiftId, shiftName, startTime, endTime, departmentId, notes } = req.body;
      if (!date || !employeeId || !shiftId) return res.status(400).json({ success: false, message: '日期/员工/班次必填' });

      // 冲突检测
      const existing = await db.collection('schedules')
        .where({ clubId, date, employeeId }).limit(5).get();
      if ((existing.data || []).length > 0) {
        return res.status(409).json({ success: false, message: `${employeeName || ''} 在 ${date} 已有排班` });
      }

      const now = new Date().toISOString();
      const doc = {
        clubId, date, employeeId,
        employeeName: employeeName || '',
        departmentId: departmentId || '',
        shiftId, shiftName: shiftName || '',
        startTime: startTime || '', endTime: endTime || '',
        status: 'scheduled',
        notes: notes || '',
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('schedules').add({ data: doc });
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  /* POST /api/staff/schedules/auto  自动排班 */
  router.post('/schedules/auto', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { startDate, endDate, departmentId } = req.body;
      if (!startDate || !endDate) return res.status(400).json({ success: false, message: '起止日期必填' });

      // 获取活跃员工
      const empWhere = { clubId, status: 'active' };
      if (departmentId) empWhere.departmentId = departmentId;
      const empRes = await db.collection('employees').where(empWhere).limit(200).get();
      const employees = empRes.data || [];
      if (employees.length === 0) return res.status(400).json({ success: false, message: '无可用员工' });

      // 获取班次模板
      const shiftRes = await db.collection('shift_templates').where({ clubId, status: 'active' }).limit(50).get();
      const shifts = shiftRes.data || [];
      if (shifts.length === 0) return res.status(400).json({ success: false, message: '请先创建班次模板' });

      // 获取已有排班（避免冲突）
      const existRes = await db.collection('schedules').where({ clubId }).limit(2000).get();
      const existSet = new Set((existRes.data || [])
        .filter(s => s.date >= startDate && s.date <= endDate)
        .map(s => `${s.date}_${s.employeeId}`));

      // 简单轮转排班算法
      const now = new Date().toISOString();
      const created = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      let empIdx = 0;

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const dayOfWeek = d.getDay();

        for (const shift of shifts) {
          const needed = shift.minStaff || 1;
          let assigned = 0;

          for (let attempt = 0; attempt < employees.length && assigned < needed; attempt++) {
            const emp = employees[empIdx % employees.length];
            empIdx++;

            const key = `${dateStr}_${emp._id}`;
            if (existSet.has(key)) continue;

            // 位置匹配检查
            if (shift.positions && shift.positions.length > 0) {
              if (!shift.positions.includes(emp.position)) continue;
            }

            const doc = {
              clubId, date: dateStr,
              employeeId: emp._id,
              employeeName: emp.name,
              departmentId: emp.departmentId || '',
              shiftId: shift._id,
              shiftName: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
              status: 'scheduled',
              autoGenerated: true,
              notes: '',
              createdAt: now, updatedAt: now,
            };

            await db.collection('schedules').add({ data: doc });
            existSet.add(key);
            created.push(doc);
            assigned++;
          }
        }
      }

      console.log(`[Staff] 自动排班: ${startDate}~${endDate}, 生成 ${created.length} 条`);
      res.json({ success: true, message: `自动排班完成，生成 ${created.length} 条排班`, data: { count: created.length } });
    } catch (err) {
      console.error('[Staff] 自动排班失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* PUT /api/staff/schedules/:id */
  router.put('/schedules/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...fields } = req.body;
      fields.updatedAt = new Date().toISOString();
      await db.collection('schedules').doc(req.params.id).update({ data: fields });
      res.json({ success: true, message: '更新成功' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  /* DELETE /api/staff/schedules/:id */
  router.delete('/schedules/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('schedules').doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  /* POST /api/staff/schedules/publish  发布排班表 */
  router.post('/schedules/publish', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { startDate, endDate } = req.body;

      const r = await db.collection('schedules').where({ clubId }).limit(2000).get();
      const toPublish = (r.data || []).filter(s =>
        s.date >= startDate && s.date <= endDate && s.status === 'scheduled'
      );

      const now = new Date().toISOString();
      for (const s of toPublish) {
        await db.collection('schedules').doc(s._id).update({
          data: { status: 'published', publishedAt: now, updatedAt: now }
        });
      }

      // 发送通知
      const ne = getNotify();
      if (ne) {
        const empIds = [...new Set(toPublish.map(s => s.employeeId))];
        if (empIds.length > 0) {
          try {
            await ne.sendBatch(db, {
              clubId,
              type: ne.NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
              title: `排班表已发布 (${startDate} ~ ${endDate})`,
              content: `请查看您的排班安排`,
              recipientIds: empIds,
              priority: 'important',
            });
          } catch (_) {}
        }
      }

      console.log(`[Staff] 排班发布: ${startDate}~${endDate}, ${toPublish.length} 条`);
      res.json({ success: true, message: `已发布 ${toPublish.length} 条排班`, data: { count: toPublish.length } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                        考 勤 打 卡
  // ══════════════════════════════════════════════════════════════════════

  /* GET /api/staff/attendance?date=&employeeId= */
  router.get('/attendance', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { date, employeeId, startDate, endDate, page = 1, pageSize = 50 } = req.query;
      const where = { clubId };
      if (employeeId) where.employeeId = employeeId;
      if (date) where.date = date;

      const r = await db.collection('attendance_records').where(where).orderBy('date', 'desc').limit(500).get();
      let list = r.data || [];
      if (startDate) list = list.filter(a => a.date >= startDate);
      if (endDate) list = list.filter(a => a.date <= endDate);

      res.json({ success: true, data: list, total: list.length });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  /**
   * POST /api/staff/attendance  签到/签退/标记
   * Body: { employeeId, employeeName, date, action: 'clockIn'|'clockOut'|'mark', status?, notes, operatorName }
   */
  router.post('/attendance', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { employeeId, employeeName, date, action, status, notes, operatorName } = req.body;
      if (!employeeId || !date || !action) return res.status(400).json({ success: false, message: '参数不完整' });

      const now = new Date().toISOString();
      const timeNow = now.slice(11, 16);

      // 查找当天该员工的排班
      const schedRes = await db.collection('schedules')
        .where({ clubId, date, employeeId })
        .limit(1).get();
      const schedule = schedRes.data?.[0];

      // 查找已有考勤记录
      const attRes = await db.collection('attendance_records')
        .where({ clubId, date, employeeId })
        .limit(1).get();
      const existing = attRes.data?.[0];

      if (action === 'clockIn') {
        if (existing?.clockIn) return res.status(400).json({ success: false, message: '今日已签到' });

        // 判断迟到
        let attStatus = 'normal';
        if (schedule && schedule.startTime && timeNow > schedule.startTime) {
          attStatus = 'late';
        }

        const doc = {
          clubId, date, employeeId,
          employeeName: employeeName || '',
          scheduleId: schedule?._id || null,
          shiftName: schedule?.shiftName || '',
          scheduledStart: schedule?.startTime || '',
          scheduledEnd: schedule?.endTime || '',
          clockIn: now,
          clockInTime: timeNow,
          clockOut: null,
          clockOutTime: null,
          workHours: 0,
          overtime: 0,
          status: attStatus,
          notes: notes || '',
          operatorName: operatorName || '',
          createdAt: now, updatedAt: now,
        };

        if (existing) {
          await db.collection('attendance_records').doc(existing._id).update({
            data: { clockIn: now, clockInTime: timeNow, status: attStatus, updatedAt: now }
          });
        } else {
          await db.collection('attendance_records').add({ data: doc });
        }

        // 更新员工迟到统计
        if (attStatus === 'late') {
          try {
            const empRes = await db.collection('employees').doc(employeeId).get();
            const emp = Array.isArray(empRes.data) ? empRes.data[0] : empRes.data;
            if (emp) {
              await db.collection('employees').doc(employeeId).update({
                data: { lateCount: (emp.lateCount || 0) + 1, updatedAt: now }
              });
            }
          } catch (_) {}
        }

        res.json({ success: true, message: attStatus === 'late' ? `已签到（迟到: ${timeNow}）` : '签到成功', data: { status: attStatus } });

      } else if (action === 'clockOut') {
        if (!existing) return res.status(400).json({ success: false, message: '今日尚未签到' });
        if (existing.clockOut) return res.status(400).json({ success: false, message: '今日已签退' });

        // 计算工时
        const clockInDate = new Date(existing.clockIn);
        const clockOutDate = new Date(now);
        const diffMs = clockOutDate - clockInDate;
        const workHours = Math.round((diffMs / 3600000) * 100) / 100;

        // 判断早退
        let attStatus = existing.status;
        if (schedule && schedule.endTime && timeNow < schedule.endTime) {
          attStatus = existing.status === 'late' ? 'late_early' : 'early';
        }

        // 加班计算
        let overtime = 0;
        if (schedule && schedule.endTime && timeNow > schedule.endTime) {
          const [eh, em] = schedule.endTime.split(':').map(Number);
          const [oh, om] = timeNow.split(':').map(Number);
          overtime = Math.max(0, Math.round(((oh * 60 + om) - (eh * 60 + em)) / 60 * 100) / 100);
        }

        await db.collection('attendance_records').doc(existing._id).update({
          data: {
            clockOut: now, clockOutTime: timeNow,
            workHours, overtime,
            status: attStatus,
            updatedAt: now,
          }
        });

        // 更新员工工时统计
        try {
          const empRes = await db.collection('employees').doc(employeeId).get();
          const emp = Array.isArray(empRes.data) ? empRes.data[0] : empRes.data;
          if (emp) {
            await db.collection('employees').doc(employeeId).update({
              data: {
                totalWorkHours: Math.round(((emp.totalWorkHours || 0) + workHours) * 100) / 100,
                updatedAt: now,
              }
            });
          }
        } catch (_) {}

        res.json({ success: true, message: `签退成功，工时: ${workHours}h`, data: { workHours, overtime, status: attStatus } });

      } else if (action === 'mark') {
        // 管理员标记（旷工/补签等）
        const validStatuses = ['normal', 'late', 'early', 'absent', 'leave', 'overtime', 'compensatory'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ success: false, message: `无效状态: ${status}` });
        }

        if (existing) {
          await db.collection('attendance_records').doc(existing._id).update({
            data: { status, notes: notes || existing.notes, operatorName: operatorName || '', updatedAt: now }
          });
        } else {
          await db.collection('attendance_records').add({
            data: {
              clubId, date, employeeId,
              employeeName: employeeName || '',
              scheduleId: schedule?._id || null,
              shiftName: schedule?.shiftName || '',
              scheduledStart: schedule?.startTime || '',
              scheduledEnd: schedule?.endTime || '',
              clockIn: null, clockInTime: null,
              clockOut: null, clockOutTime: null,
              workHours: 0, overtime: 0,
              status,
              notes: notes || '',
              operatorName: operatorName || '',
              createdAt: now, updatedAt: now,
            }
          });

          if (status === 'absent') {
            try {
              const empRes = await db.collection('employees').doc(employeeId).get();
              const emp = Array.isArray(empRes.data) ? empRes.data[0] : empRes.data;
              if (emp) {
                await db.collection('employees').doc(employeeId).update({
                  data: { absentCount: (emp.absentCount || 0) + 1, updatedAt: now }
                });
              }
            } catch (_) {}
          }
        }

        res.json({ success: true, message: `已标记为 ${status}` });
      } else {
        return res.status(400).json({ success: false, message: `无效操作: ${action}` });
      }
    } catch (err) {
      console.error('[Staff] 考勤操作失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                        请 假 管 理
  // ══════════════════════════════════════════════════════════════════════

  router.get('/leaves', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { employeeId, status } = req.query;
      const where = { clubId };
      if (employeeId) where.employeeId = employeeId;
      if (status) where.status = status;
      const r = await db.collection('leave_requests').where(where).orderBy('createdAt', 'desc').limit(200).get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  /**
   * POST /api/staff/leaves  提交请假
   * Body: { employeeId, employeeName, leaveType: 'annual'|'sick'|'personal'|'compensatory'|'other', startDate, endDate, days, reason }
   */
  router.post('/leaves', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { employeeId, employeeName, leaveType, startDate, endDate, days, reason } = req.body;
      if (!employeeId || !leaveType || !startDate || !endDate) {
        return res.status(400).json({ success: false, message: '参数不完整' });
      }

      // 检查假期余额
      const empRes = await db.collection('employees').doc(employeeId).get();
      const emp = Array.isArray(empRes.data) ? empRes.data[0] : empRes.data;
      if (emp && emp.leaveBalance) {
        const balance = emp.leaveBalance[leaveType] || 0;
        const reqDays = Number(days) || 1;
        if (['annual', 'sick', 'personal', 'compensatory'].includes(leaveType) && reqDays > balance) {
          return res.status(400).json({ success: false, message: `${leaveType} 假期余额不足（剩余 ${balance} 天）` });
        }
      }

      const now = new Date().toISOString();
      const doc = {
        clubId, employeeId,
        employeeName: employeeName || emp?.name || '',
        leaveType,
        startDate, endDate,
        days: Number(days) || 1,
        reason: reason || '',
        status: 'pending',
        approvedBy: null,
        approvedAt: null,
        rejectReason: '',
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('leave_requests').add({ data: doc });
      res.json({ success: true, data: { _id: r._id || r.id, ...doc }, message: '请假申请已提交' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  /* PUT /api/staff/leaves/:id/approve  审批请假 */
  router.put('/leaves/:id/approve', async (req, res) => {
    try {
      const db = getDb();
      const { approved, approvedBy, rejectReason } = req.body;
      const leaveRes = await db.collection('leave_requests').doc(req.params.id).get();
      const leave = Array.isArray(leaveRes.data) ? leaveRes.data[0] : leaveRes.data;
      if (!leave) return res.status(404).json({ success: false, message: '申请不存在' });
      if (leave.status !== 'pending') return res.status(400).json({ success: false, message: '该申请已处理' });

      const now = new Date().toISOString();
      const newStatus = approved ? 'approved' : 'rejected';

      await db.collection('leave_requests').doc(req.params.id).update({
        data: {
          status: newStatus,
          approvedBy: approvedBy || '',
          approvedAt: now,
          rejectReason: rejectReason || '',
          updatedAt: now,
        }
      });

      // 批准：扣减假期余额 + 更新对应日期排班为 leave
      if (approved) {
        try {
          const empRes = await db.collection('employees').doc(leave.employeeId).get();
          const emp = Array.isArray(empRes.data) ? empRes.data[0] : empRes.data;
          if (emp && emp.leaveBalance && emp.leaveBalance[leave.leaveType] !== undefined) {
            const newBalance = { ...emp.leaveBalance };
            newBalance[leave.leaveType] = Math.max(0, (newBalance[leave.leaveType] || 0) - (leave.days || 0));
            await db.collection('employees').doc(leave.employeeId).update({
              data: { leaveBalance: newBalance, updatedAt: now }
            });
          }
        } catch (_) {}

        // 对应日期标记考勤为请假
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().slice(0, 10);
          try {
            const attRes = await db.collection('attendance_records')
              .where({ clubId: leave.clubId, date: dateStr, employeeId: leave.employeeId })
              .limit(1).get();
            if (attRes.data?.length > 0) {
              await db.collection('attendance_records').doc(attRes.data[0]._id).update({
                data: { status: 'leave', notes: `${leave.leaveType} 请假`, updatedAt: now }
              });
            } else {
              await db.collection('attendance_records').add({
                data: {
                  clubId: leave.clubId, date: dateStr,
                  employeeId: leave.employeeId,
                  employeeName: leave.employeeName,
                  status: 'leave',
                  notes: `${leave.leaveType} 请假`,
                  clockIn: null, clockOut: null,
                  workHours: 0, overtime: 0,
                  createdAt: now, updatedAt: now,
                }
              });
            }
          } catch (_) {}
        }
      }

      // 通知
      const ne = getNotify();
      if (ne) {
        try {
          await ne.send(db, {
            clubId: leave.clubId,
            type: ne.NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
            title: approved ? '请假申请已批准' : '请假申请被拒绝',
            content: `${leave.startDate} ~ ${leave.endDate}，${leave.days} 天`,
            recipientId: leave.employeeId,
            priority: 'important',
          });
        } catch (_) {}
      }

      res.json({ success: true, message: approved ? '已批准' : '已拒绝' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                        换 班 申 请
  // ══════════════════════════════════════════════════════════════════════

  router.get('/swap-requests', async (req, res) => {
    try {
      const db = getDb();
      const r = await db.collection('shift_swap_requests')
        .where({ clubId: getClubId(req) })
        .orderBy('createdAt', 'desc')
        .limit(100).get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.post('/swap-requests', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { requesterId, requesterName, requesterScheduleId, targetId, targetName, targetScheduleId, reason } = req.body;
      if (!requesterId || !targetId || !requesterScheduleId || !targetScheduleId) {
        return res.status(400).json({ success: false, message: '参数不完整' });
      }
      const now = new Date().toISOString();
      const doc = {
        clubId, requesterId, requesterName: requesterName || '',
        requesterScheduleId,
        targetId, targetName: targetName || '',
        targetScheduleId,
        reason: reason || '',
        status: 'pending',
        approvedBy: null, approvedAt: null,
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('shift_swap_requests').add({ data: doc });
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  router.put('/swap-requests/:id/approve', async (req, res) => {
    try {
      const db = getDb();
      const { approved, approvedBy } = req.body;
      const swapRes = await db.collection('shift_swap_requests').doc(req.params.id).get();
      const swap = Array.isArray(swapRes.data) ? swapRes.data[0] : swapRes.data;
      if (!swap) return res.status(404).json({ success: false, message: '申请不存在' });
      if (swap.status !== 'pending') return res.status(400).json({ success: false, message: '已处理' });

      const now = new Date().toISOString();
      await db.collection('shift_swap_requests').doc(req.params.id).update({
        data: { status: approved ? 'approved' : 'rejected', approvedBy: approvedBy || '', approvedAt: now, updatedAt: now }
      });

      // 批准：交换两人排班
      if (approved) {
        const s1Res = await db.collection('schedules').doc(swap.requesterScheduleId).get();
        const s2Res = await db.collection('schedules').doc(swap.targetScheduleId).get();
        const s1 = Array.isArray(s1Res.data) ? s1Res.data[0] : s1Res.data;
        const s2 = Array.isArray(s2Res.data) ? s2Res.data[0] : s2Res.data;
        if (s1 && s2) {
          await db.collection('schedules').doc(swap.requesterScheduleId).update({
            data: { employeeId: s2.employeeId, employeeName: s2.employeeName, updatedAt: now }
          });
          await db.collection('schedules').doc(swap.targetScheduleId).update({
            data: { employeeId: s1.employeeId, employeeName: s1.employeeName, updatedAt: now }
          });
        }
      }

      res.json({ success: true, message: approved ? '换班已批准' : '换班已拒绝' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                        工 时 统 计
  // ══════════════════════════════════════════════════════════════════════

  router.get('/stats', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { month } = req.query;
      const currentMonth = month || new Date().toISOString().slice(0, 7);
      const monthStart = `${currentMonth}-01`;
      const nextMonth = new Date(`${currentMonth}-01`);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const monthEnd = nextMonth.toISOString().slice(0, 10);

      const [empRes, attRes, schedRes, leaveRes] = await Promise.all([
        db.collection('employees').where({ clubId, status: 'active' }).limit(200).get(),
        db.collection('attendance_records').where({ clubId }).limit(2000).get(),
        db.collection('schedules').where({ clubId }).limit(2000).get(),
        db.collection('leave_requests').where({ clubId }).limit(500).get(),
      ]);

      const employees = empRes.data || [];
      const attendance = (attRes.data || []).filter(a => a.date >= monthStart && a.date < monthEnd);
      const schedules = (schedRes.data || []).filter(s => s.date >= monthStart && s.date < monthEnd);
      const leaves = (leaveRes.data || []).filter(l => l.status === 'approved');

      // 个人统计
      const employeeStats = employees.map(emp => {
        const empAtt = attendance.filter(a => a.employeeId === emp._id);
        const empSched = schedules.filter(s => s.employeeId === emp._id);
        const normalDays = empAtt.filter(a => a.status === 'normal').length;
        const lateDays = empAtt.filter(a => a.status === 'late' || a.status === 'late_early').length;
        const earlyDays = empAtt.filter(a => a.status === 'early' || a.status === 'late_early').length;
        const absentDays = empAtt.filter(a => a.status === 'absent').length;
        const leaveDays = empAtt.filter(a => a.status === 'leave').length;
        const totalHours = empAtt.reduce((s, a) => s + (a.workHours || 0), 0);
        const totalOvertime = empAtt.reduce((s, a) => s + (a.overtime || 0), 0);

        return {
          employeeId: emp._id, empNo: emp.empNo, name: emp.name,
          department: emp.departmentName, position: emp.position,
          scheduledDays: empSched.length,
          normalDays, lateDays, earlyDays, absentDays, leaveDays,
          totalHours: Math.round(totalHours * 100) / 100,
          totalOvertime: Math.round(totalOvertime * 100) / 100,
          attendanceRate: empSched.length > 0 ? Math.round((normalDays + lateDays) / empSched.length * 100) : 0,
          estimatedPay: Math.round((emp.baseSalary || 0) + totalHours * (emp.hourlyRate || 0) + totalOvertime * (emp.hourlyRate || 0) * 1.5),
        };
      });

      // 汇总
      const totalEmployees = employees.length;
      const totalScheduled = schedules.length;
      const totalAttended = attendance.filter(a => a.clockIn).length;
      const overallAttendanceRate = totalScheduled > 0 ? Math.round(totalAttended / totalScheduled * 100) : 0;
      const totalLateCount = attendance.filter(a => a.status === 'late' || a.status === 'late_early').length;
      const totalAbsentCount = attendance.filter(a => a.status === 'absent').length;
      const pendingLeaves = (leaveRes.data || []).filter(l => l.status === 'pending').length;

      // 按部门统计
      const byDepartment = {};
      employeeStats.forEach(e => {
        const dept = e.department || '未分配';
        if (!byDepartment[dept]) byDepartment[dept] = { count: 0, totalHours: 0, avgAttendance: 0, rates: [] };
        byDepartment[dept].count++;
        byDepartment[dept].totalHours += e.totalHours;
        byDepartment[dept].rates.push(e.attendanceRate);
      });
      Object.values(byDepartment).forEach((d) => {
        d.avgAttendance = d.rates.length > 0 ? Math.round(d.rates.reduce((s, r) => s + r, 0) / d.rates.length) : 0;
        delete d.rates;
      });

      res.json({
        success: true,
        data: {
          month: currentMonth,
          summary: { totalEmployees, totalScheduled, totalAttended, overallAttendanceRate, totalLateCount, totalAbsentCount, pendingLeaves },
          employeeStats,
          byDepartment,
        }
      });
    } catch (err) {
      console.error('[Staff] 统计查询失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
