/**
 * 预订管理路由（前台代订模式）
 *
 * 业务流程：
 *   创建预订 → confirmed → checked_in（签到）→ completed（完赛）
 *                       → cancelled（取消，含退还球童状态）
 *
 * 新增能力（v2）：
 *   - orderNo：ORD + 日期8位 + 3位序号，创建时自动生成
 *   - pricing{}：费用结构（果岭费/球童费/球车费/保险/客房/合计/已付/待付）
 *   - payments[]：支付记录数组，POST /:id/pay 追加，支持组合支付
 *   - statusHistory[]：每次状态变更自动追加（时间+操作人+旧状态）
 *   - version：乐观锁版本号，防并发覆写
 *
 * 球童联动：
 *   创建预订时若指定 caddyId → 球童状态改为 busy
 *   取消/变更球童时           → 旧球童改回 available
 *
 * @param {Function} getDb - 由 app.js 注入
 */
function createBookingsRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  // 会籍权益引擎（惰性加载）
  let _benefitsEngine = null;
  function getBenefitsEngine() {
    if (!_benefitsEngine) {
      try { _benefitsEngine = require('../utils/benefits-engine'); }
      catch (e) { console.warn('[Bookings] benefits-engine 不可用:', e.message); }
    }
    return _benefitsEngine;
  }

  // ─── 状态常量 ────────────────────────────────────────────────────────────────
  const BOOKING_STATUS = {
    PENDING:     'pending',      // 待确认
    CONFIRMED:   'confirmed',    // 已确认
    CHECKED_IN:  'checked_in',   // 已签到
    COMPLETED:   'completed',    // 已完赛
    CANCELLED:   'cancelled',    // 已取消
  };

  // 允许的状态流转映射（key = 当前状态，value = 可流转到的状态列表）
  const ALLOWED_TRANSITIONS = {
    pending:    ['confirmed', 'cancelled'],
    confirmed:  ['checked_in', 'cancelled'],
    checked_in: ['completed'],
    completed:  [],
    cancelled:  [],
  };

  // ─── 工具：生成订单号 ────────────────────────────────────────────────────────
  // 格式：ORD + 日期8位（YYYYMMDD）+ 3位序号（当日累计，不足补零）
  async function generateOrderNo(db, date) {
    const dateStr = (date || new Date().toISOString()).slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const prefix = `ORD${dateStr}`;
    try {
      // 查找当日已有多少条订单
      const countRes = await db.collection('bookings')
        .where({ orderNo: db.RegExp({ regexp: `^${prefix}`, options: '' }) })
        .count();
      const seq = String((countRes.total || 0) + 1).padStart(3, '0');
      return `${prefix}${seq}`;
    } catch (e) {
      // 查询失败时用时间戳兜底
      const fallback = String(Date.now()).slice(-5);
      return `${prefix}${fallback}`;
    }
  }

  // ─── 工具：释放球童（改回 available）────────────────────────────────────────
  async function releaseCaddy(db, caddyId) {
    if (!caddyId) return;
    try {
      await db.collection('caddies').doc(caddyId).update({
        data: { status: 'available', updateTime: new Date() }
      });
      console.log(`[Bookings] 球童 ${caddyId} 已释放`);
    } catch (e) {
      console.warn(`[Bookings] 释放球童失败 ${caddyId}:`, e.message);
    }
  }

  // ─── 工具：占用球童（改为 busy）──────────────────────────────────────────────
  async function occupyCaddy(db, caddyId) {
    if (!caddyId) return;
    try {
      await db.collection('caddies').doc(caddyId).update({
        data: { status: 'busy', updateTime: new Date() }
      });
      console.log(`[Bookings] 球童 ${caddyId} 已占用`);
    } catch (e) {
      console.warn(`[Bookings] 占用球童失败 ${caddyId}:`, e.message);
    }
  }

  // ─── 工具：占用更衣柜 ──────────────────────────────────────────────────────
  async function occupyLocker(db, lockerId, bookingId, playerName) {
    if (!lockerId) return;
    try {
      await db.collection('lockers').doc(lockerId).update({
        data: { status: 'occupied', currentBookingId: bookingId, currentPlayerName: playerName || '', updateTime: new Date() }
      });
      console.log(`[Bookings] 更衣柜 ${lockerId} 已占用`);
    } catch (e) {
      console.warn(`[Bookings] 占用更衣柜失败 ${lockerId}:`, e.message);
    }
  }

  // ─── 工具：释放更衣柜 ──────────────────────────────────────────────────────
  async function releaseLocker(db, lockerId) {
    if (!lockerId) return;
    try {
      await db.collection('lockers').doc(lockerId).update({
        data: { status: 'available', currentBookingId: null, currentPlayerName: null, updateTime: new Date() }
      });
      console.log(`[Bookings] 更衣柜 ${lockerId} 已释放`);
    } catch (e) {
      console.warn(`[Bookings] 释放更衣柜失败 ${lockerId}:`, e.message);
    }
  }

  // ─── 工具：占用客房 ────────────────────────────────────────────────────────
  async function occupyRoom(db, roomId, bookingId, guestName) {
    if (!roomId) return;
    try {
      await db.collection('rooms').doc(roomId).update({
        data: { status: 'occupied', currentBookingId: bookingId, currentGuestName: guestName || '', updateTime: new Date() }
      });
      console.log(`[Bookings] 客房 ${roomId} 已占用`);
    } catch (e) {
      console.warn(`[Bookings] 占用客房失败 ${roomId}:`, e.message);
    }
  }

  // ─── 工具：释放客房 ────────────────────────────────────────────────────────
  async function releaseRoom(db, roomId) {
    if (!roomId) return;
    try {
      await db.collection('rooms').doc(roomId).update({
        data: { status: 'cleaning', currentBookingId: null, currentGuestName: null, updateTime: new Date() }
      });
      console.log(`[Bookings] 客房 ${roomId} 已释放（清洁中）`);
    } catch (e) {
      console.warn(`[Bookings] 释放客房失败 ${roomId}:`, e.message);
    }
  }

  // ─── 工具：回收临时消费卡 ──────────────────────────────────────────────────
  async function returnTempCard(db, cardId) {
    if (!cardId) return;
    try {
      const cardRes = await db.collection('temp_consume_cards').doc(cardId).get();
      const card = Array.isArray(cardRes.data) ? cardRes.data[0] : cardRes.data;
      if (!card) return;
      const newStatus = card.cardType === 'virtual' ? 'retired' : 'available';
      await db.collection('temp_consume_cards').doc(cardId).update({
        data: { status: newStatus, currentBookingId: null, currentPlayerName: null, returnedAt: new Date(), updateTime: new Date() }
      });
      console.log(`[Bookings] 临时消费卡 ${cardId} 已回收`);
    } catch (e) {
      console.warn(`[Bookings] 回收消费卡失败 ${cardId}:`, e.message);
    }
  }

  // ─── 工具：释放预订的所有资源 ──────────────────────────────────────────────
  async function releaseAllResources(db, booking) {
    const res = booking.assignedResources || {};
    // 球童
    await releaseCaddy(db, res.caddyId || booking.caddyId);
    // 更衣柜
    if (Array.isArray(res.lockers)) {
      for (const l of res.lockers) {
        if (l.lockerId) await releaseLocker(db, l.lockerId);
      }
    }
    // 客房
    if (Array.isArray(res.rooms)) {
      for (const r of res.rooms) {
        if (r.roomId) await releaseRoom(db, r.roomId);
      }
    }
    // 临时消费卡
    if (res.tempCardId) await returnTempCard(db, res.tempCardId);
  }

  // ─── 工具：分页参数解析 ──────────────────────────────────────────────────────
  function parsePage(query) {
    let page = parseInt(query.page, 10);
    let pageSize = parseInt(query.pageSize, 10);
    page = Number.isFinite(page) && page > 0 ? page : 1;
    pageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;
    return { page, pageSize };
  }

  // ─── 工具：构建初始 pricing 对象 ─────────────────────────────────────────────
  function buildPricing(body) {
    const totalFee = Number(body.totalFee || 0);
    const paidFee  = Number(body.paidFee  || 0);
    return {
      greenFee:     Number(body.greenFee     || 0),  // 果岭费
      caddyFee:     Number(body.caddyFee     || 0),  // 球童费
      cartFee:      Number(body.cartFee      || 0),  // 球车费
      insuranceFee: Number(body.insuranceFee || 0),  // 保险费
      roomFee:      Number(body.roomFee      || 0),  // 客房费
      otherFee:     Number(body.otherFee     || 0),  // 其他费用
      discount:     Number(body.discount     || 0),  // 折扣金额（正数表示减免）
      totalFee,                                       // 应收合计
      paidFee,                                        // 已收金额
      pendingFee:   totalFee - paidFee,               // 待收金额（修复 bug: 旧版直接用 totalFee）
      // v2: 定价引擎追踪字段
      priceSource:  body.priceSource || 'manual',     // auto | manual | package
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/bookings/tee-sheet  发球表（某天某球场的全部预订，按时间排序）
  // query: date（YYYY-MM-DD 必填）, courseId（可选）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/tee-sheet', async (req, res) => {
    try {
      const db = getDb();
      const { date, courseId } = req.query;
      if (!date) return res.status(400).json({ success: false, error: '请传入 date 参数（YYYY-MM-DD）' });

      const cond = { date };
      if (courseId) cond.courseId = courseId;

      const result = await db.collection('bookings')
        .where(cond)
        .orderBy('teeTime', 'asc')
        .limit(100)
        .get();

      res.json({ success: true, data: result.data, date, courseId: courseId || null });
    } catch (error) {
      console.error('[Bookings] 获取发球表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/bookings  预订列表（分页 + 多维筛选）
  // query: page, pageSize, status, date, courseId, caddyId, keyword
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { page, pageSize } = parsePage(req.query);
      const { status, date, courseId, caddyId, orderNo } = req.query;

      const cond = {};
      if (status)   cond.status   = status;
      if (date)     cond.date     = date;
      if (courseId) cond.courseId = courseId;
      if (caddyId)  cond.caddyId  = caddyId;
      if (orderNo)  cond.orderNo  = orderNo;

      const hasWhere = Object.keys(cond).length > 0;
      const base = hasWhere
        ? db.collection('bookings').where(cond)
        : db.collection('bookings');

      const result = await base
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      res.json({ success: true, data: result.data, total: result.data.length, page, pageSize });
    } catch (error) {
      console.error('[Bookings] 获取预订列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/bookings/:id  预订详情
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bookings').doc(req.params.id).get();
      const item = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!item) return res.status(404).json({ success: false, error: '预订记录不存在' });
      res.json({ success: true, data: item });
    } catch (error) {
      console.error('[Bookings] 获取预订详情失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/bookings  创建预订（v3：自动定价引擎 + 团队支持 + 套餐关联）
  //
  // Body 必填：date, teeTime, courseId, courseName, players(array)
  // Body 可选：caddyId, caddyName, caddyFee, cartId, cartNo, cartFee,
  //            greenFee, insuranceFee, roomFee, otherFee, discount, totalFee,
  //            note, source, createdBy, createdByName, clubId,
  //            stayType（day/overnight_1/overnight_2/overnight_3/custom）
  //            packageId, priceOverride(bool), priceSource(auto/manual/package)
  //            teamBooking: { isTeam, teamName, totalPlayers, contactName, contactPhone }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const { date, teeTime, courseId, courseName, players } = req.body;

      // 基础参数校验
      if (!date)       return res.status(400).json({ success: false, error: '请填写预订日期' });
      if (!teeTime)    return res.status(400).json({ success: false, error: '请填写发球时间' });
      if (!courseId)   return res.status(400).json({ success: false, error: '请选择球场' });
      if (!players || !Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ success: false, error: '请至少填写一位球员' });
      }

      const {
        caddyId    = null, caddyName = '',
        cartId     = null, cartNo    = '',
        note       = '', source    = 'staff',
        createdBy  = '', createdByName = '',
        clubId     = 'default',
        stayType   = 'day',   // day | overnight_1 | overnight_2 | overnight_3 | custom
        packageId  = null,    // 套餐ID（可选）
        priceOverride = false, // true = 前端手动覆盖价格，不走引擎
        holes      = 18,
        needCaddy  = false,
        needCart    = false,
        teamBooking = null,   // { isTeam, teamName, totalPlayers, contactName, contactPhone }
      } = req.body;

      // 生成订单号
      const orderNo = await generateOrderNo(db, date);

      // ── 定价引擎：自动算价或手动覆盖 ─────────────────────────────────────────
      let pricing;
      let pricingResult = null;

      if (priceOverride) {
        // 前端手动填写，直接透传
        pricing = buildPricing({ ...req.body, priceSource: 'manual' });
      } else {
        // 调用定价引擎自动计算
        try {
          const { calculateBookingPrice } = require('../utils/pricing-engine');
          pricingResult = await calculateBookingPrice(db, {
            clubId, date, teeTime, courseId, holes,
            players, needCaddy, needCart, packageId,
            totalPlayers: teamBooking ? (teamBooking.totalPlayers || players.length) : players.length,
          });

          if (pricingResult && pricingResult.success) {
            pricing = buildPricing({
              greenFee:     pricingResult.greenFee || 0,
              caddyFee:     pricingResult.caddyFee || 0,
              cartFee:      pricingResult.cartFee  || 0,
              insuranceFee: pricingResult.insuranceFee || 0,
              roomFee:      pricingResult.roomFee  || 0,
              otherFee:     pricingResult.otherFee || 0,
              discount:     pricingResult.discount || 0,
              totalFee:     pricingResult.totalFee || 0,
              priceSource:  pricingResult.priceSource || 'auto',
            });
          } else {
            // 引擎返回失败（例如封场），但前端未覆盖 → 用手动兜底
            console.warn('[Bookings] 定价引擎未命中规则，使用手动价格:', pricingResult?.error);
            pricing = buildPricing({ ...req.body, priceSource: 'manual' });
          }
        } catch (engineErr) {
          console.warn('[Bookings] 定价引擎异常，降级为手动价格:', engineErr.message);
          pricing = buildPricing({ ...req.body, priceSource: 'manual' });
        }
      }

      // 初始状态历史
      const statusHistory = [{
        status: BOOKING_STATUS.CONFIRMED,
        time:   new Date(),
        by:     createdBy || '',
        byName: createdByName || '',
        note:   '创建预订',
      }];

      const bookingData = {
        // 订单标识
        orderNo,
        // 核心信息
        date, teeTime, courseId, courseName,
        players,          // [{ name, type/memberType, memberLevel?, phone?, memberId?, playerNo? }]
        playerCount: players.length,
        holes: Number(holes) || 18,
        // 资源（预订阶段填写，到场后可在 assignedResources 中细化）
        caddyId, caddyName,
        cartId,  cartNo,
        // 费用
        pricing,
        totalFee: pricing.totalFee,   // 冗余一份方便发球表显示
        // 定价追踪
        priceSource: pricing.priceSource || 'manual',
        pricingSnapshot: pricingResult ? {
          dayType: pricingResult.dayType,
          timeSlot: pricingResult.timeSlot,
          rateSheetId: pricingResult.rateSheetId,
          playerBreakdown: pricingResult.playerBreakdown,
          teamDiscount: pricingResult.teamDiscount,
          packageInfo: pricingResult.package || null,
        } : null,
        // 套餐关联
        packageId: packageId || null,
        // 团队信息
        teamBooking: teamBooking ? {
          isTeam: !!teamBooking.isTeam,
          teamName: teamBooking.teamName || '',
          totalPlayers: Number(teamBooking.totalPlayers) || players.length,
          contactName: teamBooking.contactName || '',
          contactPhone: teamBooking.contactPhone || '',
          discountApplied: pricingResult?.teamDiscount?.discountRate || 1,
        } : null,
        // 支付记录（收银台完成后追加）
        payments: [],
        // 状态
        status: BOOKING_STATUS.CONFIRMED,
        statusHistory,
        version: 1,
        // 到访资源（签到时填写）
        assignedResources: {
          caddyId:    caddyId || null,
          caddyName:  caddyName || '',
          cartId:     cartId  || null,
          cartNo:     cartNo  || '',
          lockers:    [],   // [{ lockerNo, area }]
          rooms:      [],   // [{ roomNo, type }]
          bagStorage: [],   // [{ bagNo, location }]
          parking:    null, // { plateNo, companions: [] }
        },
        // 住宿类型（统一枚举：day | overnight_1 | overnight_2 | overnight_3 | custom）
        stayType,
        // 元数据
        source,       // 'staff' | 'miniprogram'
        note,
        createdBy,
        createdByName,
        clubId,
        createTime: new Date(),
        updateTime: new Date(),
      };

      const result = await db.collection('bookings').add({ data: bookingData });

      // 占用球童
      if (caddyId) await occupyCaddy(db, caddyId);

      console.log(`[Bookings] 预订创建成功: ${orderNo}, 定价来源: ${pricing.priceSource}`);
      res.json({ success: true, data: { _id: result._id, ...bookingData }, message: '预订创建成功' });
    } catch (error) {
      console.error('[Bookings] 创建预订失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/bookings/:id  更新预订（改信息 / 改状态）
  //
  // 状态变更时自动追加 statusHistory；球童换人时联动释放/占用
  // Body 可选包含 version（乐观锁校验）
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;

      // 取旧记录
      const oldResult = await db.collection('bookings').doc(id).get();
      const old = Array.isArray(oldResult.data) ? oldResult.data[0] : oldResult.data;
      if (!old) return res.status(404).json({ success: false, error: '预订记录不存在' });

      // 乐观锁校验（version 字段存在时才校验）
      if (req.body.version !== undefined && old.version !== undefined) {
        if (Number(req.body.version) !== Number(old.version)) {
          return res.status(409).json({
            success: false,
            error: '数据已被他人修改，请刷新后重试',
            code: 'VERSION_CONFLICT',
          });
        }
      }

      const { _id, createTime, version: _ver, ...fields } = req.body;

      // ── 状态流转合法性校验 ────────────────────────────────────────────────────
      if (fields.status && fields.status !== old.status) {
        const allowed = ALLOWED_TRANSITIONS[old.status] || [];
        if (!allowed.includes(fields.status)) {
          return res.status(400).json({
            success: false,
            error: `不允许从 ${old.status} 变更为 ${fields.status}`,
          });
        }
      }

      // ── 构建更新数据 ──────────────────────────────────────────────────────────
      const updateData = { ...fields, updateTime: new Date(), version: (Number(old.version) || 0) + 1 };

      // 状态变更时追加历史记录
      if (fields.status && fields.status !== old.status) {
        const historyEntry = {
          status:  fields.status,
          time:    new Date(),
          by:      fields.updatedBy || fields.operatorId || '',
          byName:  fields.updatedByName || fields.operatorName || '',
          note:    fields.statusNote || '',
        };
        // TCB 数组追加：若原先没有 statusHistory 则创建
        const existing = Array.isArray(old.statusHistory) ? old.statusHistory : [];
        updateData.statusHistory = [...existing, historyEntry];
      }

      // pricing 同步：若传入了 pricing 字段就整体替换，若只传了单项费用字段则合并
      if (fields.pricing) {
        // 前端传了完整 pricing 对象，直接用
        updateData.pricing = fields.pricing;
        updateData.totalFee = fields.pricing.totalFee || 0;
      } else {
        // 检查是否有单项费用更新
        const feeKeys = ['greenFee', 'caddyFee', 'cartFee', 'insuranceFee', 'roomFee', 'otherFee', 'discount', 'totalFee', 'paidFee'];
        const hasFeeUpdate = feeKeys.some(k => fields[k] !== undefined);
        if (hasFeeUpdate) {
          const merged = { ...(old.pricing || {}), ...Object.fromEntries(feeKeys.filter(k => fields[k] !== undefined).map(k => [k, Number(fields[k])])) };
          merged.pendingFee = (merged.totalFee || 0) - (merged.paidFee || 0);
          updateData.pricing = merged;
          updateData.totalFee = merged.totalFee || 0;
        }
      }

      await db.collection('bookings').doc(id).update({ data: updateData });

      // ── 球童联动 ────────────────────────────────────────────────────────────
      const newCaddyId = fields.caddyId !== undefined ? fields.caddyId : old.caddyId;
      const oldCaddyId = old.caddyId;
      if (oldCaddyId !== newCaddyId) {
        await releaseCaddy(db, oldCaddyId);
        await occupyCaddy(db, newCaddyId);
      }
      // 取消/完赛后释放全部资源（球童 + 更衣柜 + 客房 + 临时消费卡）
      if (
        (fields.status === BOOKING_STATUS.CANCELLED || fields.status === BOOKING_STATUS.COMPLETED) &&
        old.status !== fields.status
      ) {
        await releaseAllResources(db, old);
      }

      // ── 完赛：会籍权益扣减 + 消费金额累计 ────────────────────────────────────
      if (fields.status === BOOKING_STATUS.COMPLETED && old.status !== BOOKING_STATUS.COMPLETED) {
        const be = getBenefitsEngine();
        if (be) {
          const bookingClubId = old.clubId || 'default';
          const bookingPlayers = old.players || [];
          const snapshot = old.pricingSnapshot || {};
          const breakdown = snapshot.playerBreakdown || [];

          for (const p of bookingPlayers) {
            const pid = p.playerId || p.memberId;
            if (!pid) continue;

            try {
              // 查找该球员在定价快照中是否使用了免费轮次
              const pBreakdown = breakdown.find(b => b.playerId === pid);
              const usedFreeRound = pBreakdown?.benefitsInfo?.type === 'freeRound';

              if (usedFreeRound) {
                const consumed = await be.consumeFreeRound(db, bookingClubId, pid);
                console.log(`[Bookings] 球员 ${pid} 免费轮次扣减: ${consumed ? '成功' : '失败/无剩余'}`);
              }

              // 累计消费金额到会籍（用该球员的果岭费作为其个人消费）
              const pFee = pBreakdown?.greenFee || 0;
              const totalAmount = pFee + (old.pricing?.caddyFee || 0) / bookingPlayers.length
                + (old.pricing?.cartFee || 0) / bookingPlayers.length;
              if (totalAmount > 0) {
                await be.addConsumption(db, bookingClubId, pid, Math.round(totalAmount * 100) / 100);
                console.log(`[Bookings] 球员 ${pid} 消费累计: ¥${totalAmount.toFixed(2)}`);
              }
            } catch (e) {
              console.warn(`[Bookings] 球员 ${pid} 会籍权益更新失败:`, e.message);
            }
          }
        }
      }

      console.log(`[Bookings] 预订 ${id} 更新成功，状态: ${old.status} → ${fields.status || old.status}`);
      res.json({ success: true, message: '预订更新成功' });
    } catch (error) {
      console.error('[Bookings] 更新预订失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/bookings/:id/pay  收款（追加支付记录，更新已付/待付金额）
  //
  // Body 必填：amount（本次收款金额）, payMethod（cash/wechat/alipay/card/transfer/mixed）
  // Body 可选：note, operatorId, operatorName
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/:id/pay', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { amount, payMethod, note = '', operatorId = '', operatorName = '' } = req.body;

      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ success: false, error: '请填写有效的收款金额' });
      }
      if (!payMethod) {
        return res.status(400).json({ success: false, error: '请选择收款方式' });
      }

      // 取当前记录
      const oldResult = await db.collection('bookings').doc(id).get();
      const booking = Array.isArray(oldResult.data) ? oldResult.data[0] : oldResult.data;
      if (!booking) return res.status(404).json({ success: false, error: '预订记录不存在' });

      // 构建支付记录
      const payRecord = {
        amount:       Number(amount),
        payMethod,    // cash | wechat | alipay | card | transfer | member_card | mixed
        time:         new Date(),
        operatorId,
        operatorName,
        note,
      };

      const existingPayments = Array.isArray(booking.payments) ? booking.payments : [];
      const newPayments = [...existingPayments, payRecord];

      // 计算新的已付/待付金额
      const totalPaid = newPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const oldPricing = booking.pricing || {};
      const totalFee = Number(oldPricing.totalFee || booking.totalFee || 0);
      const pendingFee = Math.max(0, totalFee - totalPaid);

      const newPricing = {
        ...oldPricing,
        paidFee:    totalPaid,
        pendingFee,
      };

      await db.collection('bookings').doc(id).update({
        data: {
          payments:   newPayments,
          pricing:    newPricing,
          updateTime: new Date(),
          version:    (Number(booking.version) || 0) + 1,
        }
      });

      console.log(`[Bookings] 预订 ${id} 收款 ¥${amount}，方式: ${payMethod}，待付: ¥${pendingFee}`);
      res.json({
        success: true,
        message: '收款成功',
        data: { totalPaid, pendingFee, payRecord },
      });
    } catch (error) {
      console.error('[Bookings] 收款失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/bookings/:id/payments  获取支付记录列表
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/:id/payments', async (req, res) => {
    try {
      const db = getDb();
      const result = await db.collection('bookings').doc(req.params.id).get();
      const item = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!item) return res.status(404).json({ success: false, error: '预订记录不存在' });

      res.json({
        success: true,
        data: {
          payments:   item.payments   || [],
          pricing:    item.pricing    || {},
          totalFee:   item.totalFee   || 0,
        },
      });
    } catch (error) {
      console.error('[Bookings] 获取支付记录失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/bookings/:id/resources  更新到访资源分配（签到时填写）
  //
  // Body 可包含：
  //   caddyId, caddyName,                     -- 球童
  //   cartId, cartNo,                          -- 球车
  //   lockers: [{ lockerId, lockerNo, area }], -- 更衣柜（带实体ID）
  //   rooms: [{ roomId, roomNo, roomType, checkInDate, checkOutDate, nights }], -- 客房
  //   bagStorage: [{ bagNo, location, description }],
  //   parking: { plateNo, companions: [...] },
  //   tempCardId, tempCardNo,                  -- 临时消费卡（实体卡）
  //   generateTempCard: true,                  -- 系统生成虚拟卡号
  //   stayType: 'day_trip' | 'overnight',      -- 住宿类型
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/resources', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;

      const oldResult = await db.collection('bookings').doc(id).get();
      const old = Array.isArray(oldResult.data) ? oldResult.data[0] : oldResult.data;
      if (!old) return res.status(404).json({ success: false, error: '预订记录不存在' });

      const {
        caddyId, caddyName, cartId, cartNo,
        lockers, rooms, bagStorage, parking,
        tempCardId, tempCardNo, generateTempCard,
        stayType,
      } = req.body;

      const oldAssigned = old.assignedResources || {};
      const newAssigned = {
        ...oldAssigned,
        ...(caddyId    !== undefined ? { caddyId }   : {}),
        ...(caddyName  !== undefined ? { caddyName } : {}),
        ...(cartId     !== undefined ? { cartId }    : {}),
        ...(cartNo     !== undefined ? { cartNo }    : {}),
        ...(lockers    !== undefined ? { lockers }   : {}),
        ...(rooms      !== undefined ? { rooms }     : {}),
        ...(bagStorage !== undefined ? { bagStorage }: {}),
        ...(parking    !== undefined ? { parking }   : {}),
      };

      // ── 球童变更联动 ────────────────────────────────────────────────────────
      const oldCaddyId = oldAssigned.caddyId || old.caddyId;
      const newCaddyId = caddyId !== undefined ? caddyId : oldCaddyId;
      if (oldCaddyId !== newCaddyId) {
        await releaseCaddy(db, oldCaddyId);
        await occupyCaddy(db, newCaddyId);
        newAssigned.caddyId   = newCaddyId;
        newAssigned.caddyName = caddyName || '';
      }

      // ── 更衣柜联动 ─────────────────────────────────────────────────────────
      if (lockers !== undefined) {
        // 释放旧更衣柜
        const oldLockers = oldAssigned.lockers || [];
        for (const ol of oldLockers) {
          if (ol.lockerId) await releaseLocker(db, ol.lockerId);
        }
        // 占用新更衣柜
        const playerName = (old.players && old.players[0]?.name) || '';
        for (const nl of (lockers || [])) {
          if (nl.lockerId) await occupyLocker(db, nl.lockerId, id, playerName);
        }
      }

      // ── 客房联动 ───────────────────────────────────────────────────────────
      if (rooms !== undefined) {
        const oldRooms = oldAssigned.rooms || [];
        for (const or_ of oldRooms) {
          if (or_.roomId) await releaseRoom(db, or_.roomId);
        }
        const guestName = (old.players && old.players[0]?.name) || '';
        for (const nr of (rooms || [])) {
          if (nr.roomId) await occupyRoom(db, nr.roomId, id, guestName);
        }
      }

      // ── 临时消费卡 ─────────────────────────────────────────────────────────
      if (tempCardId) {
        // 发放实体卡
        const playerName = (old.players && old.players[0]?.name) || '';
        try {
          await db.collection('temp_consume_cards').doc(tempCardId).update({
            data: { status: 'in_use', currentBookingId: id, currentPlayerName: playerName, issuedAt: new Date(), updateTime: new Date() }
          });
        } catch (e) { console.warn('[Bookings] 发放消费卡失败:', e.message); }
        newAssigned.tempCardId = tempCardId;
        newAssigned.tempCardNo = tempCardNo || '';
      } else if (generateTempCard) {
        // 系统生成虚拟卡
        const playerName = (old.players && old.players[0]?.name) || '';
        const clubId = old.clubId || 'default';
        try {
          // 生成虚拟卡号
          let cardNo = `V${Date.now().toString().slice(-6)}`;
          const data = {
            cardNo, cardType: 'virtual', status: 'in_use',
            currentBookingId: id, currentPlayerName: playerName,
            issuedAt: new Date(), returnedAt: null, clubId,
            createTime: new Date(), updateTime: new Date(),
          };
          const cardResult = await db.collection('temp_consume_cards').add({ data });
          newAssigned.tempCardId = cardResult._id;
          newAssigned.tempCardNo = cardNo;
          console.log(`[Bookings] 生成虚拟消费卡 ${cardNo} → 预订 ${id}`);
        } catch (e) { console.warn('[Bookings] 生成虚拟消费卡失败:', e.message); }
      }

      // ── 住宿类型 ───────────────────────────────────────────────────────────
      const extraUpdate = {};
      if (stayType !== undefined) extraUpdate.stayType = stayType;

      // ── Folio 自动开户 + 初始费用挂账 ──────────────────────────────────────
      let folioId = oldAssigned.folioId || null;
      try {
        if (!folioId) {
          // 签到时自动创建 Folio
          const clubId = old.clubId || 'default';
          const playerName = (old.players && old.players[0]?.name) || old.playerName || '';
          const cardNo = newAssigned.tempCardNo || oldAssigned.tempCardNo || '';

          // 生成 Folio 编号
          const d = new Date();
          const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
          const folioPrefix = `F${dateStr}`;
          let folioNo;
          try {
            const cnt = await db.collection('folios')
              .where({ clubId, folioNo: db.RegExp({ regexp: `^${folioPrefix}`, options: '' }) })
              .count();
            folioNo = `${folioPrefix}${String((cnt.total || 0) + 1).padStart(3, '0')}`;
          } catch { folioNo = `${folioPrefix}${String(Date.now()).slice(-5)}`; }

          const folio = {
            clubId, folioNo, folioType: 'booking', status: 'open',
            bookingId: id, playerId: old.playerId || null,
            cardNo: cardNo || null, roomNo: null,
            guestName: playerName, guestPhone: '',
            totalCharges: 0, totalPayments: 0, balance: 0,
            settledAt: null, settledBy: null,
            openedAt: d, closedAt: null, createdAt: d, updatedAt: d,
          };
          const folioRes = await db.collection('folios').add(folio);
          folioId = folioRes.id || folioRes._id;
          newAssigned.folioId = folioId;
          newAssigned.folioNo = folioNo;
          console.log(`[Bookings] 自动创建 Folio ${folioNo} → 预订 ${id}`);

          // 将预订费用作为初始 charges 写入
          const pricing = old.pricing || {};
          const charges = [];
          if (pricing.greenFee > 0)     charges.push({ chargeType: 'green_fee',  description: '果岭费', amount: pricing.greenFee });
          if (pricing.caddyFee > 0)     charges.push({ chargeType: 'caddy_fee',  description: '球童费', amount: pricing.caddyFee });
          if (pricing.cartFee > 0)      charges.push({ chargeType: 'cart_fee',   description: '球车费', amount: pricing.cartFee });
          if (pricing.insuranceFee > 0) charges.push({ chargeType: 'insurance',  description: '保险费', amount: pricing.insuranceFee });
          if (pricing.roomFee > 0)      charges.push({ chargeType: 'room',       description: '客房费', amount: pricing.roomFee });
          if (pricing.otherFee > 0)     charges.push({ chargeType: 'other',      description: '其他费用', amount: pricing.otherFee });

          for (const c of charges) {
            await db.collection('folio_charges').add({
              clubId, folioId,
              chargeType: c.chargeType, chargeSource: '预订系统', sourceId: id,
              description: c.description, amount: c.amount, quantity: 1, unitPrice: c.amount,
              operatorId: null, operatorName: '', chargeTime: d, status: 'posted', voidReason: null, createdAt: d,
            });
          }

          // 更新 folio 汇总
          if (charges.length > 0) {
            const totalCharges = charges.reduce((s, c) => s + c.amount, 0);
            await db.collection('folios').doc(folioId).update({
              totalCharges: Math.round(totalCharges * 100) / 100,
              balance: Math.round(totalCharges * 100) / 100,
              updatedAt: new Date(),
            });
          }
        }
      } catch (e) { console.warn('[Bookings] Folio 开户/挂账失败:', e.message); }

      await db.collection('bookings').doc(id).update({
        data: {
          assignedResources: newAssigned,
          ...(caddyId   !== undefined ? { caddyId, caddyName: caddyName || '' } : {}),
          ...(cartNo    !== undefined ? { cartNo } : {}),
          ...extraUpdate,
          updateTime: new Date(),
          version: (Number(old.version) || 0) + 1,
        }
      });

      res.json({ success: true, message: '资源分配更新成功', data: newAssigned, folioId });
    } catch (error) {
      console.error('[Bookings] 更新资源分配失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE /api/bookings/:id  删除预订（仅限已取消 / 已完赛的记录）
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;

      const oldResult = await db.collection('bookings').doc(id).get();
      const old = Array.isArray(oldResult.data) ? oldResult.data[0] : oldResult.data;
      if (!old) return res.status(404).json({ success: false, error: '预订记录不存在' });

      // 删除前确保球童释放（防止状态残留）
      if (old.status !== BOOKING_STATUS.CANCELLED && old.status !== BOOKING_STATUS.COMPLETED) {
        await releaseCaddy(db, old.caddyId);
      }

      await db.collection('bookings').doc(id).remove();
      console.log(`[Bookings] 预订 ${id}（${old.orderNo || '无单号'}）已删除`);
      res.json({ success: true, message: '预订已删除' });
    } catch (error) {
      console.error('[Bookings] 删除预订失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createBookingsRouter;
