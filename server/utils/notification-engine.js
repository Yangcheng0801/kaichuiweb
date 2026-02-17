/**
 * 通知引擎 (Notification Engine)
 *
 * 统一发送通知的核心工具，供所有业务模块调用。
 *
 * 设计要点：
 *   1. 集合：notifications（站内消息）、notification_settings（用户偏好）
 *   2. 渠道抽象：inApp（站内消息，立即写库）→ wechat（预留）→ sms（预留）→ email（预留）
 *   3. 通知类型枚举：便于前端按类型图标/颜色展示
 *   4. 优先级：normal / important / urgent
 *   5. 批量发送：支持 recipientIds 数组
 *
 * 导出：
 *   - send(db, opts)         — 发送一条通知
 *   - sendBatch(db, opts[])  — 批量发送
 *   - NOTIFICATION_TYPES     — 类型枚举
 */

// ─── 通知类型枚举 ─────────────────────────────────────────────────────
const NOTIFICATION_TYPES = {
  // 预订
  BOOKING_CONFIRMED:    'booking_confirmed',
  BOOKING_CANCELLED:    'booking_cancelled',
  BOOKING_CHECKED_IN:   'booking_checked_in',
  BOOKING_COMPLETED:    'booking_completed',
  BOOKING_REMINDER:     'booking_reminder',
  // 会籍
  MEMBERSHIP_ACTIVATED: 'membership_activated',
  MEMBERSHIP_EXPIRING:  'membership_expiring',
  MEMBERSHIP_EXPIRED:   'membership_expired',
  MEMBERSHIP_RENEWED:   'membership_renewed',
  // 赛事
  TOURNAMENT_REG_OPEN:  'tournament_reg_open',
  TOURNAMENT_REG_CLOSE: 'tournament_reg_close',
  TOURNAMENT_GROUPED:   'tournament_grouped',
  TOURNAMENT_STARTED:   'tournament_started',
  TOURNAMENT_RESULTS:   'tournament_results',
  TOURNAMENT_AWARD:     'tournament_award',
  // 积分
  POINTS_EARNED:        'points_earned',
  POINTS_REDEEMED:      'points_redeemed',
  // 账单
  FOLIO_OPENED:         'folio_opened',
  FOLIO_SETTLED:        'folio_settled',
  // 更衣柜
  LOCKER_CONTRACT_EXPIRING: 'locker_contract_expiring',
  LOCKER_CONTRACT_EXPIRED:  'locker_contract_expired',
  // 客房
  ROOM_CHECKIN_REMINDER:  'room_checkin_reminder',
  ROOM_CHECKOUT_REMINDER: 'room_checkout_reminder',
  // 系统
  SYSTEM_ANNOUNCEMENT:  'system_announcement',
  DAILY_REPORT:         'daily_report',
};

// ─── 类型 → 显示信息映射 ─────────────────────────────────────────────
const TYPE_META = {
  [NOTIFICATION_TYPES.BOOKING_CONFIRMED]:     { icon: 'calendar-check', color: 'emerald', category: 'booking',    label: '预订确认' },
  [NOTIFICATION_TYPES.BOOKING_CANCELLED]:     { icon: 'calendar-x',     color: 'red',     category: 'booking',    label: '预订取消' },
  [NOTIFICATION_TYPES.BOOKING_CHECKED_IN]:    { icon: 'log-in',         color: 'blue',    category: 'booking',    label: '签到通知' },
  [NOTIFICATION_TYPES.BOOKING_COMPLETED]:     { icon: 'flag',           color: 'gray',    category: 'booking',    label: '完赛通知' },
  [NOTIFICATION_TYPES.BOOKING_REMINDER]:      { icon: 'bell',           color: 'amber',   category: 'booking',    label: '预订提醒' },
  [NOTIFICATION_TYPES.MEMBERSHIP_ACTIVATED]:  { icon: 'crown',          color: 'amber',   category: 'membership', label: '会籍激活' },
  [NOTIFICATION_TYPES.MEMBERSHIP_EXPIRING]:   { icon: 'alert-triangle', color: 'orange',  category: 'membership', label: '会籍即将到期' },
  [NOTIFICATION_TYPES.MEMBERSHIP_EXPIRED]:    { icon: 'x-circle',       color: 'red',     category: 'membership', label: '会籍已过期' },
  [NOTIFICATION_TYPES.MEMBERSHIP_RENEWED]:    { icon: 'refresh-cw',     color: 'green',   category: 'membership', label: '会籍续费' },
  [NOTIFICATION_TYPES.TOURNAMENT_REG_OPEN]:   { icon: 'trophy',         color: 'purple',  category: 'tournament', label: '赛事报名开放' },
  [NOTIFICATION_TYPES.TOURNAMENT_REG_CLOSE]:  { icon: 'lock',           color: 'yellow',  category: 'tournament', label: '赛事报名截止' },
  [NOTIFICATION_TYPES.TOURNAMENT_GROUPED]:    { icon: 'grid',           color: 'indigo',  category: 'tournament', label: '分组公布' },
  [NOTIFICATION_TYPES.TOURNAMENT_STARTED]:    { icon: 'play',           color: 'green',   category: 'tournament', label: '赛事开始' },
  [NOTIFICATION_TYPES.TOURNAMENT_RESULTS]:    { icon: 'bar-chart',      color: 'blue',    category: 'tournament', label: '成绩发布' },
  [NOTIFICATION_TYPES.TOURNAMENT_AWARD]:      { icon: 'award',          color: 'amber',   category: 'tournament', label: '获奖通知' },
  [NOTIFICATION_TYPES.POINTS_EARNED]:         { icon: 'star',           color: 'amber',   category: 'points',     label: '积分赚取' },
  [NOTIFICATION_TYPES.POINTS_REDEEMED]:       { icon: 'gift',           color: 'purple',  category: 'points',     label: '积分兑换' },
  [NOTIFICATION_TYPES.FOLIO_OPENED]:          { icon: 'file-text',      color: 'blue',    category: 'folio',      label: '账单开启' },
  [NOTIFICATION_TYPES.FOLIO_SETTLED]:         { icon: 'check-circle',   color: 'green',   category: 'folio',      label: '账单结算' },
  [NOTIFICATION_TYPES.LOCKER_CONTRACT_EXPIRING]: { icon: 'alert-triangle', color: 'orange', category: 'locker',  label: '柜租即将到期' },
  [NOTIFICATION_TYPES.LOCKER_CONTRACT_EXPIRED]:  { icon: 'x-circle',      color: 'red',    category: 'locker',  label: '柜租已到期' },
  [NOTIFICATION_TYPES.ROOM_CHECKIN_REMINDER]:  { icon: 'log-in',        color: 'blue',    category: 'room',      label: '入住提醒' },
  [NOTIFICATION_TYPES.ROOM_CHECKOUT_REMINDER]: { icon: 'log-out',       color: 'orange',  category: 'room',      label: '退房提醒' },
  [NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT]:    { icon: 'megaphone',     color: 'indigo',  category: 'system',    label: '系统公告' },
  [NOTIFICATION_TYPES.DAILY_REPORT]:           { icon: 'file-bar-chart', color: 'cyan',   category: 'system',    label: '日结报告' },
};

// ─── 发送单条通知 ─────────────────────────────────────────────────────
/**
 * @param {object} db - 数据库实例
 * @param {object} opts
 * @param {string} opts.clubId
 * @param {string} opts.type          - NOTIFICATION_TYPES 中的值
 * @param {string} opts.title         - 通知标题
 * @param {string} opts.content       - 通知正文
 * @param {string} [opts.recipientId] - 接收人 userId（站内消息）
 * @param {string} [opts.recipientRole] - 接收角色（如 'admin'、'frontdesk'）→ 群发
 * @param {string} [opts.priority]    - normal | important | urgent
 * @param {string} [opts.sourceId]    - 关联业务 ID（预订ID/赛事ID 等）
 * @param {string} [opts.sourceType]  - 关联业务类型（booking/tournament/membership）
 * @param {object} [opts.extra]       - 额外数据（前端点击跳转等）
 * @param {string[]} [opts.channels]  - 渠道列表，默认 ['inApp']
 * @returns {Promise<string>} 通知ID
 */
async function send(db, opts) {
  const {
    clubId = 'default',
    type,
    title,
    content = '',
    recipientId = null,
    recipientRole = null,
    priority = 'normal',
    sourceId = null,
    sourceType = null,
    extra = {},
    channels = ['inApp'],
  } = opts;

  if (!type || !title) {
    console.warn('[NotificationEngine] type 和 title 必填');
    return null;
  }

  const meta = TYPE_META[type] || {};
  const now = new Date().toISOString();

  const doc = {
    clubId,
    type,
    category: meta.category || 'system',
    icon: meta.icon || 'bell',
    color: meta.color || 'gray',
    typeLabel: meta.label || type,
    title,
    content,
    recipientId,
    recipientRole,
    priority,
    sourceId,
    sourceType,
    extra,
    channels,
    // 状态
    read: false,
    readAt: null,
    archived: false,
    // 渠道投递状态
    deliveryStatus: {
      inApp: channels.includes('inApp') ? 'delivered' : 'skipped',
      wechat: channels.includes('wechat') ? 'pending' : 'skipped',
      sms: channels.includes('sms') ? 'pending' : 'skipped',
      email: channels.includes('email') ? 'pending' : 'skipped',
    },
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await db.collection('notifications').add({ data: doc });
    const id = result._id || result.id;

    // 微信渠道：预留（后期实现模板消息推送）
    if (channels.includes('wechat')) {
      // TODO: 调用微信订阅消息 API
      console.log(`[Notification] 微信渠道预留: ${type} → ${recipientId || recipientRole}`);
    }

    // 短信渠道：预留
    if (channels.includes('sms')) {
      // TODO: 调用第三方短信 API
      console.log(`[Notification] 短信渠道预留: ${type} → ${recipientId || recipientRole}`);
    }

    console.log(`[Notification] 站内通知已发送: [${meta.label || type}] ${title} → ${recipientId || recipientRole || 'all'}`);
    return id;
  } catch (e) {
    console.error('[NotificationEngine] 发送失败:', e.message);
    return null;
  }
}

// ─── 批量发送（多个接收人） ────────────────────────────────────────────
/**
 * @param {object} db
 * @param {object} opts - 同 send，但 recipientIds 替代 recipientId
 * @param {string[]} opts.recipientIds - 接收人 ID 数组
 */
async function sendBatch(db, opts) {
  const { recipientIds = [], ...rest } = opts;
  const results = [];
  for (const rid of recipientIds) {
    const id = await send(db, { ...rest, recipientId: rid });
    results.push({ recipientId: rid, notificationId: id });
  }
  return results;
}

// ─── 发送给指定角色的所有用户 ─────────────────────────────────────────
/**
 * @param {object} db
 * @param {object} opts - 同 send，但用 recipientRole 群发
 */
async function sendToRole(db, opts) {
  const { recipientRole, clubId = 'default', ...rest } = opts;
  if (!recipientRole) return [];

  try {
    const usersRes = await db.collection('users')
      .where({ clubId, role: recipientRole })
      .limit(200)
      .get();
    const users = usersRes.data || [];
    const ids = users.map(u => u._id);
    return sendBatch(db, { ...rest, clubId, recipientIds: ids });
  } catch (e) {
    console.warn('[NotificationEngine] sendToRole 失败:', e.message);
    // 降级：只写一条角色通知
    return [{ notificationId: await send(db, { ...opts, clubId }) }];
  }
}

// ─── 便捷方法：预订通知 ─────────────────────────────────────────────
async function notifyBooking(db, clubId, type, booking, recipientId) {
  const orderNo = booking.orderNo || '';
  const playerName = booking.players?.[0]?.name || '';
  const date = booking.date || '';
  const teeTime = booking.teeTime || '';

  const titles = {
    [NOTIFICATION_TYPES.BOOKING_CONFIRMED]:  `预订已确认 ${orderNo}`,
    [NOTIFICATION_TYPES.BOOKING_CANCELLED]:  `预订已取消 ${orderNo}`,
    [NOTIFICATION_TYPES.BOOKING_CHECKED_IN]: `${playerName} 已签到`,
    [NOTIFICATION_TYPES.BOOKING_COMPLETED]:  `${playerName} 已完赛`,
    [NOTIFICATION_TYPES.BOOKING_REMINDER]:   `明日预订提醒 ${orderNo}`,
  };

  return send(db, {
    clubId, type,
    title: titles[type] || `预订通知 ${orderNo}`,
    content: `${playerName} | ${date} ${teeTime} | ${booking.courseName || ''}`,
    recipientId,
    sourceId: booking._id,
    sourceType: 'booking',
    extra: { orderNo, date, teeTime, bookingId: booking._id },
  });
}

// ─── 便捷方法：会籍通知 ─────────────────────────────────────────────
async function notifyMembership(db, clubId, type, membership, recipientId) {
  const titles = {
    [NOTIFICATION_TYPES.MEMBERSHIP_ACTIVATED]: `会籍已激活: ${membership.planName || ''}`,
    [NOTIFICATION_TYPES.MEMBERSHIP_EXPIRING]:  `您的会籍将于 ${membership.endDate || ''} 到期`,
    [NOTIFICATION_TYPES.MEMBERSHIP_EXPIRED]:   `您的会籍已过期`,
    [NOTIFICATION_TYPES.MEMBERSHIP_RENEWED]:   `会籍续费成功: ${membership.planName || ''}`,
  };

  return send(db, {
    clubId, type,
    title: titles[type] || '会籍通知',
    content: `会籍编号: ${membership.membershipNo || ''} | ${membership.planName || ''}`,
    recipientId: recipientId || membership.playerId,
    priority: type === NOTIFICATION_TYPES.MEMBERSHIP_EXPIRING ? 'important' : 'normal',
    sourceId: membership._id,
    sourceType: 'membership',
    extra: { membershipId: membership._id, membershipNo: membership.membershipNo },
  });
}

// ─── 便捷方法：赛事通知 ─────────────────────────────────────────────
async function notifyTournament(db, clubId, type, tournament, recipientIds) {
  const titles = {
    [NOTIFICATION_TYPES.TOURNAMENT_REG_OPEN]:  `赛事报名开放: ${tournament.name}`,
    [NOTIFICATION_TYPES.TOURNAMENT_REG_CLOSE]: `赛事报名截止: ${tournament.name}`,
    [NOTIFICATION_TYPES.TOURNAMENT_GROUPED]:   `分组已公布: ${tournament.name}`,
    [NOTIFICATION_TYPES.TOURNAMENT_STARTED]:   `赛事开始: ${tournament.name}`,
    [NOTIFICATION_TYPES.TOURNAMENT_RESULTS]:   `成绩已发布: ${tournament.name}`,
  };

  if (recipientIds && recipientIds.length > 0) {
    return sendBatch(db, {
      clubId, type,
      title: titles[type] || `赛事通知: ${tournament.name}`,
      content: `${tournament.tournamentNo} | ${tournament.startDate || ''} | ${tournament.courseName || ''}`,
      recipientIds,
      sourceId: tournament._id,
      sourceType: 'tournament',
      extra: { tournamentId: tournament._id, tournamentNo: tournament.tournamentNo },
    });
  }

  return send(db, {
    clubId, type,
    title: titles[type] || `赛事通知: ${tournament.name}`,
    content: `${tournament.tournamentNo} | ${tournament.startDate || ''}`,
    recipientRole: 'all',
    sourceId: tournament._id,
    sourceType: 'tournament',
  });
}

// ─── 便捷方法：积分通知 ─────────────────────────────────────────────
async function notifyPoints(db, clubId, type, playerId, playerName, amount, balance) {
  const isEarn = type === NOTIFICATION_TYPES.POINTS_EARNED;
  return send(db, {
    clubId, type,
    title: isEarn ? `获得 ${amount} 积分` : `消费 ${amount} 积分`,
    content: `${playerName || ''} 当前积分余额: ${balance}`,
    recipientId: playerId,
    sourceType: 'points',
    extra: { amount, balance },
  });
}

module.exports = {
  NOTIFICATION_TYPES,
  TYPE_META,
  send,
  sendBatch,
  sendToRole,
  notifyBooking,
  notifyMembership,
  notifyTournament,
  notifyPoints,
};
