/**
 * 赛事与活动管理路由
 *
 * 集合：tournaments / tournament_registrations / tournament_groups / tournament_scores
 *
 * 核心流程：
 *   创建赛事 → 开放报名 → 截止报名 → 分组编排 → 比赛进行 → 成绩录入 → 排名计算 → 颁奖 → 归档
 *
 * 赛事状态：draft → registration → closed → grouping → in_progress → scoring → completed → archived
 *
 * 赛制支持：
 *   - stroke:     比杆赛（Stroke Play）
 *   - match:      比洞赛（Match Play）
 *   - stableford: 斯特布福德（Stableford）
 *   - scramble:   四人两球乱拉（Scramble）
 *   - best_ball:  四人四球最佳球（Best Ball）
 *   - shotgun:    鸣枪同发（Shotgun Start）
 *
 * @param {Function} getDb - 由 app.js 注入
 */
module.exports = function (getDb) {
  const express = require('express');
  const router = express.Router();

  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';
  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || DEFAULT_CLUB_ID;
  }

  // 通知引擎（惰性加载）
  let _notifyEngine = null;
  function getNotifyEngine() {
    if (!_notifyEngine) {
      try { _notifyEngine = require('../utils/notification-engine'); }
      catch (e) { console.warn('[Tournaments] notification-engine 不可用:', e.message); }
    }
    return _notifyEngine;
  }

  // ─── 赛事状态常量 ─────────────────────────────────────────────────────
  const STATUS = {
    DRAFT:         'draft',
    REGISTRATION:  'registration',
    CLOSED:        'closed',
    GROUPING:      'grouping',
    IN_PROGRESS:   'in_progress',
    SCORING:       'scoring',
    COMPLETED:     'completed',
    ARCHIVED:      'archived',
  };

  const ALLOWED_TRANSITIONS = {
    draft:         ['registration', 'archived'],
    registration:  ['closed', 'archived'],
    closed:        ['grouping', 'registration'],
    grouping:      ['in_progress', 'closed'],
    in_progress:   ['scoring'],
    scoring:       ['completed'],
    completed:     ['archived'],
    archived:      [],
  };

  // ─── 工具：生成赛事编号 ─────────────────────────────────────────────────
  async function generateTournamentNo(db, clubId) {
    const d = new Date();
    const y = d.getFullYear();
    const prefix = `T${y}`;
    try {
      const cnt = await db.collection('tournaments')
        .where({ clubId, tournamentNo: db.RegExp({ regexp: `^${prefix}`, options: '' }) })
        .count();
      return `${prefix}${String((cnt.total || 0) + 1).padStart(4, '0')}`;
    } catch {
      return `${prefix}${String(Date.now()).slice(-6)}`;
    }
  }

  // ─── 工具：生成报名编号 ─────────────────────────────────────────────────
  async function generateRegNo(db, tournamentId) {
    try {
      const cnt = await db.collection('tournament_registrations')
        .where({ tournamentId })
        .count();
      return `R${String((cnt.total || 0) + 1).padStart(4, '0')}`;
    } catch {
      return `R${String(Date.now()).slice(-6)}`;
    }
  }

  // ─── 工具：计算净杆 ─────────────────────────────────────────────────────
  function calcNetScore(grossScore, handicap, holes = 18) {
    if (!grossScore || grossScore <= 0) return null;
    const hcp = Number(handicap) || 0;
    const factor = holes === 9 ? 0.5 : 1;
    return Math.round(grossScore - hcp * factor);
  }

  // ─── 工具：计算斯特布福德积分 ──────────────────────────────────────────
  function calcStablefordPoints(holeScores, holePars, playerHandicap) {
    if (!holeScores || !holePars) return 0;
    let total = 0;
    const hcp = Number(playerHandicap) || 0;
    const strokesPerHole = Math.floor(hcp / holePars.length);
    const extraStrokes = hcp % holePars.length;

    for (let i = 0; i < holeScores.length; i++) {
      if (!holeScores[i] || !holePars[i]) continue;
      const par = holePars[i];
      const bonus = i < extraStrokes ? strokesPerHole + 1 : strokesPerHole;
      const netScore = holeScores[i] - bonus;
      const diff = par - netScore;
      if (diff >= 4) total += 6;       // Albatross+
      else if (diff === 3) total += 5;  // Albatross
      else if (diff === 2) total += 4;  // Eagle
      else if (diff === 1) total += 3;  // Birdie
      else if (diff === 0) total += 2;  // Par
      else if (diff === -1) total += 1; // Bogey
      // Double bogey or worse = 0
    }
    return total;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/tournaments  赛事列表
  // query: status, year, page, pageSize, keyword
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { status, year, page = 1, pageSize = 20, keyword } = req.query;
      const skip = (Number(page) - 1) * Number(pageSize);

      const where = { clubId };
      if (status) where.status = status;

      const [countRes, listRes] = await Promise.all([
        db.collection('tournaments').where(where).count(),
        db.collection('tournaments').where(where)
          .orderBy('startDate', 'desc')
          .skip(skip)
          .limit(Number(pageSize))
          .get()
      ]);

      let list = listRes.data || [];

      if (year) {
        list = list.filter(t => t.startDate && t.startDate.startsWith(year));
      }
      if (keyword) {
        const kw = keyword.toLowerCase();
        list = list.filter(t =>
          (t.name || '').toLowerCase().includes(kw) ||
          (t.tournamentNo || '').toLowerCase().includes(kw)
        );
      }

      res.json({ success: true, data: list, total: countRes.total || list.length, page: Number(page), pageSize: Number(pageSize) });
    } catch (err) {
      console.error('[Tournaments] 列表查询失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/tournaments/:id  赛事详情（含报名人数统计）
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('tournaments').doc(req.params.id).get();
      const item = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!item) return res.status(404).json({ success: false, message: '赛事不存在' });

      // 报名统计
      const regCount = await db.collection('tournament_registrations')
        .where({ tournamentId: req.params.id, status: 'confirmed' })
        .count();

      res.json({
        success: true,
        data: {
          ...item,
          registeredCount: regCount.total || 0,
        }
      });
    } catch (err) {
      console.error('[Tournaments] 详情查询失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/tournaments  创建赛事
  //
  // Body:
  //   name(必填), format(stroke/match/stableford/scramble/best_ball/shotgun),
  //   startDate, endDate, holes(18/36/54/72), courseId, courseName,
  //   maxPlayers, entryFee, description, rules{},
  //   awards[], registrationDeadline, memberOnly(bool),
  //   handicapMin, handicapMax, sponsorInfo{}, contactName, contactPhone
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const {
        name, format = 'stroke', startDate, endDate,
        holes = 18, courseId, courseName,
        maxPlayers = 72, entryFee = 0, description = '',
        rules = {}, awards = [], registrationDeadline,
        memberOnly = false, handicapMin, handicapMax,
        sponsorInfo = {}, contactName = '', contactPhone = '',
        teeTimes = [],
      } = req.body;

      if (!name) return res.status(400).json({ success: false, message: '赛事名称必填' });
      if (!startDate) return res.status(400).json({ success: false, message: '开始日期必填' });

      const tournamentNo = await generateTournamentNo(db, clubId);
      const now = new Date().toISOString();

      const doc = {
        clubId,
        tournamentNo,
        name,
        format,
        startDate,
        endDate: endDate || startDate,
        totalHoles: Number(holes),
        roundCount: Math.ceil(Number(holes) / 18),
        courseId: courseId || null,
        courseName: courseName || '',
        maxPlayers: Number(maxPlayers),
        entryFee: Number(entryFee),
        description,
        rules: {
          scoringMethod: format,
          handicapAllowed: rules.handicapAllowed !== false,
          tieBreaker: rules.tieBreaker || 'countback',
          groupSize: rules.groupSize || 4,
          startType: rules.startType || 'tee_times',
          ...rules,
        },
        awards,
        registrationDeadline: registrationDeadline || startDate,
        memberOnly,
        handicapMin: handicapMin !== undefined ? Number(handicapMin) : null,
        handicapMax: handicapMax !== undefined ? Number(handicapMax) : null,
        sponsorInfo,
        contactName,
        contactPhone,
        teeTimes,
        status: STATUS.DRAFT,
        registeredCount: 0,
        groupCount: 0,
        resultsPublished: false,
        leaderboard: [],
        createdAt: now,
        updatedAt: now,
      };

      const result = await db.collection('tournaments').add({ data: doc });
      const id = result._id || result.id;
      console.log(`[Tournaments] 赛事创建成功: ${tournamentNo} - ${name}`);
      res.json({ success: true, data: { _id: id, ...doc }, message: '赛事创建成功' });
    } catch (err) {
      console.error('[Tournaments] 创建失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PUT /api/tournaments/:id  更新赛事信息
  // ══════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, tournamentNo, ...fields } = req.body;

      const oldRes = await db.collection('tournaments').doc(req.params.id).get();
      const old = Array.isArray(oldRes.data) ? oldRes.data[0] : oldRes.data;
      if (!old) return res.status(404).json({ success: false, message: '赛事不存在' });

      fields.updatedAt = new Date().toISOString();
      await db.collection('tournaments').doc(req.params.id).update({ data: fields });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      console.error('[Tournaments] 更新失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PUT /api/tournaments/:id/status  变更赛事状态
  // Body: { status: 'registration' | 'closed' | ... }
  // ══════════════════════════════════════════════════════════════════════════
  router.put('/:id/status', async (req, res) => {
    try {
      const db = getDb();
      const { status: newStatus } = req.body;
      if (!newStatus) return res.status(400).json({ success: false, message: '请指定目标状态' });

      const oldRes = await db.collection('tournaments').doc(req.params.id).get();
      const old = Array.isArray(oldRes.data) ? oldRes.data[0] : oldRes.data;
      if (!old) return res.status(404).json({ success: false, message: '赛事不存在' });

      const allowed = ALLOWED_TRANSITIONS[old.status] || [];
      if (!allowed.includes(newStatus)) {
        return res.status(400).json({ success: false, message: `不允许从 ${old.status} 变更为 ${newStatus}` });
      }

      await db.collection('tournaments').doc(req.params.id).update({
        data: { status: newStatus, updatedAt: new Date().toISOString() }
      });

      // ── 通知：赛事状态变更 ────────────────────────────────────────────
      try {
        const ne = getNotifyEngine();
        if (ne) {
          const clubId = getClubId(req);
          const statusTypeMap = {
            [STATUS.REGISTRATION]:  ne.NOTIFICATION_TYPES.TOURNAMENT_REG_OPEN,
            [STATUS.CLOSED]:        ne.NOTIFICATION_TYPES.TOURNAMENT_REG_CLOSE,
            [STATUS.GROUPING]:      ne.NOTIFICATION_TYPES.TOURNAMENT_GROUPED,
            [STATUS.IN_PROGRESS]:   ne.NOTIFICATION_TYPES.TOURNAMENT_STARTED,
            [STATUS.COMPLETED]:     ne.NOTIFICATION_TYPES.TOURNAMENT_RESULTS,
          };
          const notifType = statusTypeMap[newStatus];
          if (notifType) {
            // 获取已报名球员ID列表
            const regRes = await db.collection('tournament_registrations')
              .where({ tournamentId: req.params.id, status: 'confirmed' })
              .limit(500).get();
            const playerIds = (regRes.data || []).map(r => r.playerId).filter(Boolean);
            await ne.notifyTournament(db, clubId, notifType, { ...old, _id: req.params.id }, playerIds);
          }
        }
      } catch (_ne) { /* 通知失败不影响主流程 */ }

      console.log(`[Tournaments] 赛事 ${old.tournamentNo} 状态: ${old.status} → ${newStatus}`);
      res.json({ success: true, message: `状态已变更为 ${newStatus}` });
    } catch (err) {
      console.error('[Tournaments] 状态变更失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //                          报 名 管 理
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/tournaments/:id/registrations  报名列表
  router.get('/:id/registrations', async (req, res) => {
    try {
      const db = getDb();
      const { status: regStatus } = req.query;
      const where = { tournamentId: req.params.id };
      if (regStatus) where.status = regStatus;

      const result = await db.collection('tournament_registrations')
        .where(where)
        .orderBy('registeredAt', 'asc')
        .limit(500)
        .get();

      res.json({ success: true, data: result.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /api/tournaments/:id/register  报名
  // Body: { playerId, playerName, playerNo, phoneNumber, handicap, identityCode, isGuest, invitedBy, teamName, note }
  router.post('/:id/register', async (req, res) => {
    try {
      const db = getDb();
      const tournamentId = req.params.id;
      const clubId = getClubId(req);

      // 查赛事
      const tRes = await db.collection('tournaments').doc(tournamentId).get();
      const tournament = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;
      if (!tournament) return res.status(404).json({ success: false, message: '赛事不存在' });

      // 状态检查
      if (tournament.status !== STATUS.REGISTRATION) {
        return res.status(400).json({ success: false, message: '赛事当前不在报名阶段' });
      }

      // 截止检查
      if (tournament.registrationDeadline && new Date() > new Date(tournament.registrationDeadline + 'T23:59:59')) {
        return res.status(400).json({ success: false, message: '报名已截止' });
      }

      const {
        playerId, playerName, playerNo, phoneNumber,
        handicap = 24, identityCode = 'walkin',
        isGuest = false, invitedBy = '', teamName = '', note = '',
      } = req.body;

      if (!playerName) return res.status(400).json({ success: false, message: '球员姓名必填' });

      // 会员限制
      if (tournament.memberOnly && !identityCode.startsWith('member')) {
        return res.status(400).json({ success: false, message: '本赛事仅限会员报名' });
      }

      // 差点限制
      const hcp = Number(handicap);
      if (tournament.handicapMin !== null && hcp < tournament.handicapMin) {
        return res.status(400).json({ success: false, message: `差点不满足要求（最低 ${tournament.handicapMin}）` });
      }
      if (tournament.handicapMax !== null && hcp > tournament.handicapMax) {
        return res.status(400).json({ success: false, message: `差点不满足要求（最高 ${tournament.handicapMax}）` });
      }

      // 重复报名检查
      if (playerId) {
        const dupRes = await db.collection('tournament_registrations')
          .where({ tournamentId, playerId, status: 'confirmed' })
          .count();
        if (dupRes.total > 0) {
          return res.status(400).json({ success: false, message: '该球员已报名' });
        }
      }

      // 人数上限
      const confirmedCount = await db.collection('tournament_registrations')
        .where({ tournamentId, status: 'confirmed' })
        .count();
      const isWaitlisted = (confirmedCount.total || 0) >= tournament.maxPlayers;

      const regNo = await generateRegNo(db, tournamentId);
      const now = new Date().toISOString();

      const regDoc = {
        clubId,
        tournamentId,
        tournamentNo: tournament.tournamentNo,
        tournamentName: tournament.name,
        regNo,
        playerId: playerId || null,
        playerName,
        playerNo: playerNo || '',
        phoneNumber: phoneNumber || '',
        handicap: hcp,
        identityCode,
        isGuest,
        invitedBy,
        teamName,
        note,
        entryFeePaid: false,
        entryFeeAmount: tournament.entryFee || 0,
        status: isWaitlisted ? 'waitlisted' : 'confirmed',
        groupId: null,
        groupNo: null,
        teeTime: null,
        startingHole: null,
        registeredAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db.collection('tournament_registrations').add({ data: regDoc });
      const regId = result._id || result.id;

      // 更新赛事报名计数
      await db.collection('tournaments').doc(tournamentId).update({
        data: {
          registeredCount: (confirmedCount.total || 0) + (isWaitlisted ? 0 : 1),
          updatedAt: now,
        }
      });

      console.log(`[Tournaments] ${playerName} 报名 ${tournament.tournamentNo}: ${isWaitlisted ? '候补' : '确认'}`);
      res.json({
        success: true,
        data: { _id: regId, ...regDoc },
        message: isWaitlisted ? '已加入候补名单' : '报名成功',
      });
    } catch (err) {
      console.error('[Tournaments] 报名失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // PUT /api/tournaments/:id/registrations/:regId  更新报名信息（审核/取消等）
  router.put('/:id/registrations/:regId', async (req, res) => {
    try {
      const db = getDb();
      const { status: newStatus, handicap, note } = req.body;
      const update = { updatedAt: new Date().toISOString() };
      if (newStatus) update.status = newStatus;
      if (handicap !== undefined) update.handicap = Number(handicap);
      if (note !== undefined) update.note = note;

      await db.collection('tournament_registrations').doc(req.params.regId).update({ data: update });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // DELETE /api/tournaments/:id/registrations/:regId  取消报名
  router.delete('/:id/registrations/:regId', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('tournament_registrations').doc(req.params.regId).update({
        data: { status: 'cancelled', updatedAt: new Date().toISOString() }
      });

      // 候补自动递补
      const waitlistRes = await db.collection('tournament_registrations')
        .where({ tournamentId: req.params.id, status: 'waitlisted' })
        .orderBy('registeredAt', 'asc')
        .limit(1)
        .get();

      if (waitlistRes.data && waitlistRes.data.length > 0) {
        const next = waitlistRes.data[0];
        await db.collection('tournament_registrations').doc(next._id).update({
          data: { status: 'confirmed', updatedAt: new Date().toISOString() }
        });
        console.log(`[Tournaments] 候补球员 ${next.playerName} 自动递补`);
      }

      res.json({ success: true, message: '已取消报名' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //                          分 组 编 排
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/tournaments/:id/groups  获取分组列表
  router.get('/:id/groups', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('tournament_groups')
        .where({ tournamentId: req.params.id })
        .orderBy('groupNo', 'asc')
        .limit(100)
        .get();
      res.json({ success: true, data: result.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /api/tournaments/:id/groups/auto  自动分组
  // Body: { method: 'handicap' | 'random' | 'seeded', groupSize: 4 }
  router.post('/:id/groups/auto', async (req, res) => {
    try {
      const db = getDb();
      const tournamentId = req.params.id;
      const { method = 'handicap', groupSize = 4 } = req.body;

      // 查赛事
      const tRes = await db.collection('tournaments').doc(tournamentId).get();
      const tournament = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;
      if (!tournament) return res.status(404).json({ success: false, message: '赛事不存在' });

      // 获取已确认报名
      const regRes = await db.collection('tournament_registrations')
        .where({ tournamentId, status: 'confirmed' })
        .orderBy('registeredAt', 'asc')
        .limit(500)
        .get();
      const regs = regRes.data || [];
      if (regs.length === 0) return res.status(400).json({ success: false, message: '没有已确认的报名' });

      // 排序
      let sorted;
      if (method === 'handicap') {
        sorted = [...regs].sort((a, b) => (a.handicap || 0) - (b.handicap || 0));
      } else if (method === 'random') {
        sorted = [...regs].sort(() => Math.random() - 0.5);
      } else {
        sorted = [...regs];
      }

      // 清理旧分组
      const oldGroups = await db.collection('tournament_groups')
        .where({ tournamentId })
        .limit(200)
        .get();
      for (const og of (oldGroups.data || [])) {
        await db.collection('tournament_groups').doc(og._id).remove();
      }

      // 生成分组
      const gs = Number(groupSize) || 4;
      const groups = [];
      const teeTimes = tournament.teeTimes || [];
      const now = new Date().toISOString();

      for (let i = 0; i < sorted.length; i += gs) {
        const groupPlayers = sorted.slice(i, i + gs);
        const groupNo = groups.length + 1;
        const teeTimeAssigned = teeTimes[groups.length] || null;

        const groupDoc = {
          clubId: tournament.clubId,
          tournamentId,
          tournamentNo: tournament.tournamentNo,
          groupNo,
          teeTime: teeTimeAssigned,
          startingHole: tournament.rules?.startType === 'shotgun' ? ((groupNo - 1) % 18) + 1 : 1,
          players: groupPlayers.map((r, idx) => ({
            regId: r._id,
            playerId: r.playerId,
            playerName: r.playerName,
            playerNo: r.playerNo,
            handicap: r.handicap,
            orderInGroup: idx + 1,
          })),
          status: 'pending',
          createdAt: now,
        };

        const gResult = await db.collection('tournament_groups').add({ data: groupDoc });
        const gId = gResult._id || gResult.id;
        groups.push({ _id: gId, ...groupDoc });

        // 更新每位球员的报名记录
        for (const p of groupPlayers) {
          await db.collection('tournament_registrations').doc(p._id).update({
            data: {
              groupId: gId,
              groupNo,
              teeTime: teeTimeAssigned,
              startingHole: groupDoc.startingHole,
              updatedAt: now,
            }
          });
        }
      }

      // 更新赛事
      await db.collection('tournaments').doc(tournamentId).update({
        data: { groupCount: groups.length, status: STATUS.GROUPING, updatedAt: now }
      });

      console.log(`[Tournaments] ${tournament.tournamentNo} 自动分组完成: ${groups.length} 组, 方式: ${method}`);
      res.json({ success: true, data: groups, message: `自动分组完成（${groups.length} 组）` });
    } catch (err) {
      console.error('[Tournaments] 自动分组失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // PUT /api/tournaments/:id/groups/:groupId  手动调整分组
  router.put('/:id/groups/:groupId', async (req, res) => {
    try {
      const db = getDb();
      const { players, teeTime, startingHole } = req.body;
      const update = { updatedAt: new Date().toISOString() };
      if (players) update.players = players;
      if (teeTime !== undefined) update.teeTime = teeTime;
      if (startingHole !== undefined) update.startingHole = Number(startingHole);

      await db.collection('tournament_groups').doc(req.params.groupId).update({ data: update });
      res.json({ success: true, message: '分组已更新' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //                          成 绩 录 入
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/tournaments/:id/scores  获取成绩列表
  router.get('/:id/scores', async (req, res) => {
    try {
      const db = getDb();
      const { round, groupId } = req.query;
      const where = { tournamentId: req.params.id };
      if (round) where.round = Number(round);
      if (groupId) where.groupId = groupId;

      const result = await db.collection('tournament_scores')
        .where(where)
        .orderBy('grossScore', 'asc')
        .limit(500)
        .get();
      res.json({ success: true, data: result.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /api/tournaments/:id/scores  录入/更新成绩
  // Body: { regId, playerId, playerName, handicap, round(1-4),
  //         grossScore, holeScores[18], holePars[18],
  //         attestedBy, attestedByName }
  router.post('/:id/scores', async (req, res) => {
    try {
      const db = getDb();
      const tournamentId = req.params.id;
      const {
        regId, playerId, playerName, handicap = 0, round = 1,
        grossScore, holeScores = [], holePars = [],
        groupId, attestedBy = '', attestedByName = '',
      } = req.body;

      if (!regId && !playerId) return res.status(400).json({ success: false, message: '报名ID或球员ID必填' });

      // 查赛事
      const tRes = await db.collection('tournaments').doc(tournamentId).get();
      const tournament = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;
      if (!tournament) return res.status(404).json({ success: false, message: '赛事不存在' });

      const netScore = calcNetScore(grossScore, handicap, holeScores.length || 18);
      const stablefordPts = tournament.format === 'stableford'
        ? calcStablefordPoints(holeScores, holePars, handicap) : null;

      const now = new Date().toISOString();

      // 检查是否已有成绩（更新 vs 新增）
      const existWhere = { tournamentId, round: Number(round) };
      if (regId) existWhere.regId = regId;
      else existWhere.playerId = playerId;

      const existRes = await db.collection('tournament_scores')
        .where(existWhere)
        .limit(1)
        .get();

      const scoreDoc = {
        clubId: tournament.clubId,
        tournamentId,
        tournamentNo: tournament.tournamentNo,
        regId: regId || null,
        playerId: playerId || null,
        playerName: playerName || '',
        handicap: Number(handicap),
        round: Number(round),
        grossScore: Number(grossScore) || 0,
        netScore,
        holeScores,
        holePars,
        stablefordPoints: stablefordPts,
        groupId: groupId || null,
        attestedBy,
        attestedByName,
        updatedAt: now,
      };

      if (existRes.data && existRes.data.length > 0) {
        // 更新
        await db.collection('tournament_scores').doc(existRes.data[0]._id).update({ data: scoreDoc });
        res.json({ success: true, message: '成绩已更新', data: { _id: existRes.data[0]._id, ...scoreDoc } });
      } else {
        // 新增
        scoreDoc.createdAt = now;
        const sResult = await db.collection('tournament_scores').add({ data: scoreDoc });
        res.json({ success: true, message: '成绩已录入', data: { _id: sResult._id || sResult.id, ...scoreDoc } });
      }

      console.log(`[Tournaments] ${tournament.tournamentNo} R${round} ${playerName}: 总杆${grossScore} 净杆${netScore}`);
    } catch (err) {
      console.error('[Tournaments] 成绩录入失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /api/tournaments/:id/scores/batch  批量录入成绩（一组4人）
  router.post('/:id/scores/batch', async (req, res) => {
    try {
      const db = getDb();
      const { scores = [] } = req.body;
      if (!scores.length) return res.status(400).json({ success: false, message: 'scores 不能为空' });

      const results = [];
      for (const s of scores) {
        s.tournamentId = req.params.id;
        try {
          // 简单递归调用录入逻辑（复用上面的函数逻辑）
          const tRes = await db.collection('tournaments').doc(req.params.id).get();
          const tournament = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;

          const netScore = calcNetScore(s.grossScore, s.handicap, 18);
          const stablefordPts = tournament?.format === 'stableford'
            ? calcStablefordPoints(s.holeScores || [], s.holePars || [], s.handicap) : null;

          const now = new Date().toISOString();
          const scoreDoc = {
            clubId: tournament?.clubId || getClubId(req),
            tournamentId: req.params.id,
            tournamentNo: tournament?.tournamentNo || '',
            regId: s.regId || null,
            playerId: s.playerId || null,
            playerName: s.playerName || '',
            handicap: Number(s.handicap) || 0,
            round: Number(s.round) || 1,
            grossScore: Number(s.grossScore) || 0,
            netScore,
            holeScores: s.holeScores || [],
            holePars: s.holePars || [],
            stablefordPoints: stablefordPts,
            groupId: s.groupId || null,
            attestedBy: s.attestedBy || '',
            attestedByName: s.attestedByName || '',
            createdAt: now,
            updatedAt: now,
          };

          const sResult = await db.collection('tournament_scores').add({ data: scoreDoc });
          results.push({ _id: sResult._id || sResult.id, playerName: s.playerName, grossScore: s.grossScore });
        } catch (e) {
          results.push({ playerName: s.playerName, error: e.message });
        }
      }

      res.json({ success: true, data: results, message: `批量录入 ${results.length} 条` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //                    排 行 榜 / Leaderboard
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/tournaments/:id/leaderboard  实时排行榜
  // query: sortBy(gross/net/stableford), round(all/1/2/3/4)
  router.get('/:id/leaderboard', async (req, res) => {
    try {
      const db = getDb();
      const tournamentId = req.params.id;
      const { sortBy = 'net', round: roundFilter } = req.query;

      // 查赛事
      const tRes = await db.collection('tournaments').doc(tournamentId).get();
      const tournament = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;
      if (!tournament) return res.status(404).json({ success: false, message: '赛事不存在' });

      // 查所有成绩
      const scoresRes = await db.collection('tournament_scores')
        .where({ tournamentId })
        .limit(1000)
        .get();
      const allScores = scoresRes.data || [];

      // 按球员汇总
      const playerMap = {};
      for (const s of allScores) {
        const key = s.regId || s.playerId || s.playerName;
        if (!playerMap[key]) {
          playerMap[key] = {
            regId: s.regId,
            playerId: s.playerId,
            playerName: s.playerName,
            handicap: s.handicap,
            rounds: [],
            totalGross: 0,
            totalNet: 0,
            totalStableford: 0,
            roundCount: 0,
          };
        }
        const p = playerMap[key];

        if (roundFilter && roundFilter !== 'all' && s.round !== Number(roundFilter)) continue;

        p.rounds.push({
          round: s.round,
          grossScore: s.grossScore,
          netScore: s.netScore,
          stablefordPoints: s.stablefordPoints,
          holeScores: s.holeScores,
        });
        p.totalGross += s.grossScore || 0;
        p.totalNet += s.netScore || 0;
        p.totalStableford += s.stablefordPoints || 0;
        p.roundCount++;
      }

      // 排序
      let leaderboard = Object.values(playerMap);
      if (sortBy === 'stableford' || tournament.format === 'stableford') {
        leaderboard.sort((a, b) => b.totalStableford - a.totalStableford);
      } else if (sortBy === 'gross') {
        leaderboard.sort((a, b) => a.totalGross - b.totalGross);
      } else {
        leaderboard.sort((a, b) => a.totalNet - b.totalNet);
      }

      // 计算排名（含并列）
      let rank = 1;
      for (let i = 0; i < leaderboard.length; i++) {
        if (i > 0) {
          const prev = leaderboard[i - 1];
          const curr = leaderboard[i];
          const prevVal = sortBy === 'stableford' ? prev.totalStableford :
            sortBy === 'gross' ? prev.totalGross : prev.totalNet;
          const currVal = sortBy === 'stableford' ? curr.totalStableford :
            sortBy === 'gross' ? curr.totalGross : curr.totalNet;
          if (currVal !== prevVal) rank = i + 1;
        }
        leaderboard[i].rank = rank;
        leaderboard[i].rankDisplay = rank === 1 ? 'T1' : rank === leaderboard[i - 1]?.rank ? `T${rank}` : String(rank);
      }

      // 修正并列标记
      for (let i = 0; i < leaderboard.length; i++) {
        const sameRank = leaderboard.filter(p => p.rank === leaderboard[i].rank);
        if (sameRank.length > 1) {
          leaderboard[i].rankDisplay = `T${leaderboard[i].rank}`;
        } else {
          leaderboard[i].rankDisplay = String(leaderboard[i].rank);
        }
      }

      res.json({
        success: true,
        data: {
          tournament: {
            _id: tournament._id,
            name: tournament.name,
            tournamentNo: tournament.tournamentNo,
            format: tournament.format,
            totalHoles: tournament.totalHoles,
            status: tournament.status,
          },
          sortBy,
          roundFilter: roundFilter || 'all',
          leaderboard,
          totalPlayers: leaderboard.length,
        }
      });
    } catch (err) {
      console.error('[Tournaments] 排行榜查询失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  //                          颁 奖 & 积 分
  // ══════════════════════════════════════════════════════════════════════════

  // POST /api/tournaments/:id/finalize  确认成绩 + 颁奖 + 积分发放
  router.post('/:id/finalize', async (req, res) => {
    try {
      const db = getDb();
      const tournamentId = req.params.id;
      const clubId = getClubId(req);

      // 查赛事
      const tRes = await db.collection('tournaments').doc(tournamentId).get();
      const tournament = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;
      if (!tournament) return res.status(404).json({ success: false, message: '赛事不存在' });

      if (!['scoring', 'in_progress'].includes(tournament.status)) {
        return res.status(400).json({ success: false, message: '赛事尚未进入成绩阶段' });
      }

      // 获取排行榜（净杆）
      const scoresRes = await db.collection('tournament_scores')
        .where({ tournamentId })
        .limit(1000)
        .get();
      const allScores = scoresRes.data || [];

      const playerMap = {};
      for (const s of allScores) {
        const key = s.regId || s.playerId || s.playerName;
        if (!playerMap[key]) {
          playerMap[key] = {
            regId: s.regId, playerId: s.playerId, playerName: s.playerName,
            handicap: s.handicap, totalGross: 0, totalNet: 0, totalStableford: 0,
          };
        }
        playerMap[key].totalGross += s.grossScore || 0;
        playerMap[key].totalNet += s.netScore || 0;
        playerMap[key].totalStableford += s.stablefordPoints || 0;
      }

      const isStableford = tournament.format === 'stableford';
      const ranking = Object.values(playerMap);
      if (isStableford) {
        ranking.sort((a, b) => b.totalStableford - a.totalStableford);
      } else {
        ranking.sort((a, b) => a.totalNet - b.totalNet);
      }

      // 颁奖：根据赛事预设 awards
      const awards = tournament.awards || [];
      const awardResults = [];

      // 自动颁发名次奖
      const autoAwards = [
        { position: 1, title: '冠军', points: 100 },
        { position: 2, title: '亚军', points: 70 },
        { position: 3, title: '季军', points: 50 },
      ];

      for (const award of [...autoAwards, ...awards]) {
        const pos = (award.position || award.rank) - 1;
        if (pos >= 0 && pos < ranking.length) {
          const winner = ranking[pos];
          awardResults.push({
            awardTitle: award.title || award.name,
            playerName: winner.playerName,
            playerId: winner.playerId,
            score: isStableford ? winner.totalStableford : winner.totalNet,
            points: award.points || 0,
          });

          // 发放赛事积分
          if (winner.playerId && (award.points || 0) > 0) {
            try {
              const profileRes = await db.collection('player_club_profiles')
                .where({ clubId, playerId: winner.playerId })
                .limit(1)
                .get();
              const profile = (profileRes.data || [])[0];
              if (profile) {
                const balanceBefore = Number(profile.points) || 0;
                const balanceAfter = balanceBefore + award.points;

                await db.collection('points_transactions').add({
                  data: {
                    clubId,
                    playerId: winner.playerId,
                    playerName: winner.playerName,
                    type: 'earn',
                    amount: award.points,
                    balanceBefore,
                    balanceAfter,
                    source: 'tournament',
                    sourceId: tournamentId,
                    description: `赛事 ${tournament.name} ${award.title} 奖励积分`,
                    createdAt: new Date().toISOString(),
                  }
                });

                await db.collection('player_club_profiles').doc(profile._id).update({
                  data: { points: balanceAfter, updatedAt: new Date().toISOString() }
                });
              }
            } catch (e) {
              console.warn(`[Tournaments] 积分发放失败 ${winner.playerName}:`, e.message);
            }
          }
        }
      }

      // 更新赛事状态为已完成
      const now = new Date().toISOString();
      await db.collection('tournaments').doc(tournamentId).update({
        data: {
          status: STATUS.COMPLETED,
          resultsPublished: true,
          leaderboard: ranking.slice(0, 20).map((p, i) => ({
            rank: i + 1,
            playerName: p.playerName,
            playerId: p.playerId,
            totalGross: p.totalGross,
            totalNet: p.totalNet,
            totalStableford: p.totalStableford,
          })),
          awardResults,
          finalizedAt: now,
          updatedAt: now,
        }
      });

      console.log(`[Tournaments] ${tournament.tournamentNo} 已完赛, ${awardResults.length} 个奖项发放`);
      res.json({
        success: true,
        message: '赛事已完赛，成绩已发布',
        data: { awardResults, leaderboardTop10: ranking.slice(0, 10) },
      });
    } catch (err) {
      console.error('[Tournaments] 颁奖失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE /api/tournaments/:id  删除赛事（仅限 draft / archived）
  // ══════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      const tRes = await db.collection('tournaments').doc(req.params.id).get();
      const tournament = Array.isArray(tRes.data) ? tRes.data[0] : tRes.data;
      if (!tournament) return res.status(404).json({ success: false, message: '赛事不存在' });

      if (!['draft', 'archived'].includes(tournament.status)) {
        return res.status(400).json({ success: false, message: '只能删除草稿或已归档的赛事' });
      }

      await db.collection('tournaments').doc(req.params.id).remove();
      console.log(`[Tournaments] 赛事 ${tournament.tournamentNo} 已删除`);
      res.json({ success: true, message: '赛事已删除' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/tournaments/stats/summary  赛事统计概览
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/stats/summary', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);

      const allRes = await db.collection('tournaments')
        .where({ clubId })
        .limit(500)
        .get();
      const all = allRes.data || [];

      const thisYear = new Date().getFullYear().toString();
      const thisYearEvents = all.filter(t => t.startDate && t.startDate.startsWith(thisYear));

      const byStatus = {};
      all.forEach(t => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      });

      const byFormat = {};
      all.forEach(t => {
        byFormat[t.format] = (byFormat[t.format] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          totalEvents: all.length,
          thisYearEvents: thisYearEvents.length,
          upcoming: all.filter(t => ['draft', 'registration', 'closed', 'grouping'].includes(t.status)).length,
          completed: all.filter(t => t.status === 'completed').length,
          byStatus,
          byFormat,
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
