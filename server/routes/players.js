/**
 * 球员管理路由（平台级 + 球场档案）
 *
 * 集合设计：
 *   players                  — 平台级球员档案（无 clubId，跨球场通用）
 *   player_club_profiles     — 球场级档案（含会员卡、余额，每人每球场一条）
 *
 * 核心字段：
 *   players.playerNo         — 六位纯数字唯一编号（系统随机生成，全平台唯一）
 *   profiles.memberCard.consumeCardNo — 实体消费卡号（备用识别手段）
 *   profiles.memberCard.qrCode.code   — 消费二维码（主要识别手段）
 *
 * 查找球员四条路径：
 *   1. playerNo（六位编号）
 *   2. consumeCardNo（实体消费卡号）
 *   3. qrCode.code（扫二维码）
 *   4. phoneNumber / 姓名模糊搜索
 */

const express = require('express');

// ─── 常量 ────────────────────────────────────────────────────────────────────

const MEMBER_TYPES   = ['member', 'guest', 'walkin'];
const MEMBER_LEVELS  = [1, 2, 3, 4];
const MEMBER_LEVEL_NAMES = { 1: '普通会员', 2: '金卡会员', 3: '钻石会员', 4: '白金会员' };
const CARD_TYPES     = ['physical', 'virtual', 'qrcode'];
const CARD_STATUSES  = ['active', 'frozen', 'cancelled', 'expired'];
const PLATE_COLORS   = ['blue', 'green', 'yellow', 'white', 'black'];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 生成六位纯数字 playerNo，全平台唯一 */
async function generatePlayerNo(db) {
  let no, exists;
  let attempts = 0;
  do {
    if (attempts++ > 20) throw new Error('playerNo 生成失败，请重试');
    no = String(Math.floor(Math.random() * 900000) + 100000); // 100000–999999
    const res = await db.collection('players').where({ playerNo: no }).count();
    exists = (res.total || 0) > 0;
  } while (exists);
  return no;
}

/** 生成消费二维码唯一标识 */
function generateQrCode() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `QR_${ts}${rand}`;
}

/** 生成会员卡号（球场内唯一）：MC + 年份后两位 + 6位序号 */
async function generateCardNumber(db, clubId) {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `MC${year}`;
  const res = await db.collection('player_club_profiles')
    .where({ clubId, 'memberCard.cardNumber': db.RegExp({ regexp: `^${prefix}`, options: '' }) })
    .orderBy('memberCard.cardNumber', 'desc')
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const last = (res.data || [])[0];
  let seq = 1;
  if (last && last.memberCard && last.memberCard.cardNumber) {
    const lastSeq = parseInt(last.memberCard.cardNumber.slice(-6), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

/** 分页参数 */
function parsePage(q) {
  const page     = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

// ─── 路由工厂 ─────────────────────────────────────────────────────────────────

function createPlayersRouter(getDb) {
  const router = express.Router();

  // ══════════════════════════════════════════════════════════════════════════════
  // 查找球员（前台核心接口）
  // GET /api/players/search?q=283947&clubId=xxx
  // q 可以是：playerNo / phoneNumber / 姓名关键字 / consumeCardNo / qrCode
  // 返回：players 基础信息 + 该球场的 profile（若有）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/search', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const { q = '', clubId = '' } = req.query;
      const s = String(q).trim();
      if (!s) return res.json({ success: true, data: [] });

      let players = [];

      // 1. 先尝试精确匹配 playerNo（六位数字）
      if (/^\d{6}$/.test(s)) {
        const r = await db.collection('players').where({ playerNo: s }).limit(5).get();
        players = r.data || [];
      }

      // 2. 若未找到，尝试手机号精确匹配
      if (players.length === 0 && /^1\d{10}$/.test(s)) {
        const r = await db.collection('players').where({ phoneNumber: s }).limit(5).get();
        players = r.data || [];
      }

      // 3. 若未找到，姓名模糊搜索
      if (players.length === 0) {
        const r = await db.collection('players')
          .where({ name: db.RegExp({ regexp: s, options: 'i' }) })
          .limit(10).get();
        players = r.data || [];
      }

      // 4. 若指定了 clubId，尝试从 profiles 通过 consumeCardNo / qrCode.code 查
      if (players.length === 0 && clubId) {
        const profileRes = await db.collection('player_club_profiles')
          .where(_.and([
            { clubId },
            _.or([
              { 'memberCard.consumeCardNo': s },
              { 'memberCard.qrCode.code': s }
            ])
          ]))
          .limit(5).get();
        const profiles = profileRes.data || [];
        if (profiles.length > 0) {
          const playerIds = [...new Set(profiles.map(p => p.playerId).filter(Boolean))];
          const pRes = await db.collection('players')
            .where({ _id: _.in(playerIds) }).limit(10).get();
          players = pRes.data || [];
        }
      }

      if (players.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // 附加该球场的 profile（若有）
      let result = players;
      if (clubId && players.length > 0) {
        const pids = players.map(p => p._id);
        const profilesRes = await db.collection('player_club_profiles')
          .where({ clubId, playerId: _.in(pids) }).limit(20).get();
        const profileMap = {};
        (profilesRes.data || []).forEach(p => { profileMap[p.playerId] = p; });
        result = players.map(p => ({ ...p, clubProfile: profileMap[p._id] || null }));
      }

      res.json({ success: true, data: result });
    } catch (err) {
      console.error('[Players] search 失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 球员列表（管理用）
  // GET /api/players?clubId=xxx&page=1&pageSize=20&memberType=member&keyword=张
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const { clubId = '', memberType = '', keyword = '', status = '' } = req.query;
      const { page, pageSize, skip } = parsePage(req.query);

      // 先通过 profiles 筛选该球场球员
      let playerIds = null;
      if (clubId) {
        const profConds = [{ clubId }];
        if (memberType) profConds.push({ memberType });
        const profRes = await db.collection('player_club_profiles')
          .where(profConds.length === 1 ? profConds[0] : _.and(profConds))
          .field({ playerId: true })
          .limit(2000).get();
        playerIds = (profRes.data || []).map(p => p.playerId).filter(Boolean);
        if (playerIds.length === 0) {
          return res.json({ success: true, data: [], total: 0, page, pageSize });
        }
      }

      // 再查 players 主表
      const conds = [];
      if (playerIds) conds.push({ _id: _.in(playerIds) });
      if (keyword)  conds.push(_.or([
        { name: db.RegExp({ regexp: keyword, options: 'i' }) },
        { phoneNumber: db.RegExp({ regexp: keyword, options: 'i' }) },
        { playerNo: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]));
      if (status) conds.push({ status });

      const whereExpr = conds.length === 0 ? {} : conds.length === 1 ? conds[0] : _.and(conds);

      const [countRes, listRes] = await Promise.all([
        db.collection('players').where(whereExpr).count(),
        db.collection('players').where(whereExpr).orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get()
      ]);
      const list = listRes.data || [];
      const total = countRes.total || 0;

      // 附加 profile
      let result = list;
      if (clubId && list.length > 0) {
        const pids = list.map(p => p._id);
        const profRes = await db.collection('player_club_profiles')
          .where({ clubId, playerId: _.in(pids) }).limit(pageSize).get();
        const profMap = {};
        (profRes.data || []).forEach(p => { profMap[p.playerId] = p; });
        result = list.map(p => ({ ...p, clubProfile: profMap[p._id] || null }));
      }

      res.json({ success: true, data: result, total, page, pageSize });
    } catch (err) {
      console.error('[Players] 列表失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 球员详情
  // GET /api/players/:id?clubId=xxx
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { clubId = '' } = req.query;

      const playerRes = await db.collection('players').doc(id).get();
      const player = playerRes.data && (Array.isArray(playerRes.data) ? playerRes.data[0] : playerRes.data);
      if (!player) return res.status(404).json({ success: false, message: '球员不存在' });

      let result = { ...player };
      if (clubId) {
        const profRes = await db.collection('player_club_profiles')
          .where({ playerId: id, clubId }).limit(1).get();
        result.clubProfile = (profRes.data || [])[0] || null;
      }

      res.json({ success: true, data: result });
    } catch (err) {
      console.error('[Players] 详情失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 创建球员（同时创建该球场的 profile）
  // POST /api/players
  // Body: { clubId, name, phoneNumber, gender?, birthDate?, memberType, memberLevel?,
  //         memberCard?: { consumeCardNo?, cardType?, expireDate? },
  //         account?: { balance? }, vehicles?, remark?, tags? }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const body = req.body || {};
      const {
        clubId, name, phoneNumber,
        gender = 'unknown', birthDate = '',
        nickName = '', avatarUrl = '',
        memberType = 'member', memberLevel = 1,
        memberCard: cardInput = {},
        account: accountInput = {},
        playerInfo: playerInfoInput = {},
        vehicles: vehiclesInput = [],
        remark = '', tags = [],
        createdBy = '', createdByClub = ''
      } = body;

      // 基础校验
      if (!clubId)  return res.status(400).json({ success: false, message: '缺少 clubId' });
      if (!name)    return res.status(400).json({ success: false, message: '缺少 name' });
      if (!phoneNumber) return res.status(400).json({ success: false, message: '缺少 phoneNumber' });
      if (!MEMBER_TYPES.includes(memberType)) {
        return res.status(400).json({ success: false, message: '无效的 memberType' });
      }

      // 手机号在球场内重复校验（通过 profile 的 playerId 关联查）
      const dupPhone = await db.collection('players').where({ phoneNumber }).count();
      if ((dupPhone.total || 0) > 0) {
        return res.status(400).json({ success: false, message: '该手机号已注册' });
      }

      const now = new Date();

      // 生成 playerNo
      const playerNo = await generatePlayerNo(db);

      // ── 1. 创建 players 主表 ───────────────────────────────────────────────
      const playerData = {
        playerNo,
        name,
        nickName: nickName || name,
        phoneNumber,
        avatarUrl,
        gender,
        birthDate,
        unionid: '',
        wechatBound: false,
        playerInfo: {
          handicap:          playerInfoInput.handicap          ?? null,
          preferredTeeTime:  playerInfoInput.preferredTeeTime  ?? 'morning',
          preferredCourse:   playerInfoInput.preferredCourse   ?? '',
          equipment:         playerInfoInput.equipment         ?? ''
        },
        vehicles: (vehiclesInput || []).map((v, i) => ({
          plateNo:    String(v.plateNo || '').trim().toUpperCase(),
          plateColor: PLATE_COLORS.includes(v.plateColor) ? v.plateColor : 'blue',
          carBrand:   v.carBrand || '',
          carModel:   v.carModel || '',
          carColor:   v.carColor || '',
          isPrimary:  i === 0,
          remark:     v.remark || '',
          addedAt:    now
        })),
        referredBy: body.referredBy || null,
        status: 'active',
        remark,
        tags: Array.isArray(tags) ? tags : [],
        createdAt:     now,
        updatedAt:     now,
        createdBy:     createdBy || '',
        createdByClub: createdByClub || clubId
      };

      const playerResult = await db.collection('players').add({ data: playerData });
      const playerId = playerResult._id;

      // ── 2. 创建 player_club_profiles ──────────────────────────────────────
      const cardNumber    = await generateCardNumber(db, clubId);
      const consumeCardNo = String(cardInput.consumeCardNo || '').trim() || '';
      const qrCodeStr     = generateQrCode();
      const level         = MEMBER_LEVELS.includes(memberLevel) ? memberLevel : 1;

      // consumeCardNo 唯一性校验（球场内）
      if (consumeCardNo) {
        const dupCard = await db.collection('player_club_profiles')
          .where({ clubId, 'memberCard.consumeCardNo': consumeCardNo }).count();
        if ((dupCard.total || 0) > 0) {
          // 回滚：删除刚创建的 player
          await db.collection('players').doc(playerId).remove().catch(() => {});
          return res.status(400).json({ success: false, message: '该消费卡号已被使用' });
        }
      }

      const profileData = {
        playerId,
        playerNo,                              // 冗余，便于查询
        clubId,
        _openid: '',                           // 绑定小程序后填入

        memberType,
        memberLevel:     level,
        memberLevelName: MEMBER_LEVEL_NAMES[level] || '普通会员',

        memberCard: {
          cardNumber,                          // 系统档案号
          consumeCardNo,                       // 实体消费卡号（前台备用）
          cardType: CARD_TYPES.includes(cardInput.cardType) ? cardInput.cardType : 'physical',
          status: 'active',
          issueDate:  now,
          expireDate: cardInput.expireDate ? new Date(cardInput.expireDate) : null,
          qrCode: {
            code:          qrCodeStr,
            expireTime:    null,               // 永不过期
            isActive:      true,
            lastUsedAt:    null,
            lastUsedPlace: ''
          }
        },

        account: {
          balance:           Number(accountInput.balance)           || 0,
          frozenBalance:     0,
          points:            Number(accountInput.points)            || 0,
          totalRecharge:     Number(accountInput.balance)           || 0,
          totalConsumption:  0,
          totalRounds:       0,
          lastPlayDate:      null,
          balanceUpdatedAt:  now
        },

        status: 'active',
        remark: '',
        tags: [],

        registeredAt: now,
        registeredBy: createdBy || '',
        lastVisitDate: null,
        createdAt:  now,
        updatedAt:  now
      };

      await db.collection('player_club_profiles').add({ data: profileData });

      res.json({
        success: true,
        message: '球员创建成功',
        data: {
          _id:        playerId,
          playerNo,
          cardNumber,
          consumeCardNo,
          qrCode:     qrCodeStr
        }
      });
    } catch (err) {
      console.error('[Players] 创建失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 更新球员基础信息（平台级）
  // PUT /api/players/:id
  // Body: { name?, phoneNumber?, gender?, birthDate?, playerInfo?, vehicles?, remark?, tags?, status? }
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const body = req.body || {};

      const cur = await db.collection('players').doc(id).get();
      const curData = cur.data && (Array.isArray(cur.data) ? cur.data[0] : cur.data);
      if (!curData) return res.status(404).json({ success: false, message: '球员不存在' });

      const allowed = ['name', 'nickName', 'phoneNumber', 'gender', 'birthDate',
                       'avatarUrl', 'playerInfo', 'vehicles', 'remark', 'tags',
                       'status', 'unionid', 'wechatBound', 'referredBy'];
      const updateData = { updatedAt: new Date() };
      allowed.forEach(k => { if (body[k] !== undefined) updateData[k] = body[k]; });

      // 手机号重复校验（排除自身）
      if (updateData.phoneNumber && updateData.phoneNumber !== curData.phoneNumber) {
        const dup = await db.collection('players')
          .where({ phoneNumber: updateData.phoneNumber, _id: db.command.neq(id) }).count();
        if ((dup.total || 0) > 0) {
          return res.status(400).json({ success: false, message: '该手机号已被其他球员使用' });
        }
      }

      await db.collection('players').doc(id).update({ data: updateData });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      console.error('[Players] 更新失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 更新球场档案（会员等级、消费卡、备注等）
  // PUT /api/players/:id/profile
  // Body: { clubId, memberType?, memberLevel?, memberCard?: { consumeCardNo?, cardType?,
  //         expireDate?, status? }, remark?, tags?, status? }
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/profile', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { clubId, memberType, memberLevel, memberCard: cardInput, remark, tags, status } = req.body || {};

      if (!clubId) return res.status(400).json({ success: false, message: '缺少 clubId' });

      const profRes = await db.collection('player_club_profiles')
        .where({ playerId: id, clubId }).limit(1).get();
      const prof = (profRes.data || [])[0];
      if (!prof) return res.status(404).json({ success: false, message: '该球场档案不存在' });

      const updateData = { updatedAt: new Date() };

      if (memberType && MEMBER_TYPES.includes(memberType)) {
        updateData.memberType = memberType;
      }
      if (memberLevel && MEMBER_LEVELS.includes(memberLevel)) {
        updateData.memberLevel = memberLevel;
        updateData.memberLevelName = MEMBER_LEVEL_NAMES[memberLevel];
      }
      if (remark !== undefined) updateData.remark = remark;
      if (tags !== undefined)   updateData.tags = tags;
      if (status !== undefined) updateData.status = status;

      // 逐字段更新 memberCard（避免覆盖 qrCode）
      if (cardInput) {
        if (cardInput.consumeCardNo !== undefined) {
          const newNo = String(cardInput.consumeCardNo).trim();
          if (newNo && newNo !== prof.memberCard?.consumeCardNo) {
            const dup = await db.collection('player_club_profiles')
              .where({ clubId, 'memberCard.consumeCardNo': newNo }).count();
            if ((dup.total || 0) > 0) {
              return res.status(400).json({ success: false, message: '该消费卡号已被使用' });
            }
          }
          updateData['memberCard.consumeCardNo'] = newNo;
        }
        if (cardInput.cardType)   updateData['memberCard.cardType']   = cardInput.cardType;
        if (cardInput.expireDate) updateData['memberCard.expireDate'] = new Date(cardInput.expireDate);
        if (cardInput.status)     updateData['memberCard.status']     = cardInput.status;
      }

      await db.collection('player_club_profiles')
        .where({ playerId: id, clubId }).update({ data: updateData });

      res.json({ success: true, message: '球场档案更新成功' });
    } catch (err) {
      console.error('[Players] profile 更新失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 账户充值
  // POST /api/players/:id/recharge
  // Body: { clubId, amount, paymentMethod, operatorId?, operatorName?, remark? }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/:id/recharge', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const { id } = req.params;
      const { clubId, amount, paymentMethod = 'cash', operatorId = '', operatorName = '', remark = '' } = req.body || {};

      if (!clubId) return res.status(400).json({ success: false, message: '缺少 clubId' });
      const amt = Number(amount);
      if (!amt || amt <= 0) return res.status(400).json({ success: false, message: '充值金额必须大于0' });

      // 查档案
      const profRes = await db.collection('player_club_profiles')
        .where({ playerId: id, clubId }).limit(1).get();
      const prof = (profRes.data || [])[0];
      if (!prof) return res.status(404).json({ success: false, message: '该球场档案不存在' });

      const balanceBefore = prof.account?.balance || 0;
      const balanceAfter  = balanceBefore + amt;
      const now = new Date();

      // 更新余额
      await db.collection('player_club_profiles')
        .where({ playerId: id, clubId })
        .update({
          data: {
            'account.balance':          balanceAfter,
            'account.totalRecharge':    _.inc(amt),
            'account.balanceUpdatedAt': now,
            updatedAt: now
          }
        });

      // 写交易流水
      const playerRes = await db.collection('players').doc(id).get();
      const player = playerRes.data && (Array.isArray(playerRes.data) ? playerRes.data[0] : playerRes.data);
      const transNo = `TXN${Date.now()}`;

      await db.collection('transactions').add({
        data: {
          clubId,
          transactionNo: transNo,
          playerId: id,
          playerNo:  player?.playerNo  || '',
          playerName: player?.name     || '',
          memberCardNumber: prof.memberCard?.cardNumber || '',
          transactionType: 'recharge',
          amount: amt,
          balanceBefore,
          balanceAfter,
          pointsChange: 0,
          paymentMethod,
          paymentMethodName: paymentMethod === 'cash' ? '现金' : paymentMethod === 'wechat' ? '微信' : paymentMethod,
          description: `账户充值 ${remark ? '- ' + remark : ''}`.trim(),
          status: 'success',
          operatorId,
          operatorName,
          transactionTime: now,
          createdAt: now
        }
      }).catch(e => console.warn('[Players] 充值流水写入失败:', e.message));

      res.json({
        success: true,
        message: `充值成功，当前余额 ¥${balanceAfter.toFixed(2)}`,
        data: { balanceBefore, balanceAfter, transactionNo: transNo }
      });
    } catch (err) {
      console.error('[Players] 充值失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 刷新消费二维码
  // POST /api/players/:id/refresh-qrcode
  // Body: { clubId }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/:id/refresh-qrcode', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { clubId } = req.body || {};
      if (!clubId) return res.status(400).json({ success: false, message: '缺少 clubId' });

      const newCode = generateQrCode();
      await db.collection('player_club_profiles')
        .where({ playerId: id, clubId })
        .update({
          data: {
            'memberCard.qrCode.code':      newCode,
            'memberCard.qrCode.isActive':  true,
            'memberCard.qrCode.expireTime': null,
            updatedAt: new Date()
          }
        });

      res.json({ success: true, message: '二维码已刷新', data: { qrCode: newCode } });
    } catch (err) {
      console.error('[Players] 刷新二维码失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 添加/更新车辆信息
  // POST /api/players/:id/vehicles
  // Body: { plateNo, plateColor?, carBrand?, carModel?, carColor?, isPrimary?, remark? }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/:id/vehicles', async (req, res) => {
    try {
      const db = getDb();
      const _ = db.command;
      const { id } = req.params;
      const { plateNo, plateColor = 'blue', carBrand = '', carModel = '', carColor = '', isPrimary = false, remark = '' } = req.body || {};

      if (!plateNo) return res.status(400).json({ success: false, message: '缺少 plateNo' });
      const plate = String(plateNo).trim().toUpperCase();

      const playerRes = await db.collection('players').doc(id).get();
      const player = playerRes.data && (Array.isArray(playerRes.data) ? playerRes.data[0] : playerRes.data);
      if (!player) return res.status(404).json({ success: false, message: '球员不存在' });

      const vehicles = Array.isArray(player.vehicles) ? [...player.vehicles] : [];

      // 如果车牌已存在，则更新；否则追加
      const existIdx = vehicles.findIndex(v => v.plateNo === plate);
      const newVehicle = {
        plateNo: plate,
        plateColor: PLATE_COLORS.includes(plateColor) ? plateColor : 'blue',
        carBrand,
        carModel,
        carColor,
        isPrimary: !!isPrimary,
        remark,
        addedAt: existIdx >= 0 ? vehicles[existIdx].addedAt : new Date()
      };

      if (isPrimary) {
        // 其他车辆取消主车状态
        vehicles.forEach(v => { v.isPrimary = false; });
      }

      if (existIdx >= 0) {
        vehicles[existIdx] = newVehicle;
      } else {
        vehicles.push(newVehicle);
      }

      await db.collection('players').doc(id).update({
        data: { vehicles, updatedAt: new Date() }
      });

      res.json({ success: true, message: existIdx >= 0 ? '车辆信息已更新' : '车辆已添加', data: { vehicles } });
    } catch (err) {
      console.error('[Players] 添加车辆失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 软删除球员
  // DELETE /api/players/:id
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;

      await db.collection('players').doc(id).update({
        data: { status: 'deleted', deletedAt: new Date(), updatedAt: new Date() }
      });

      res.json({ success: true, message: '已删除' });
    } catch (err) {
      console.error('[Players] 删除失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
}

module.exports = createPlayersRouter;
