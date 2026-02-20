/**
 * 球车管理路由（与小程序云函数逻辑对齐）
 * 使用 users.clubId → JWT clubId，通过 requireAuthWithClubId 注入 req.clubId
 */

const express = require('express');
const cloud = require('wx-server-sdk');

const CN_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

function getCmd(db) {
  return (db && typeof db.command !== 'undefined') ? db.command : cloud.database().command;
}

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

function formatAvgUseTime(minutes) {
  if (!minutes || minutes <= 0) return '--';
  const m = Math.round(minutes);
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return `${hours}h${mins}m`;
}

function toMs(val) {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val < 1e11 ? val * 1000 : val;
  if (typeof val === 'object' && val.toDate) {
    try { return val.toDate().getTime(); } catch (e) { return null; }
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function createCartsRouter(getDb, requireAuthWithClubId) {
  const router = express.Router();
  router.use(requireAuthWithClubId);

  // GET /api/carts/statistics - 数据总览 9 项 KPI
  router.get('/statistics', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const dateStr = (req.query.date && String(req.query.date).trim()) || getChinaTodayStr();
      const { start, end } = parseChinaDateRange(dateStr);
      const todayStr = getChinaTodayStr();

      const statistics = {
        totalCarts: 0,
        availableCarts: 0,
        inUseCarts: 0,
        maintenanceCarts: 0,
        disabledCarts: 0,
        notCheckedOut: 0,
        checkedOut: 0,
        notCheckedIn: 0,
        avgUseTime: '--'
      };

      if (dateStr === todayStr) {
        const cartsRes = await db.collection('carts').where({
          clubId,
          isDeleted: _.neq(true)
        }).limit(1000).get();
        const carts = cartsRes.data || [];
        statistics.totalCarts = carts.length;
        carts.forEach(cart => {
          switch (cart.status) {
            case 'available':
            case 'notCheckedOut':
              statistics.notCheckedOut++;
              statistics.availableCarts++;
              break;
            case 'checkedOut':
              statistics.checkedOut++;
              statistics.availableCarts++;
              break;
            case 'inUse':
              statistics.inUseCarts++;
              break;
            case 'notCheckedIn':
              statistics.notCheckedIn++;
              break;
            case 'maintenance':
              statistics.maintenanceCarts++;
              break;
            case 'disabled':
              statistics.disabledCarts++;
              break;
          }
        });
      } else {
        const summaryId = `${clubId}_${dateStr}`;
        const summaryRes = await db.collection('cart_daily_snapshot_summary').doc(summaryId).get().catch(() => null);
        if (summaryRes && summaryRes.data) {
          const s = summaryRes.data;
          statistics.totalCarts = s.totalCarts || 0;
          statistics.availableCarts = s.availableCarts || 0;
          statistics.inUseCarts = s.inUseCarts || 0;
          statistics.maintenanceCarts = s.maintenanceCarts || 0;
          statistics.disabledCarts = s.disabledCarts || 0;
          statistics.notCheckedOut = s.notCheckedOut || 0;
          statistics.checkedOut = s.checkedOut || 0;
          statistics.notCheckedIn = s.notCheckedIn || 0;
        } else {
          const itemsRes = await db.collection('cart_daily_snapshot_items')
            .where({ clubId, date: dateStr })
            .get();
          const items = itemsRes.data || [];
          statistics.totalCarts = items.length;
          items.forEach(it => {
            switch (it.status) {
              case 'available':
              case 'notCheckedOut':
                statistics.notCheckedOut++;
                statistics.availableCarts++;
                break;
              case 'checkedOut':
                statistics.checkedOut++;
                statistics.availableCarts++;
                break;
              case 'inUse':
                statistics.inUseCarts++;
                break;
              case 'notCheckedIn':
                statistics.notCheckedIn++;
                break;
              case 'maintenance':
                statistics.maintenanceCarts++;
                break;
              case 'disabled':
                statistics.disabledCarts++;
                break;
            }
          });
        }
      }

      const outCombined = (statistics.checkedOut || 0) + (statistics.notCheckedIn || 0);
      statistics.checkedOut = outCombined;
      statistics.notCheckedIn = outCombined;

      let usedCartCount = 0;
      try {
        const usageRes = await db.collection('cart_usage_records')
          .where({ clubId, checkoutTime: _.gte(start).and(_.lte(end)) })
          .field({ cartId: true })
          .limit(1000)
          .get();
        const ids = (usageRes.data || []).map(r => r.cartId).filter(Boolean);
        usedCartCount = new Set(ids).size;
      } catch (e) {
        const c = await db.collection('cart_usage_records')
          .where({ clubId, checkoutTime: _.gte(start).and(_.lte(end)) })
          .count();
        usedCartCount = c.total || 0;
      }

      let totalMinutes = 0;
      let validRecords = 0;
      for (let i = 0; i < 10; i++) {
        const recRes = await db.collection('cart_usage_records')
          .where({
            clubId,
            checkoutTime: _.gte(start).and(_.lte(end)),
            checkinTime: _.exists(true)
          })
          .skip(i * 200)
          .limit(200)
          .get();
        const recs = recRes.data || [];
        if (recs.length === 0) break;
        recs.forEach(record => {
          const startMs = toMs(record.checkoutTime);
          const endMs = toMs(record.checkinTime);
          if (startMs && endMs) {
            const minutes = Math.floor((endMs - startMs) / (1000 * 60));
            if (minutes > 0 && minutes < 600) {
              totalMinutes += minutes;
              validRecords++;
            }
          }
        });
        if (recs.length < 200) break;
      }
      if (validRecords > 0) {
        statistics.avgUseTime = formatAvgUseTime(totalMinutes / validRecords);
      }

      res.json({ success: true, data: statistics });
    } catch (error) {
      console.error('[Carts] 获取统计失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET /api/carts/brands - 品牌选项
  router.get('/brands', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const res0 = await db.collection('carbrands')
        .where(_.and([
          { enabled: _.neq(false) },
          _.or([{ clubId }, { clubId: _.exists(false) }])
        ]))
        .orderBy('order', 'asc')
        .orderBy('name', 'asc')
        .get();
      let brands = (res0.data || []).map(b => (typeof b === 'string' ? b : (b.name || ''))).filter(Boolean);
      if (brands.length === 0) {
        brands = ['CLUBCAR', 'EZGO', '锦申', '后勤车', '新CLUBCAR', '白色湘鹰', '黄色湘鹰', 'VIP车', '长车'];
      }
      res.json({ success: true, data: brands });
    } catch (error) {
      console.error('[Carts] 获取品牌失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET /api/carts - 球车列表
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const { page = 1, limit = 20, brand = 'all', status = 'all', searchText = '' } = req.query;
      const todayStr = getChinaTodayStr();
      const dateStr = (req.query.date && String(req.query.date).trim()) || todayStr;
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const skip = (pageNum - 1) * limitNum;

      const conds = [{ clubId }, { isDeleted: _.neq(true) }];
      if (brand && brand !== 'all') conds.push({ brand });
      if (status && status !== 'all') {
        if (status === 'checkedOutOrNotCheckedIn') {
          conds.push(_.or([{ status: 'checkedOut' }, { status: 'notCheckedIn' }]));
        } else if (status === 'availableGroup') {
          conds.push(_.or([{ status: 'notCheckedOut' }, { status: 'checkedOut' }, { status: 'available' }]));
        } else if (status === 'notCheckedOut') {
          conds.push(_.or([{ status: 'notCheckedOut' }, { status: 'available' }]));
        } else {
          conds.push({ status });
        }
      }
      const search = String(searchText || '').trim();
      if (search) {
        const searchConditions = [
          { brand: db.RegExp({ regexp: search, options: 'i' }) },
          { cartNumber: db.RegExp({ regexp: search, options: 'i' }) }
        ];
        if (/^\d+$/.test(search)) searchConditions.push({ cartNumber: Number(search) });
        conds.push(_.or(searchConditions));
      }

      const whereExpr = conds.length === 1 ? conds[0] : _.and(conds);
      let list = [];
      let total = 0;
      try {
        const [countRes, listRes] = await Promise.all([
          db.collection('carts').where(whereExpr).count(),
          db.collection('carts').where(whereExpr).orderBy('createdAt', 'desc').skip(skip).limit(limitNum).get()
        ]);
        list = listRes.data || [];
        total = countRes.total || 0;
      } catch (orderByErr) {
        // 部分环境（如 HTTP DB）orderBy 可能失败或需索引，回退为按 _id 倒序
        console.warn('[Carts] orderBy createdAt 失败，回退 _id:', orderByErr && orderByErr.message);
        try {
          const [countRes, listRes] = await Promise.all([
            db.collection('carts').where(whereExpr).count(),
            db.collection('carts').where(whereExpr).orderBy('_id', 'desc').skip(skip).limit(limitNum).get()
          ]);
          list = listRes.data || [];
          total = countRes.total || 0;
        } catch (fallbackErr) {
          // 再回退：无 orderBy
          const [countRes, listRes] = await Promise.all([
            db.collection('carts').where(whereExpr).count(),
            db.collection('carts').where(whereExpr).skip(skip).limit(limitNum).get()
          ]);
          list = listRes.data || [];
          total = countRes.total || 0;
        }
      }

      res.json({ success: true, data: list, total, page: pageNum, hasMore: skip + list.length < total });
    } catch (error) {
      console.error('[Carts] 获取列表失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET /api/carts/usage - 使用记录列表（需在 PUT /:id 之前定义）
  // searchText 支持：车号、球童号（caddieNumber/caddyNo）、球童姓名（name/nickName）
  router.get('/usage', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const { page = 1, limit = 20, date, brand = 'all', status = 'all', searchText = '' } = req.query;
      const dateStr = (date && String(date).trim()) || getChinaTodayStr();
      const { start, end } = parseChinaDateRange(dateStr);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const skip = (pageNum - 1) * limitNum;

      const s = String(searchText || '').trim();

      // 如果有搜索词，先尝试通过 users 集合查匹配的 openid（支持球童号/姓名）
      let matchedOpenids = null; // null = 未限制；[] = 无匹配（直接返回空）
      if (s) {
        try {
          const userConds = [
            { clubId },
            _.or([
              { name: db.RegExp({ regexp: s, options: 'i' }) },
              { nickName: db.RegExp({ regexp: s, options: 'i' }) },
              { caddieNumber: db.RegExp({ regexp: s, options: 'i' }) },
            ])
          ];
          const usersRes = await db.collection('users')
            .where(_.and(userConds))
            .field({ _openid: true, name: true, nickName: true, caddieNumber: true })
            .limit(200)
            .get();
          const matched = usersRes.data || [];
          if (matched.length > 0) {
            matchedOpenids = matched.map(u => u._openid).filter(Boolean);
          }
        } catch (e) {
          console.warn('[Carts] 搜索 users 失败，跳过球童搜索:', e && e.message);
        }
      }

      const conds = [
        { clubId },
        { checkoutTime: _.gte(start).and(_.lte(end)) }
      ];
      if (brand && brand !== 'all') conds.push({ brand });
      if (status === 'ongoing') conds.push({ checkinTime: _.exists(false) });
      else if (status === 'completed') conds.push({ checkinTime: _.exists(true) });

      if (s) {
        // 构建搜索条件：车号匹配 OR 操作人openid匹配
        const searchOrConds = [
          { cartNumber: db.RegExp({ regexp: s, options: 'i' }) },
        ];
        if (/^\d+$/.test(s)) searchOrConds.push({ cartNumber: Number(s) });
        // 如果找到了匹配的球童 openid，加入 openid 范围搜索
        if (matchedOpenids && matchedOpenids.length > 0) {
          searchOrConds.push({ checkoutBy: _.in(matchedOpenids) });
          searchOrConds.push({ checkinBy: _.in(matchedOpenids) });
        } else if (matchedOpenids === null) {
          // users 查询出错时降级：直接在 checkoutBy/checkinBy 上做正则
          searchOrConds.push({ checkoutBy: db.RegExp({ regexp: s, options: 'i' }) });
          searchOrConds.push({ checkinBy: db.RegExp({ regexp: s, options: 'i' }) });
        }
        // matchedOpenids === [] 时：搜索词不匹配任何球童 且 不是车号，条件只剩车号匹配
        if (searchOrConds.length > 0) conds.push(_.or(searchOrConds));
      }

      const whereExpr = conds.length === 1 ? conds[0] : _.and(conds);
      const [countRes, listRes] = await Promise.all([
        db.collection('cart_usage_records').where(whereExpr).count(),
        db.collection('cart_usage_records').where(whereExpr).orderBy('cartNumber', 'asc').skip(skip).limit(limitNum).get()
      ]);
      const list = listRes.data || [];
      const total = countRes.total || 0;

      // 批量查询操作人显示名
      const openids = [...new Set(list.flatMap(r => [r.checkoutBy, r.checkinBy]).filter(v => typeof v === 'string' && v))];
      let displayMap = {};
      if (openids.length > 0) {
        try {
          const usersRes = await db.collection('users').where({ _openid: _.in(openids) })
            .field({ _openid: true, nickName: true, caddieNumber: true, name: true })
            .get();
          (usersRes.data || []).forEach(u => {
            const display = [u.name || u.nickName || '', u.caddieNumber ? `(${u.caddieNumber})` : ''].filter(Boolean).join(' ');
            if (u._openid) displayMap[u._openid] = display || u._openid;
          });
        } catch (e) {}
      }
      const withDisplay = list.map(r => ({
        ...r,
        checkoutByDisplay: displayMap[r.checkoutBy] || r.checkoutBy || '',
        checkinByDisplay: displayMap[r.checkinBy] || r.checkinBy || ''
      }));

      res.json({ success: true, data: withDisplay, total, page: pageNum, hasMore: skip + withDisplay.length < total });
    } catch (error) {
      console.error('[Carts] 获取使用记录失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET /api/carts/usage/:id - 使用记录详情（时间轴）
  router.get('/usage/:id', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const { id } = req.params;

      const recRes = await db.collection('cart_usage_records').doc(id).get();
      const record = recRes.data && (Array.isArray(recRes.data) ? recRes.data[0] : recRes.data);
      if (!record) {
        return res.status(404).json({ success: false, message: '记录不存在' });
      }
      if (record.clubId && record.clubId !== clubId) {
        return res.status(403).json({ success: false, message: '无权限' });
      }

      const openidsSet = new Set();
      ['checkoutBy', 'checkinBy'].forEach(f => {
        if (typeof record[f] === 'string' && record[f]) openidsSet.add(record[f]);
      });
      const laps = Array.isArray(record.laps) ? record.laps : [];
      laps.forEach(l => {
        if (l && typeof l.departBy === 'string' && l.departBy) openidsSet.add(l.departBy);
        if (l && typeof l.returnBy === 'string' && l.returnBy) openidsSet.add(l.returnBy);
      });
      const openids = [...openidsSet];

      let displayMap = {};
      if (openids.length > 0) {
        try {
          const usersRes = await db.collection('users').where({ _openid: _.in(openids) })
            .field({ _openid: true, name: true, nickName: true, caddieNumber: true })
            .get();
          (usersRes.data || []).forEach(u => {
            const display = [u.name || u.nickName || '', u.caddieNumber || ''].filter(Boolean).join(' ');
            if (u._openid) displayMap[u._openid] = display || u._openid;
          });
        } catch (e) {}
      }

      const lapsWithDisplay = laps.map(l => ({
        ...l,
        departByDisplay: displayMap[l && l.departBy] || (l && l.departBy) || '',
        returnByDisplay: displayMap[l && l.returnBy] || (l && l.returnBy) || ''
      }));

      const withDisplay = {
        ...record,
        laps: lapsWithDisplay,
        checkoutByDisplay: displayMap[record.checkoutBy] || record.checkoutBy || '',
        checkinByDisplay: displayMap[record.checkinBy] || record.checkinBy || ''
      };

      res.json({ success: true, data: withDisplay });
    } catch (error) {
      console.error('[Carts] 获取使用记录详情失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // POST /api/carts - 单条新增
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const { brand, cartNumber } = req.body;
      if (!brand || !cartNumber) {
        return res.status(400).json({ success: false, message: '缺少 brand 或 cartNumber' });
      }
      const num = String(cartNumber).trim();
      const dup = await db.collection('carts').where({
        clubId,
        cartNumber: num,
        isDeleted: _.neq(true)
      }).count();
      if (dup.total > 0) {
        return res.status(400).json({ success: false, message: '车号已存在' });
      }
      const result = await db.collection('carts').add({
        data: {
          clubId,
          brand,
          cartNumber: num,
          status: 'notCheckedOut',
          isDeleted: false,
          createdAt: db.serverDate ? db.serverDate() : new Date(),
          updatedAt: db.serverDate ? db.serverDate() : new Date()
        }
      });
      res.json({ success: true, data: { _id: result._id }, message: '创建成功' });
    } catch (error) {
      console.error('[Carts] 创建失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // POST /api/carts/batch - 批量新增
  router.post('/batch', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const { brand, numbers } = req.body;
      if (!brand || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ success: false, message: '缺少 brand 或 numbers' });
      }
      const normalized = numbers.map(n => String(n == null ? '' : n).trim()).filter(Boolean);
      const uniqNumbers = [...new Set(normalized)];

      const duplicates = [];
      const dupSet = new Set();
      for (let i = 0; i < uniqNumbers.length; i += 100) {
        const chunk = uniqNumbers.slice(i, i + 100);
        const res0 = await db.collection('carts')
          .where({ clubId, cartNumber: _.in(chunk), isDeleted: _.neq(true) })
          .field({ cartNumber: true })
          .get();
        (res0.data || []).forEach(doc => {
          if (!dupSet.has(doc.cartNumber)) {
            dupSet.add(doc.cartNumber);
            duplicates.push(doc.cartNumber);
          }
        });
      }
      const toCreate = uniqNumbers.filter(n => !dupSet.has(n));
      let successCount = 0;
      const serverDate = db.serverDate ? db.serverDate() : new Date();
      for (const cartNumber of toCreate) {
        try {
          await db.collection('carts').add({
            data: {
              clubId,
              brand,
              cartNumber,
              status: 'notCheckedOut',
              isDeleted: false,
              createdAt: serverDate,
              updatedAt: serverDate
            }
          });
          successCount++;
        } catch (e) {
          console.error('[Carts] 批量创建单条失败:', cartNumber, e);
        }
      }
      res.json({ success: true, successCount, duplicates, message: `成功 ${successCount} 条` });
    } catch (error) {
      console.error('[Carts] 批量创建失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // PUT /api/carts/batch-status - 批量更新状态（需在 /:id 之前定义）
  router.put('/batch-status', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const { cartIds, status } = req.body;
      if (!cartIds || !Array.isArray(cartIds) || cartIds.length === 0 || !status) {
        return res.status(400).json({ success: false, message: '缺少 cartIds 或 status' });
      }
      const validStatuses = ['available', 'notCheckedOut', 'inUse', 'maintenance', 'disabled'];
      const mappedStatus = status === 'available' ? 'notCheckedOut' : status;
      if (!validStatuses.includes(status) && !validStatuses.includes(mappedStatus)) {
        return res.status(400).json({ success: false, message: '无效状态' });
      }
      const finalStatus = status === 'available' ? 'notCheckedOut' : status;
      const updateData = { status: finalStatus, updatedAt: db.serverDate ? db.serverDate() : new Date() };
      const result = await db.collection('carts').where({ _id: _.in(cartIds) }).update({ data: updateData });
      const updated = result.stats ? result.stats.updated : cartIds.length;
      res.json({ success: true, successCount: updated, message: `已更新 ${updated} 条` });
    } catch (error) {
      console.error('[Carts] 批量更新状态失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // PUT /api/carts/:id - 编辑
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const { id } = req.params;
      const payload = req.body;
      const allowed = ['brand', 'cartNumber', 'model', 'remark', 'status'];
      const updateData = {};
      allowed.forEach(k => { if (payload[k] !== undefined) updateData[k] = payload[k]; });
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ success: false, message: '无有效更新字段' });
      }

      const cur = await db.collection('carts').doc(id).get();
      const curData = cur.data && (Array.isArray(cur.data) ? cur.data[0] : cur.data);
      if (!curData || curData.isDeleted) {
        return res.status(404).json({ success: false, message: '记录不存在或已删除' });
      }
      if (curData.clubId !== clubId) {
        return res.status(403).json({ success: false, message: '无权限' });
      }

      if (updateData.cartNumber && updateData.cartNumber !== curData.cartNumber) {
        const dup = await db.collection('carts')
          .where({
            clubId,
            cartNumber: updateData.cartNumber,
            _id: _.neq(id),
            isDeleted: _.neq(true)
          })
          .count();
        if (dup.total > 0) {
          return res.status(400).json({ success: false, message: '该车号已存在' });
        }
      }

      updateData.updatedAt = db.serverDate ? db.serverDate() : new Date();
      await db.collection('carts').doc(id).update({ data: updateData });
      res.json({ success: true, message: '更新成功' });
    } catch (error) {
      console.error('[Carts] 更新失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // DELETE /api/carts - 删除（支持 cartId 或 cartIds，soft=true）
  // 支持 body: { cartId, cartIds, soft } 或 query: cartId=xxx
  router.delete('/', async (req, res) => {
    try {
      const db = getDb();
      const _ = getCmd(db);
      const clubId = req.clubId;
      const body = req.body || {};
      const q = req.query || {};
      let ids = (body.cartIds && Array.isArray(body.cartIds) ? body.cartIds : []).concat(body.cartId ? [body.cartId] : []);
      if (ids.length === 0 && q.cartId) ids = [q.cartId];
      if (ids.length === 0 && q.cartIds) ids = String(q.cartIds).split(',').map(s => s.trim()).filter(Boolean);
      const soft = body.soft !== false;
      if (ids.length === 0) {
        return res.status(400).json({ success: false, message: '缺少 cartId 或 cartIds' });
      }

      const res0 = await db.collection('carts').where({ _id: _.in(ids) }).get();
      const blocked = (res0.data || []).filter(d => ['inUse', 'maintenance'].includes(d.status));
      if (blocked.length > 0) {
        return res.status(400).json({ success: false, message: '存在使用中或维修中的球车，无法删除' });
      }

      if (soft) {
        const upd = await db.collection('carts').where({ _id: _.in(ids) }).update({
          data: {
            isDeleted: true,
            deletedAt: db.serverDate ? db.serverDate() : new Date()
          }
        });
        const updated = upd.stats ? upd.stats.updated : ids.length;
        return res.json({ success: true, updated, message: '已删除' });
      }
      const del = await db.collection('carts').where({ _id: _.in(ids) }).remove();
      const removed = del.stats ? del.stats.removed : ids.length;
      res.json({ success: true, removed, message: '已删除' });
    } catch (error) {
      console.error('[Carts] 删除失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = createCartsRouter;
