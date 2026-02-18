/**
 * CRM 客户关系管理路由
 * 标签管理 / 客户总览与360 / 互动记录 / 跟进任务 / 客户分群
 */
function createCrmRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  /* ─── 工具函数 ─── */
  function parsePage(query) {
    let page = parseInt(query.page, 10);
    let pageSize = parseInt(query.pageSize, 10);
    page = Number.isFinite(page) && page > 0 ? page : 1;
    pageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;
    return { page, pageSize };
  }

  function fail(res, status, msg) {
    return res.status(status).json({ success: false, error: msg });
  }

  /* ================================================================
   *  一、标签管理  /api/crm/tags
   * ================================================================ */

  // GET /tags - 标签列表
  router.get('/tags', async (req, res) => {
    try {
      const db = getDb();
      const { clubId, category } = req.query;
      const cond = {};
      if (clubId) cond.clubId = clubId;
      if (category) cond.category = category;

      const hasWhere = Object.keys(cond).length > 0;
      const base = hasWhere ? db.collection('crm_tags').where(cond) : db.collection('crm_tags');
      const result = await base.orderBy('createTime', 'desc').limit(200).get();
      res.json({ success: true, data: result.data });
    } catch (e) {
      console.error('[CRM] 获取标签列表失败:', e);
      fail(res, 500, e.message);
    }
  });

  // POST /tags - 创建标签
  router.post('/tags', async (req, res) => {
    try {
      const db = getDb();
      const { name, color, category, clubId, autoRule } = req.body;
      if (!name) return fail(res, 400, '标签名称不能为空');

      const data = {
        name, color: color || '#10b981', category: category || '通用',
        clubId: clubId || 'default',
        autoRule: autoRule || null,
        createTime: db.serverDate(), updateTime: db.serverDate()
      };
      const result = await db.collection('crm_tags').add({ data });
      res.json({ success: true, data: { _id: result._id, ...data }, message: '标签创建成功' });
    } catch (e) {
      console.error('[CRM] 创建标签失败:', e);
      fail(res, 500, e.message);
    }
  });

  // PUT /tags/:id - 更新标签
  router.put('/tags/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createTime, ...body } = req.body;
      body.updateTime = db.serverDate();
      await db.collection('crm_tags').doc(req.params.id).update({ data: body });
      res.json({ success: true, message: '标签更新成功' });
    } catch (e) {
      console.error('[CRM] 更新标签失败:', e);
      fail(res, 500, e.message);
    }
  });

  // DELETE /tags/:id - 删除标签
  router.delete('/tags/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('crm_tags').doc(req.params.id).remove();
      res.json({ success: true, message: '标签已删除' });
    } catch (e) {
      console.error('[CRM] 删除标签失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ================================================================
   *  二、客户总览  /api/crm/customers
   * ================================================================ */

  // GET /customers - 客户列表（聚合 players + profiles，支持标签/等级筛选）
  router.get('/customers', async (req, res) => {
    try {
      const db = getDb();
      const { page, pageSize } = parsePage(req.query);
      const { clubId, tag, memberLevel, q } = req.query;

      const profileCond = {};
      if (clubId) profileCond.clubId = clubId;
      if (memberLevel) profileCond.memberLevel = parseInt(memberLevel, 10);
      if (tag) profileCond.tags = tag;

      const hasWhere = Object.keys(profileCond).length > 0;
      let base = hasWhere
        ? db.collection('player_club_profiles').where(profileCond)
        : db.collection('player_club_profiles');

      const profileRes = await base
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      const profiles = profileRes.data || [];
      if (profiles.length === 0) {
        return res.json({ success: true, data: [], total: 0, page, pageSize });
      }

      const playerIds = [...new Set(profiles.map(p => p.playerId).filter(Boolean))];
      let playersMap = {};
      if (playerIds.length > 0) {
        const _ = db.command;
        const playerRes = await db.collection('players').where({ _id: _.in(playerIds) }).limit(100).get();
        for (const p of (playerRes.data || [])) {
          playersMap[p._id] = p;
        }
      }

      let customers = profiles.map(profile => {
        const player = playersMap[profile.playerId] || {};
        return {
          _id: profile.playerId || profile._id,
          profileId: profile._id,
          name: player.name || profile.playerName || '',
          phoneNumber: player.phoneNumber || '',
          avatarUrl: player.avatarUrl || '',
          gender: player.gender || '',
          playerNo: player.playerNo || profile.playerNo || '',
          memberType: profile.memberType || 'guest',
          memberLevel: profile.memberLevel || 0,
          memberLevelName: profile.memberLevelName || '',
          balance: profile.account?.balance || 0,
          points: profile.account?.points || 0,
          totalRounds: profile.account?.totalRounds || 0,
          totalConsumption: profile.account?.totalConsumption || 0,
          lastVisitDate: profile.lastVisitDate || '',
          tags: profile.tags || [],
          consumeCardNo: profile.memberCard?.consumeCardNo || '',
          registeredAt: profile.registeredAt || profile.createdAt,
        };
      });

      if (q) {
        const keyword = q.toLowerCase();
        customers = customers.filter(c =>
          (c.name && c.name.toLowerCase().includes(keyword)) ||
          (c.phoneNumber && c.phoneNumber.includes(keyword)) ||
          (c.playerNo && c.playerNo.includes(keyword)) ||
          (c.consumeCardNo && c.consumeCardNo.includes(keyword))
        );
      }

      res.json({ success: true, data: customers, total: customers.length, page, pageSize });
    } catch (e) {
      console.error('[CRM] 获取客户列表失败:', e);
      fail(res, 500, e.message);
    }
  });

  // GET /customers/:id/360 - 客户 360 全景
  router.get('/customers/:id/360', async (req, res) => {
    try {
      const db = getDb();
      const playerId = req.params.id;
      const clubId = req.query.clubId;

      const playerRes = await db.collection('players').doc(playerId).get();
      const player = Array.isArray(playerRes.data) ? playerRes.data[0] : playerRes.data;
      if (!player) return fail(res, 404, '客户不存在');

      const profileCond = { playerId };
      if (clubId) profileCond.clubId = clubId;
      const profileRes = await db.collection('player_club_profiles').where(profileCond).limit(1).get();
      const profile = (profileRes.data || [])[0] || {};

      let recentBookings = [];
      try {
        const _ = db.command;
        const bkRes = await db.collection('bookings')
          .where({ 'players.memberId': playerId })
          .orderBy('createTime', 'desc')
          .limit(10)
          .get();
        recentBookings = bkRes.data || [];
      } catch (_e) { /* bookings 集合可能不存在 */ }

      let membership = null;
      try {
        const memRes = await db.collection('memberships')
          .where({ playerId, status: 'active' })
          .limit(1)
          .get();
        membership = (memRes.data || [])[0] || null;
      } catch (_e) {}

      let recentInteractions = [];
      try {
        const intRes = await db.collection('crm_interactions')
          .where({ playerId })
          .orderBy('createTime', 'desc')
          .limit(5)
          .get();
        recentInteractions = intRes.data || [];
      } catch (_e) {}

      let pendingFollowups = [];
      try {
        const _ = db.command;
        const fuRes = await db.collection('crm_followups')
          .where({ playerId, status: _.in(['pending', 'in_progress']) })
          .orderBy('dueDate', 'asc')
          .limit(5)
          .get();
        pendingFollowups = fuRes.data || [];
      } catch (_e) {}

      const rfm = profile.rfm || null;
      const lastVisit = profile.lastVisitDate || profile.account?.lastPlayDate || null;
      let churnRiskDays = null;
      if (lastVisit) {
        churnRiskDays = Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000);
      }

      res.json({
        success: true,
        data: {
          player,
          profile,
          recentBookings,
          membership,
          recentInteractions,
          pendingFollowups,
          rfm,
          summary: {
            totalRounds: profile.account?.totalRounds || 0,
            totalConsumption: profile.account?.totalConsumption || 0,
            totalRecharge: profile.account?.totalRecharge || 0,
            balance: profile.account?.balance || 0,
            points: profile.account?.points || 0,
            memberLevel: profile.memberLevel || 0,
            memberLevelName: profile.memberLevelName || '',
            tags: profile.tags || [],
            lastVisitDate: lastVisit,
            churnRiskDays,
          }
        }
      });
    } catch (e) {
      console.error('[CRM] 获取客户360失败:', e);
      fail(res, 500, e.message);
    }
  });

  // POST /customers/:id/tags - 打标/去标
  router.post('/customers/:id/tags', async (req, res) => {
    try {
      const db = getDb();
      const { tags, action, clubId } = req.body;
      if (!tags || !Array.isArray(tags)) return fail(res, 400, 'tags 必须为数组');

      const profileCond = { playerId: req.params.id };
      if (clubId) profileCond.clubId = clubId;
      const profileRes = await db.collection('player_club_profiles').where(profileCond).limit(1).get();
      const profile = (profileRes.data || [])[0];
      if (!profile) return fail(res, 404, '客户档案不存在');

      const current = profile.tags || [];
      let updated;
      if (action === 'remove') {
        updated = current.filter(t => !tags.includes(t));
      } else {
        updated = [...new Set([...current, ...tags])];
      }

      await db.collection('player_club_profiles').doc(profile._id).update({
        data: { tags: updated, updateTime: db.serverDate() }
      });

      res.json({ success: true, data: { tags: updated }, message: '标签更新成功' });
    } catch (e) {
      console.error('[CRM] 更新客户标签失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ================================================================
   *  三、互动记录  /api/crm/interactions
   * ================================================================ */

  // GET /interactions - 互动列表
  router.get('/interactions', async (req, res) => {
    try {
      const db = getDb();
      const { page, pageSize } = parsePage(req.query);
      const { clubId, type, staffId, playerId } = req.query;

      const cond = {};
      if (clubId) cond.clubId = clubId;
      if (type) cond.type = type;
      if (staffId) cond.staffId = staffId;
      if (playerId) cond.playerId = playerId;

      const hasWhere = Object.keys(cond).length > 0;
      const base = hasWhere
        ? db.collection('crm_interactions').where(cond)
        : db.collection('crm_interactions');

      const result = await base
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      res.json({ success: true, data: result.data || [], total: (result.data || []).length, page, pageSize });
    } catch (e) {
      console.error('[CRM] 获取互动记录失败:', e);
      fail(res, 500, e.message);
    }
  });

  // GET /customers/:id/interactions - 某客户的互动记录
  router.get('/customers/:id/interactions', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('crm_interactions')
        .where({ playerId: req.params.id })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();
      res.json({ success: true, data: result.data || [] });
    } catch (e) {
      console.error('[CRM] 获取客户互动记录失败:', e);
      fail(res, 500, e.message);
    }
  });

  // POST /interactions - 新增互动
  router.post('/interactions', async (req, res) => {
    try {
      const db = getDb();
      const { playerId, playerName, clubId, type, direction, content, summary, staffId, staffName, followUpRequired } = req.body;
      if (!playerId || !type || !content) return fail(res, 400, '缺少必填字段（playerId, type, content）');

      const data = {
        playerId, playerName: playerName || '',
        clubId: clubId || 'default',
        type, direction: direction || 'outbound',
        content, summary: summary || '',
        staffId: staffId || '', staffName: staffName || '',
        followUpRequired: !!followUpRequired,
        followUpId: '',
        createTime: db.serverDate()
      };
      const result = await db.collection('crm_interactions').add({ data });
      res.json({ success: true, data: { _id: result._id, ...data }, message: '互动记录创建成功' });
    } catch (e) {
      console.error('[CRM] 创建互动记录失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ================================================================
   *  四、跟进任务  /api/crm/followups
   * ================================================================ */

  const FOLLOWUP_TRANSITIONS = {
    pending:     ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
  };

  // GET /followups - 跟进任务列表
  router.get('/followups', async (req, res) => {
    try {
      const db = getDb();
      const { page, pageSize } = parsePage(req.query);
      const { clubId, status, priority, assigneeId, playerId } = req.query;

      const cond = {};
      if (clubId) cond.clubId = clubId;
      if (status) cond.status = status;
      if (priority) cond.priority = priority;
      if (assigneeId) cond.assigneeId = assigneeId;
      if (playerId) cond.playerId = playerId;

      const hasWhere = Object.keys(cond).length > 0;
      const base = hasWhere
        ? db.collection('crm_followups').where(cond)
        : db.collection('crm_followups');

      const result = await base
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      res.json({ success: true, data: result.data || [], total: (result.data || []).length, page, pageSize });
    } catch (e) {
      console.error('[CRM] 获取跟进任务失败:', e);
      fail(res, 500, e.message);
    }
  });

  // GET /customers/:id/followups - 某客户的跟进任务
  router.get('/customers/:id/followups', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('crm_followups')
        .where({ playerId: req.params.id })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get();
      res.json({ success: true, data: result.data || [] });
    } catch (e) {
      console.error('[CRM] 获取客户跟进任务失败:', e);
      fail(res, 500, e.message);
    }
  });

  // POST /followups - 创建跟进任务
  router.post('/followups', async (req, res) => {
    try {
      const db = getDb();
      const { playerId, playerName, clubId, title, content, assigneeId, assigneeName, priority, dueDate, relatedInteractionId } = req.body;
      if (!playerId || !title) return fail(res, 400, '缺少必填字段（playerId, title）');

      const data = {
        playerId, playerName: playerName || '',
        clubId: clubId || 'default',
        title, content: content || '',
        assigneeId: assigneeId || '', assigneeName: assigneeName || '',
        priority: priority || 'medium',
        status: 'pending',
        dueDate: dueDate || '',
        completedAt: null, completedNote: '',
        relatedInteractionId: relatedInteractionId || '',
        statusHistory: [{ status: 'pending', timestamp: new Date().toISOString(), operator: '' }],
        createTime: db.serverDate(), updateTime: db.serverDate()
      };
      const result = await db.collection('crm_followups').add({ data });

      if (relatedInteractionId) {
        try {
          await db.collection('crm_interactions').doc(relatedInteractionId).update({
            data: { followUpId: result._id }
          });
        } catch (_e) {}
      }

      res.json({ success: true, data: { _id: result._id, ...data }, message: '跟进任务创建成功' });
    } catch (e) {
      console.error('[CRM] 创建跟进任务失败:', e);
      fail(res, 500, e.message);
    }
  });

  // PUT /followups/:id - 更新跟进任务（含状态流转）
  router.put('/followups/:id', async (req, res) => {
    try {
      const db = getDb();
      const docRef = db.collection('crm_followups').doc(req.params.id);
      const docRes = await docRef.get();
      const existing = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
      if (!existing) return fail(res, 404, '跟进任务不存在');

      const { _id, createTime, statusHistory: _sh, ...body } = req.body;

      if (body.status && body.status !== existing.status) {
        const allowed = FOLLOWUP_TRANSITIONS[existing.status];
        if (!allowed || !allowed.includes(body.status)) {
          return fail(res, 400, `不允许从 ${existing.status} 转为 ${body.status}`);
        }
        const history = existing.statusHistory || [];
        history.push({ status: body.status, timestamp: new Date().toISOString(), operator: body.operator || '' });
        body.statusHistory = history;
        if (body.status === 'completed') {
          body.completedAt = new Date().toISOString();
        }
      }

      body.updateTime = db.serverDate();
      await docRef.update({ data: body });
      res.json({ success: true, message: '跟进任务更新成功' });
    } catch (e) {
      console.error('[CRM] 更新跟进任务失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ================================================================
   *  五、客户分群  /api/crm/segments
   * ================================================================ */

  // GET /segments - 分群列表
  router.get('/segments', async (req, res) => {
    try {
      const db = getDb();
      const { clubId } = req.query;
      const cond = {};
      if (clubId) cond.clubId = clubId;

      const hasWhere = Object.keys(cond).length > 0;
      const base = hasWhere ? db.collection('crm_segments').where(cond) : db.collection('crm_segments');
      const result = await base.orderBy('createTime', 'desc').limit(100).get();
      res.json({ success: true, data: result.data || [] });
    } catch (e) {
      console.error('[CRM] 获取分群列表失败:', e);
      fail(res, 500, e.message);
    }
  });

  // POST /segments - 创建分群
  router.post('/segments', async (req, res) => {
    try {
      const db = getDb();
      const { name, description, clubId, type, rules, manualPlayerIds } = req.body;
      if (!name) return fail(res, 400, '分群名称不能为空');

      const data = {
        name, description: description || '',
        clubId: clubId || 'default',
        type: type || 'manual',
        rules: rules || [],
        manualPlayerIds: manualPlayerIds || [],
        playerCount: (manualPlayerIds || []).length,
        lastRefreshedAt: null,
        createTime: db.serverDate(), updateTime: db.serverDate()
      };
      const result = await db.collection('crm_segments').add({ data });
      res.json({ success: true, data: { _id: result._id, ...data }, message: '分群创建成功' });
    } catch (e) {
      console.error('[CRM] 创建分群失败:', e);
      fail(res, 500, e.message);
    }
  });

  // PUT /segments/:id - 更新分群
  router.put('/segments/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createTime, ...body } = req.body;
      body.updateTime = db.serverDate();
      await db.collection('crm_segments').doc(req.params.id).update({ data: body });
      res.json({ success: true, message: '分群更新成功' });
    } catch (e) {
      console.error('[CRM] 更新分群失败:', e);
      fail(res, 500, e.message);
    }
  });

  // DELETE /segments/:id - 删除分群
  router.delete('/segments/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('crm_segments').doc(req.params.id).remove();
      res.json({ success: true, message: '分群已删除' });
    } catch (e) {
      console.error('[CRM] 删除分群失败:', e);
      fail(res, 500, e.message);
    }
  });

  // POST /segments/:id/refresh - 刷新自动分群（根据规则重新匹配）
  router.post('/segments/:id/refresh', async (req, res) => {
    try {
      const db = getDb();
      const docRes = await db.collection('crm_segments').doc(req.params.id).get();
      const segment = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
      if (!segment) return fail(res, 404, '分群不存在');
      if (segment.type !== 'auto' || !segment.rules || segment.rules.length === 0) {
        return fail(res, 400, '仅自动分群可刷新');
      }

      const clubId = segment.clubId || 'default';
      const allProfiles = await db.collection('player_club_profiles')
        .where({ clubId })
        .limit(1000)
        .get();

      const matched = (allProfiles.data || []).filter(profile => {
        return segment.rules.every(rule => {
          const val = getNestedValue(profile, rule.field);
          return evalRule(val, rule.operator, rule.value);
        });
      });

      const playerIds = matched.map(p => p.playerId).filter(Boolean);
      await db.collection('crm_segments').doc(req.params.id).update({
        data: {
          manualPlayerIds: playerIds,
          playerCount: playerIds.length,
          lastRefreshedAt: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      res.json({ success: true, data: { playerCount: playerIds.length }, message: '分群刷新完成' });
    } catch (e) {
      console.error('[CRM] 刷新分群失败:', e);
      fail(res, 500, e.message);
    }
  });

  // GET /segments/:id/customers - 分群客户列表
  router.get('/segments/:id/customers', async (req, res) => {
    try {
      const db = getDb();
      const docRes = await db.collection('crm_segments').doc(req.params.id).get();
      const segment = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
      if (!segment) return fail(res, 404, '分群不存在');

      const ids = segment.manualPlayerIds || [];
      if (ids.length === 0) {
        return res.json({ success: true, data: [], total: 0 });
      }

      const _ = db.command;
      const profileRes = await db.collection('player_club_profiles')
        .where({ playerId: _.in(ids.slice(0, 100)) })
        .limit(100)
        .get();

      const playerIds = [...new Set((profileRes.data || []).map(p => p.playerId).filter(Boolean))];
      let playersMap = {};
      if (playerIds.length > 0) {
        const playerRes = await db.collection('players').where({ _id: _.in(playerIds) }).limit(100).get();
        for (const p of (playerRes.data || [])) playersMap[p._id] = p;
      }

      const customers = (profileRes.data || []).map(profile => {
        const player = playersMap[profile.playerId] || {};
        return {
          _id: profile.playerId || profile._id,
          name: player.name || '',
          phoneNumber: player.phoneNumber || '',
          playerNo: player.playerNo || profile.playerNo || '',
          memberLevel: profile.memberLevel || 0,
          memberLevelName: profile.memberLevelName || '',
          tags: profile.tags || [],
          totalConsumption: profile.account?.totalConsumption || 0,
          totalRounds: profile.account?.totalRounds || 0,
        };
      });

      res.json({ success: true, data: customers, total: ids.length });
    } catch (e) {
      console.error('[CRM] 获取分群客户失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ================================================================
   *  六、RFM 客户价值模型  /api/crm/rfm
   * ================================================================ */

  const RFM_R = [
    { min: 0,  max: 7,   score: 5 },
    { min: 8,  max: 30,  score: 4 },
    { min: 31, max: 60,  score: 3 },
    { min: 61, max: 90,  score: 2 },
    { min: 91, max: Infinity, score: 1 },
  ];
  const RFM_F = [
    { min: 12, max: Infinity, score: 5 },
    { min: 8,  max: 11, score: 4 },
    { min: 4,  max: 7,  score: 3 },
    { min: 2,  max: 3,  score: 2 },
    { min: 0,  max: 1,  score: 1 },
  ];
  const RFM_M = [
    { min: 50000, max: Infinity, score: 5 },
    { min: 20000, max: 49999, score: 4 },
    { min: 10000, max: 19999, score: 3 },
    { min: 5000,  max: 9999,  score: 2 },
    { min: 0,     max: 4999,  score: 1 },
  ];

  function scoreRFM(val, table) {
    for (const r of table) { if (val >= r.min && val <= r.max) return r.score; }
    return 1;
  }

  function classifyRFM(r, f, m) {
    const avg = (r + f + m) / 3;
    if (r >= 4 && f >= 4 && m >= 4) return { level: '重要价值客户', color: '#10b981', strategy: '重点维护，提供专属服务' };
    if (r >= 4 && (f < 3 || m < 3)) return { level: '重要发展客户', color: '#3b82f6', strategy: '提升消费频次和客单价' };
    if (r <= 2 && f >= 3 && m >= 3) return { level: '重要保持客户', color: '#f59e0b', strategy: '防止流失，唤醒回访' };
    if (r <= 2 && f <= 2 && m >= 3) return { level: '重要挽留客户', color: '#ef4444', strategy: '高价值流失预警，紧急唤醒' };
    if (avg >= 3.5) return { level: '一般价值客户', color: '#6366f1', strategy: '常规维护' };
    if (r >= 3) return { level: '新客户', color: '#06b6d4', strategy: '引导复购，培养习惯' };
    return { level: '低价值/流失客户', color: '#9ca3af', strategy: '低成本唤醒或自然流失' };
  }

  // POST /rfm/calculate - 计算全部客户 RFM（写入 profile）
  router.post('/rfm/calculate', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.body.clubId || 'default';
      const allProfiles = await db.collection('player_club_profiles').where({ clubId }).limit(1000).get();
      const profiles = allProfiles.data || [];
      const now = Date.now();
      const sixMonthsAgo = new Date(now - 180 * 86400000).toISOString();
      let results = [];

      for (const profile of profiles) {
        const playerId = profile.playerId;
        if (!playerId) continue;

        let lastBookingDate = null;
        let bookingCount = 0;
        let totalSpend = 0;

        try {
          const bkRes = await db.collection('bookings')
            .where({ 'players.memberId': playerId })
            .orderBy('createTime', 'desc')
            .limit(50)
            .get();
          const bookings = bkRes.data || [];
          if (bookings.length > 0) {
            const firstDate = bookings[0].createTime;
            lastBookingDate = typeof firstDate === 'string' ? new Date(firstDate) :
              firstDate?.$date ? new Date(firstDate.$date) : new Date(firstDate);
          }
          for (const b of bookings) {
            const bTime = typeof b.createTime === 'string' ? b.createTime :
              b.createTime?.$date || new Date(b.createTime).toISOString();
            if (bTime >= sixMonthsAgo) {
              bookingCount++;
              totalSpend += (b.pricing?.totalFee || b.totalAmount || 0);
            }
          }
        } catch (_e) {}

        const daysSince = lastBookingDate ? Math.floor((now - lastBookingDate.getTime()) / 86400000) : 999;
        const rScore = scoreRFM(daysSince, RFM_R);
        const fScore = scoreRFM(bookingCount, RFM_F);
        const mScore = scoreRFM(totalSpend, RFM_M);
        const classification = classifyRFM(rScore, fScore, mScore);

        const rfmData = {
          rScore, fScore, mScore,
          rValue: daysSince, fValue: bookingCount, mValue: totalSpend,
          totalScore: rScore + fScore + mScore,
          level: classification.level,
          color: classification.color,
          strategy: classification.strategy,
          calculatedAt: new Date().toISOString()
        };

        try {
          await db.collection('player_club_profiles').doc(profile._id).update({
            data: { rfm: rfmData, updateTime: db.serverDate() }
          });
        } catch (_e) {}

        results.push({ playerId, name: profile.playerName || '', ...rfmData });
      }

      res.json({ success: true, data: { calculated: results.length, results }, message: `已计算 ${results.length} 位客户的 RFM` });
    } catch (e) {
      console.error('[CRM] RFM计算失败:', e);
      fail(res, 500, e.message);
    }
  });

  // GET /rfm/stats - RFM 统计（分布、分层）
  router.get('/rfm/stats', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';
      const allProfiles = await db.collection('player_club_profiles').where({ clubId }).limit(1000).get();
      const profiles = (allProfiles.data || []).filter(p => p.rfm);

      const levelDist = {};
      const scoreDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let totalR = 0, totalF = 0, totalM = 0;
      let churnRisk = 0;

      for (const p of profiles) {
        const rfm = p.rfm;
        levelDist[rfm.level] = (levelDist[rfm.level] || 0) + 1;
        scoreDist[rfm.rScore] = (scoreDist[rfm.rScore] || 0) + 1;
        totalR += rfm.rScore; totalF += rfm.fScore; totalM += rfm.mScore;
        if (rfm.rScore <= 2) churnRisk++;
      }

      const count = profiles.length || 1;
      res.json({
        success: true,
        data: {
          totalCustomers: profiles.length,
          levelDistribution: levelDist,
          rScoreDistribution: scoreDist,
          averages: { r: (totalR / count).toFixed(1), f: (totalF / count).toFixed(1), m: (totalM / count).toFixed(1) },
          churnRisk: { count: churnRisk, rate: ((churnRisk / count) * 100).toFixed(1) + '%' },
        }
      });
    } catch (e) {
      console.error('[CRM] RFM统计失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ================================================================
   *  七、自动跟进触发  /api/crm/auto-followups
   * ================================================================ */

  // POST /auto-followups/generate - 扫描并生成自动跟进任务
  router.post('/auto-followups/generate', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const clubId = req.body.clubId || 'default';
      const now = new Date();
      const created = [];

      const allProfiles = await db.collection('player_club_profiles').where({ clubId }).limit(1000).get();
      const profiles = allProfiles.data || [];

      const playerIds = profiles.map(p => p.playerId).filter(Boolean);
      let playersMap = {};
      if (playerIds.length > 0) {
        const playerRes = await db.collection('players').where({ _id: _.in(playerIds.slice(0, 100)) }).limit(100).get();
        for (const p of (playerRes.data || [])) playersMap[p._id] = p;
      }

      const existingFu = await db.collection('crm_followups')
        .where({ clubId, status: _.in(['pending', 'in_progress']) })
        .limit(500).get();
      const existingKeys = new Set((existingFu.data || []).map(f => `${f.playerId}|${f.autoType || ''}`));

      for (const profile of profiles) {
        const playerId = profile.playerId;
        if (!playerId) continue;
        const player = playersMap[playerId] || {};
        const playerName = player.name || profile.playerName || '';

        // 1) 生日提醒（3天内）
        if (player.birthDate) {
          const birth = new Date(player.birthDate);
          const thisYearBday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
          const daysUntil = Math.floor((thisYearBday.getTime() - now.getTime()) / 86400000);
          if (daysUntil >= 0 && daysUntil <= 3 && !existingKeys.has(`${playerId}|birthday`)) {
            const r = await db.collection('crm_followups').add({ data: {
              playerId, playerName, clubId, title: `生日祝福 - ${playerName}`,
              content: `${playerName} 的生日在 ${daysUntil === 0 ? '今天' : daysUntil + '天后'}，请发送祝福和专属优惠`,
              assigneeId: '', assigneeName: '', priority: 'medium', status: 'pending',
              dueDate: thisYearBday.toISOString().slice(0, 10),
              completedAt: null, completedNote: '', relatedInteractionId: '', autoType: 'birthday',
              statusHistory: [{ status: 'pending', timestamp: now.toISOString(), operator: 'system' }],
              createTime: db.serverDate(), updateTime: db.serverDate()
            }});
            created.push({ type: 'birthday', playerId, playerName });
          }
        }

        // 2) 沉睡客户唤醒（>60天未到场）
        const lastVisit = profile.lastVisitDate || profile.account?.lastPlayDate;
        if (lastVisit) {
          const days = Math.floor((now.getTime() - new Date(lastVisit).getTime()) / 86400000);
          if (days >= 60 && !existingKeys.has(`${playerId}|dormant`)) {
            await db.collection('crm_followups').add({ data: {
              playerId, playerName, clubId, title: `沉睡唤醒 - ${playerName}`,
              content: `${playerName} 已 ${days} 天未到场，建议电话回访了解原因并邀请回访`,
              assigneeId: '', assigneeName: '', priority: 'high', status: 'pending',
              dueDate: new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10),
              completedAt: null, completedNote: '', relatedInteractionId: '', autoType: 'dormant',
              statusHistory: [{ status: 'pending', timestamp: now.toISOString(), operator: 'system' }],
              createTime: db.serverDate(), updateTime: db.serverDate()
            }});
            created.push({ type: 'dormant', playerId, playerName, days });
          }
        }

        // 3) 会籍到期提醒（30/15/7天）
        try {
          const memRes = await db.collection('memberships')
            .where({ playerId, status: 'active' }).limit(1).get();
          const mem = (memRes.data || [])[0];
          if (mem && mem.endDate) {
            const daysUntilExpiry = Math.floor((new Date(mem.endDate).getTime() - now.getTime()) / 86400000);
            if ([30, 15, 7].includes(daysUntilExpiry) && !existingKeys.has(`${playerId}|membership_expiry`)) {
              await db.collection('crm_followups').add({ data: {
                playerId, playerName, clubId, title: `会籍到期 - ${playerName} (${daysUntilExpiry}天)`,
                content: `${playerName} 的会籍将于 ${daysUntilExpiry} 天后到期，请联系续费`,
                assigneeId: '', assigneeName: '', priority: daysUntilExpiry <= 7 ? 'urgent' : 'high', status: 'pending',
                dueDate: new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10),
                completedAt: null, completedNote: '', relatedInteractionId: '', autoType: 'membership_expiry',
                statusHistory: [{ status: 'pending', timestamp: now.toISOString(), operator: 'system' }],
                createTime: db.serverDate(), updateTime: db.serverDate()
              }});
              created.push({ type: 'membership_expiry', playerId, playerName, daysUntilExpiry });
            }
          }
        } catch (_e) {}
      }

      // 4) 自动打标
      const autoTags = await db.collection('crm_tags').where({ clubId }).limit(200).get();
      let taggedCount = 0;
      for (const tag of (autoTags.data || [])) {
        if (!tag.autoRule || !tag.autoRule.field) continue;
        for (const profile of profiles) {
          const val = getNestedValue(profile, tag.autoRule.field);
          const match = evalRule(val, tag.autoRule.operator, tag.autoRule.value);
          const currentTags = profile.tags || [];
          if (match && !currentTags.includes(tag.name)) {
            try {
              await db.collection('player_club_profiles').doc(profile._id).update({
                data: { tags: [...currentTags, tag.name], updateTime: db.serverDate() }
              });
              taggedCount++;
            } catch (_e) {}
          }
        }
      }

      res.json({ success: true, data: { followupsCreated: created.length, tagsApplied: taggedCount, details: created }, message: `生成 ${created.length} 条跟进任务，更新 ${taggedCount} 个标签` });
    } catch (e) {
      console.error('[CRM] 自动跟进生成失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ================================================================
   *  八、营销活动  /api/crm/campaigns
   * ================================================================ */

  // GET /campaigns
  router.get('/campaigns', async (req, res) => {
    try {
      const db = getDb();
      const { clubId, status } = req.query;
      const cond = {};
      if (clubId) cond.clubId = clubId;
      if (status) cond.status = status;
      const hasWhere = Object.keys(cond).length > 0;
      const base = hasWhere ? db.collection('crm_campaigns').where(cond) : db.collection('crm_campaigns');
      const result = await base.orderBy('createTime', 'desc').limit(50).get();
      res.json({ success: true, data: result.data || [] });
    } catch (e) {
      console.error('[CRM] 获取活动列表失败:', e);
      fail(res, 500, e.message);
    }
  });

  // POST /campaigns
  router.post('/campaigns', async (req, res) => {
    try {
      const db = getDb();
      const { name, description, clubId, type, segmentId, targetTags, channel, content, budget, scheduledAt } = req.body;
      if (!name) return fail(res, 400, '活动名称不能为空');
      const data = {
        name, description: description || '', clubId: clubId || 'default',
        type: type || 'promotion', segmentId: segmentId || '', targetTags: targetTags || [],
        channel: channel || 'wechat', content: content || '', budget: budget || 0,
        status: 'draft', scheduledAt: scheduledAt || '',
        startedAt: null, completedAt: null,
        stats: { targetCount: 0, sentCount: 0, openedCount: 0, respondedCount: 0, convertedCount: 0, revenue: 0 },
        createTime: db.serverDate(), updateTime: db.serverDate()
      };
      const result = await db.collection('crm_campaigns').add({ data });
      res.json({ success: true, data: { _id: result._id, ...data }, message: '活动创建成功' });
    } catch (e) {
      console.error('[CRM] 创建活动失败:', e);
      fail(res, 500, e.message);
    }
  });

  // PUT /campaigns/:id
  router.put('/campaigns/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createTime, ...body } = req.body;
      body.updateTime = db.serverDate();
      await db.collection('crm_campaigns').doc(req.params.id).update({ data: body });
      res.json({ success: true, message: '活动更新成功' });
    } catch (e) {
      console.error('[CRM] 更新活动失败:', e);
      fail(res, 500, e.message);
    }
  });

  // DELETE /campaigns/:id
  router.delete('/campaigns/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('crm_campaigns').doc(req.params.id).remove();
      res.json({ success: true, message: '活动已删除' });
    } catch (e) {
      console.error('[CRM] 删除活动失败:', e);
      fail(res, 500, e.message);
    }
  });

  // POST /campaigns/:id/launch - 启动活动（筛选目标客户写入 targets）
  router.post('/campaigns/:id/launch', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const docRes = await db.collection('crm_campaigns').doc(req.params.id).get();
      const campaign = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
      if (!campaign) return fail(res, 404, '活动不存在');
      if (campaign.status !== 'draft') return fail(res, 400, '仅草稿状态可启动');

      let targetPlayerIds = [];
      const clubId = campaign.clubId || 'default';

      if (campaign.segmentId) {
        const segRes = await db.collection('crm_segments').doc(campaign.segmentId).get();
        const seg = Array.isArray(segRes.data) ? segRes.data[0] : segRes.data;
        if (seg) targetPlayerIds = seg.manualPlayerIds || [];
      } else if (campaign.targetTags && campaign.targetTags.length > 0) {
        for (const tag of campaign.targetTags) {
          const pRes = await db.collection('player_club_profiles')
            .where({ clubId, tags: tag }).limit(500).get();
          for (const p of (pRes.data || [])) {
            if (p.playerId && !targetPlayerIds.includes(p.playerId)) targetPlayerIds.push(p.playerId);
          }
        }
      } else {
        const pRes = await db.collection('player_club_profiles').where({ clubId }).limit(500).get();
        targetPlayerIds = (pRes.data || []).map(p => p.playerId).filter(Boolean);
      }

      for (const pid of targetPlayerIds) {
        try {
          await db.collection('crm_campaign_targets').add({ data: {
            campaignId: req.params.id, playerId: pid, clubId,
            status: 'sent', sentAt: db.serverDate(), openedAt: null, respondedAt: null, convertedAt: null
          }});
        } catch (_e) {}
      }

      await db.collection('crm_campaigns').doc(req.params.id).update({ data: {
        status: 'running', startedAt: db.serverDate(),
        'stats.targetCount': targetPlayerIds.length, 'stats.sentCount': targetPlayerIds.length,
        updateTime: db.serverDate()
      }});

      res.json({ success: true, data: { targetCount: targetPlayerIds.length }, message: `活动已启动，目标 ${targetPlayerIds.length} 位客户` });
    } catch (e) {
      console.error('[CRM] 启动活动失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ================================================================
   *  九、数据洞察  /api/crm/insights
   * ================================================================ */

  router.get('/insights', async (req, res) => {
    try {
      const db = getDb();
      const clubId = req.query.clubId || 'default';
      const allProfiles = await db.collection('player_club_profiles').where({ clubId }).limit(1000).get();
      const profiles = allProfiles.data || [];

      const totalCustomers = profiles.length;
      const memberLevelDist = {};
      const tagDist = {};
      let totalConsumption = 0;
      let totalBalance = 0;
      let activeCount = 0;
      let dormantCount = 0;
      const rfmLevelDist = {};
      let churnRisk = 0;

      const now = Date.now();
      for (const p of profiles) {
        const level = p.memberLevel || 0;
        memberLevelDist[level] = (memberLevelDist[level] || 0) + 1;
        for (const t of (p.tags || [])) { tagDist[t] = (tagDist[t] || 0) + 1; }
        totalConsumption += (p.account?.totalConsumption || 0);
        totalBalance += (p.account?.balance || 0);
        const lastVisit = p.lastVisitDate || p.account?.lastPlayDate;
        if (lastVisit) {
          const days = (now - new Date(lastVisit).getTime()) / 86400000;
          if (days <= 60) activeCount++; else dormantCount++;
        }
        if (p.rfm) {
          rfmLevelDist[p.rfm.level] = (rfmLevelDist[p.rfm.level] || 0) + 1;
          if (p.rfm.rScore <= 2) churnRisk++;
        }
      }

      const topTags = Object.entries(tagDist).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      let recentInteractionCount = 0;
      try {
        const intRes = await db.collection('crm_interactions').where({ clubId }).limit(1).get();
        recentInteractionCount = (intRes.data || []).length;
      } catch (_e) {}

      let pendingFollowups = 0;
      try {
        const fuRes = await db.collection('crm_followups').where({ clubId, status: 'pending' }).limit(1).get();
        pendingFollowups = (fuRes.data || []).length;
      } catch (_e) {}

      res.json({
        success: true,
        data: {
          overview: { totalCustomers, activeCount, dormantCount, churnRisk, totalConsumption, totalBalance },
          memberLevelDistribution: memberLevelDist,
          rfmLevelDistribution: rfmLevelDist,
          topTags,
          activity: { recentInteractionCount, pendingFollowups },
        }
      });
    } catch (e) {
      console.error('[CRM] 获取洞察数据失败:', e);
      fail(res, 500, e.message);
    }
  });

  /* ─── 规则引擎辅助 ─── */
  function getNestedValue(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  function evalRule(val, operator, target) {
    switch (operator) {
      case 'eq':  return val == target;
      case 'neq': return val != target;
      case 'gt':  return Number(val) > Number(target);
      case 'gte': return Number(val) >= Number(target);
      case 'lt':  return Number(val) < Number(target);
      case 'lte': return Number(val) <= Number(target);
      case 'contains': return typeof val === 'string' && val.includes(target);
      case 'daysSince_gte': {
        if (!val) return false;
        const days = (Date.now() - new Date(val).getTime()) / 86400000;
        return days >= Number(target);
      }
      case 'daysSince_lte': {
        if (!val) return false;
        const days = (Date.now() - new Date(val).getTime()) / 86400000;
        return days <= Number(target);
      }
      default: return false;
    }
  }

  return router;
}

module.exports = createCrmRouter;
