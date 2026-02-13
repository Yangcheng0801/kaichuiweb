/**
 * 定价引擎 (Pricing Engine)
 *
 * 核心职责：根据日期/时段/球场/身份自动计算价格
 *
 * 数据流：
 *   1. determineDayType()  → 查 special_dates → 或按星期判断 → weekday|weekend|holiday
 *   2. determineTimeSlot() → 根据 teeTime 映射 → morning|afternoon|twilight
 *   3. matchRateSheet()    → 从 rate_sheets 中按优先级匹配最佳规则
 *   4. getGreenFee()       → 从规则中取对应身份价格
 *   5. calculateBookingPrice() → 主函数，组合以上逻辑
 *
 * @param {Function} getDb - 注入的数据库获取函数
 */

// ─── 日期类型判定 ────────────────────────────────────────────────────────────
/**
 * 判定某个日期的定价类型
 * 优先查 special_dates 集合（节假日/会员日/赛事日/封场），
 * 无匹配时按星期几自动判断
 *
 * @param {object} db - 数据库实例
 * @param {string} clubId
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<{dayType: string, dateName: string|null, isClosed: boolean}>}
 */
async function determineDayType(db, clubId, dateStr) {
  try {
    const res = await db.collection('special_dates')
      .where({ clubId, date: dateStr })
      .limit(1)
      .get();

    if (res.data && res.data.length > 0) {
      const sd = res.data[0];
      return {
        dayType: sd.pricingOverride || sd.dateType || 'holiday',
        dateName: sd.dateName || null,
        isClosed: !!sd.isClosed,
      };
    }
  } catch (e) {
    console.warn('[PricingEngine] 查询 special_dates 失败:', e.message);
  }

  // 无特殊日期标记 → 按星期判断
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun, 6=Sat
  const isWeekend = day === 0 || day === 6;

  return {
    dayType: isWeekend ? 'weekend' : 'weekday',
    dateName: null,
    isClosed: false,
  };
}

// ─── 时段判定 ────────────────────────────────────────────────────────────────
/**
 * 根据发球时间判定时段
 * @param {string} teeTime - HH:mm 格式
 * @returns {string} morning | afternoon | twilight
 */
function determineTimeSlot(teeTime) {
  if (!teeTime) return 'morning';
  const hour = parseInt(teeTime.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 16) return 'afternoon';
  return 'twilight';
}

// ─── 匹配价格规则 ────────────────────────────────────────────────────────────
/**
 * 从 rate_sheets 集合中找到最高优先级的匹配规则
 *
 * 匹配维度：clubId + dayType + timeSlot + courseId(可选) + holes(可选) + 有效期
 * 排序：priority 降序，第一条即为最佳匹配
 *
 * @param {object} db
 * @param {string} clubId
 * @param {string|null} courseId
 * @param {string} dayType
 * @param {string} timeSlot
 * @param {number} holes - 18 或 9
 * @param {string} dateStr - YYYY-MM-DD 用于有效期判断
 * @returns {Promise<object|null>} 匹配到的价格规则，或 null
 */
async function matchRateSheet(db, clubId, courseId, dayType, timeSlot, holes, dateStr) {
  try {
    // 查询条件：clubId + dayType + timeSlot + status=active
    const cond = {
      clubId,
      dayType,
      timeSlot,
      status: 'active',
    };

    const res = await db.collection('rate_sheets')
      .where(cond)
      .orderBy('priority', 'desc')
      .limit(20)
      .get();

    if (!res.data || res.data.length === 0) return null;

    const now = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();

    // 在客户端侧过滤：courseId、holes、有效期
    for (const rule of res.data) {
      // courseId 匹配：规则的 courseId 为 null/空 表示适用所有球场
      if (rule.courseId && courseId && rule.courseId !== courseId) continue;

      // holes 匹配：规则的 holes 为 0 或未设置表示不限
      if (rule.holes && holes && rule.holes !== holes) continue;

      // 有效期匹配
      if (rule.validFrom) {
        const from = new Date(rule.validFrom);
        if (now < from) continue;
      }
      if (rule.validTo) {
        const to = new Date(rule.validTo);
        // validTo 当天有效（包含）
        to.setHours(23, 59, 59, 999);
        if (now > to) continue;
      }

      return rule; // 第一条有效的 = 最高优先级
    }

    return null;
  } catch (e) {
    console.warn('[PricingEngine] 匹配 rate_sheets 失败:', e.message);
    return null;
  }
}

// ─── 从规则中提取果岭费 ──────────────────────────────────────────────────────
/**
 * 根据球员身份和会员等级，从匹配的价格规则中取出果岭费
 *
 * @param {object} rateSheet - matchRateSheet 返回的规则
 * @param {string} memberType - member | guest | walkin
 * @param {number|null} memberLevel - 1~4（仅 member 时有效）
 * @returns {number} 果岭费
 */
function getGreenFee(rateSheet, memberType, memberLevel) {
  if (!rateSheet) return 0;

  if (memberType === 'member' && memberLevel) {
    const key = `priceMember${memberLevel}`;
    if (rateSheet[key] !== undefined && rateSheet[key] !== null) {
      return Number(rateSheet[key]);
    }
    // 降级：没有对应等级价格，取 priceMember1
    if (rateSheet.priceMember1 !== undefined) return Number(rateSheet.priceMember1);
  }

  if (memberType === 'guest') {
    return Number(rateSheet.priceGuest || rateSheet.priceWalkin || 0);
  }

  // 散客 / 默认
  return Number(rateSheet.priceWalkin || 0);
}

// ─── 团队折扣 ────────────────────────────────────────────────────────────────
/**
 * 根据团队人数查找适用的团队折扣率
 *
 * @param {object} db
 * @param {string} clubId
 * @param {number} totalPlayers - 总人数
 * @returns {Promise<{discountRate: number, label: string, floorPriceRate: number}>}
 */
async function getTeamDiscount(db, clubId, totalPlayers) {
  const noDiscount = { discountRate: 1, label: '', floorPriceRate: 0.6 };
  if (!totalPlayers || totalPlayers < 2) return noDiscount;

  try {
    const res = await db.collection('team_pricing')
      .where({ clubId })
      .limit(1)
      .get();

    if (!res.data || res.data.length === 0) return noDiscount;

    const config = res.data[0];
    if (!config.enabled) return noDiscount;

    const tiers = config.tiers || [];
    // 按 minPlayers 降序排列，找到第一个匹配的
    const sorted = [...tiers].sort((a, b) => b.minPlayers - a.minPlayers);

    for (const tier of sorted) {
      if (totalPlayers >= tier.minPlayers && totalPlayers <= (tier.maxPlayers || 999)) {
        return {
          discountRate: tier.discountRate || 1,
          label: tier.label || '',
          floorPriceRate: config.floorPriceRate || 0.6,
        };
      }
    }

    return noDiscount;
  } catch (e) {
    console.warn('[PricingEngine] 查询 team_pricing 失败:', e.message);
    return noDiscount;
  }
}

// ─── 套餐价格计算 ────────────────────────────────────────────────────────────
/**
 * 根据套餐ID获取套餐价格
 *
 * @param {object} db
 * @param {string} clubId
 * @param {string} packageId
 * @param {string} memberType
 * @param {number|null} memberLevel
 * @param {string} dayType
 * @returns {Promise<object|null>}
 */
async function calculatePackagePrice(db, clubId, packageId, memberType, memberLevel, dayType) {
  if (!packageId) return null;

  try {
    const res = await db.collection('stay_packages').doc(packageId).get();
    const pkg = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!pkg || pkg.status !== 'active') return null;

    const pricing = pkg.pricing || {};
    let price = 0;

    // 按身份取价格
    if (memberType === 'member' && memberLevel) {
      const key = `priceMember${memberLevel}`;
      price = Number(pricing[key] || pricing.memberPrice || pricing.basePrice || 0);
    } else if (memberType === 'guest') {
      price = Number(pricing.priceGuest || pricing.basePrice || 0);
    } else {
      price = Number(pricing.priceWalkin || pricing.basePrice || 0);
    }

    // 周末加价
    if (dayType === 'weekend' || dayType === 'holiday') {
      price += Number(pricing.weekendSurcharge || 0);
    }

    return {
      packageId: pkg._id,
      packageName: pkg.packageName,
      packageCode: pkg.packageCode,
      includes: pkg.includes || {},
      packagePrice: price,
      isPackage: true,
    };
  } catch (e) {
    console.warn('[PricingEngine] 获取套餐价格失败:', e.message);
    return null;
  }
}

// ─── 主函数：计算预订价格 ────────────────────────────────────────────────────
/**
 * 计算一个预订的完整价格明细
 *
 * @param {object} db
 * @param {object} input
 * @param {string} input.clubId
 * @param {string} input.date - YYYY-MM-DD
 * @param {string} input.teeTime - HH:mm
 * @param {string} [input.courseId]
 * @param {number} [input.holes=18]
 * @param {Array}  input.players - [{ memberType, memberLevel, name }]
 * @param {boolean} [input.needCaddy=false]
 * @param {boolean} [input.needCart=false]
 * @param {string} [input.packageId] - 套餐ID（可选）
 * @param {number} [input.totalPlayers] - 总人数（用于团队折扣，可选）
 * @returns {Promise<object>} 完整的价格计算结果
 */
async function calculateBookingPrice(db, input) {
  const {
    clubId = 'default',
    date,
    teeTime,
    courseId = null,
    holes = 18,
    players = [],
    needCaddy = false,
    needCart = false,
    packageId = null,
    totalPlayers = 0,
  } = input;

  // 1. 判定日期类型
  const dayInfo = await determineDayType(db, clubId, date);
  if (dayInfo.isClosed) {
    return {
      success: false,
      error: `${date} 为封场日（${dayInfo.dateName || ''}），无法预订`,
      dayType: dayInfo.dayType,
      isClosed: true,
    };
  }

  // 2. 判定时段
  const timeSlot = determineTimeSlot(teeTime);

  // 3. 匹配价格规则
  const rateSheet = await matchRateSheet(db, clubId, courseId, dayInfo.dayType, timeSlot, holes, date);

  // 4. 如果有套餐，走套餐定价
  if (packageId) {
    const firstPlayer = players[0] || {};
    const pkgResult = await calculatePackagePrice(
      db, clubId, packageId,
      firstPlayer.memberType || firstPlayer.type || 'walkin',
      firstPlayer.memberLevel || null,
      dayInfo.dayType
    );

    if (pkgResult) {
      return {
        success: true,
        priceSource: 'package',
        dayType: dayInfo.dayType,
        dayTypeName: DAY_TYPE_LABELS[dayInfo.dayType] || dayInfo.dayType,
        dateName: dayInfo.dateName,
        timeSlot,
        timeSlotName: TIME_SLOT_LABELS[timeSlot] || timeSlot,
        rateSheetId: rateSheet ? rateSheet._id : null,
        rateSheetName: rateSheet ? rateSheet.ruleName : null,
        package: pkgResult,
        // 套餐价 = 整单总价
        greenFee: pkgResult.packagePrice,
        caddyFee: pkgResult.includes.caddyIncluded ? 0 : (rateSheet ? Number(rateSheet.caddyFee || 0) : 0),
        cartFee: pkgResult.includes.cartIncluded ? 0 : (rateSheet ? Number(rateSheet.cartFee || 0) : 0),
        insuranceFee: rateSheet ? Number(rateSheet.insuranceFee || 0) * players.length : 0,
        roomFee: 0, // 套餐已包含
        otherFee: 0,
        discount: 0,
        totalFee: 0, // 下面计算
        playerBreakdown: [],
      };
    }
  }

  // 5. 逐人计算果岭费
  const playerBreakdown = [];
  let totalGreenFee = 0;

  for (const p of players) {
    const mType = p.memberType || p.type || 'walkin';
    const mLevel = p.memberLevel || null;
    const fee = getGreenFee(rateSheet, mType, mLevel);
    totalGreenFee += fee;

    playerBreakdown.push({
      name: p.name || '',
      memberType: mType,
      memberLevel: mLevel,
      greenFee: fee,
    });
  }

  // 6. 附加费
  const caddyFee = needCaddy ? Number(rateSheet ? rateSheet.caddyFee || 0 : 0) : 0;
  const cartFee = needCart ? Number(rateSheet ? rateSheet.cartFee || 0 : 0) : 0;
  const insuranceFee = Number(rateSheet ? rateSheet.insuranceFee || 0 : 0) * players.length;

  // 7. 团队折扣
  let discount = 0;
  let teamDiscountInfo = null;
  const effectiveTotal = totalPlayers || players.length;
  if (effectiveTotal >= 8) {
    const teamInfo = await getTeamDiscount(db, clubId, effectiveTotal);
    if (teamInfo.discountRate < 1) {
      const baseAmount = totalGreenFee;
      const discountedAmount = baseAmount * teamInfo.discountRate;
      // 底价保护
      const floorAmount = baseAmount * teamInfo.floorPriceRate;
      const finalAmount = Math.max(discountedAmount, floorAmount);
      discount = Math.round((baseAmount - finalAmount) * 100) / 100;
      teamDiscountInfo = {
        totalPlayers: effectiveTotal,
        discountRate: teamInfo.discountRate,
        label: teamInfo.label,
        originalGreenFee: baseAmount,
        discountedGreenFee: finalAmount,
        discountAmount: discount,
      };
    }
  }

  // 8. 合计
  const totalFee = Math.round((totalGreenFee + caddyFee + cartFee + insuranceFee - discount) * 100) / 100;

  return {
    success: true,
    priceSource: 'auto',
    dayType: dayInfo.dayType,
    dayTypeName: DAY_TYPE_LABELS[dayInfo.dayType] || dayInfo.dayType,
    dateName: dayInfo.dateName,
    timeSlot,
    timeSlotName: TIME_SLOT_LABELS[timeSlot] || timeSlot,
    rateSheetId: rateSheet ? rateSheet._id : null,
    rateSheetName: rateSheet ? rateSheet.ruleName : null,
    hasRateSheet: !!rateSheet,
    // 明细
    greenFee: totalGreenFee,
    caddyFee,
    cartFee,
    insuranceFee,
    roomFee: 0,
    otherFee: 0,
    discount,
    totalFee,
    // 球员明细
    playerBreakdown,
    // 团队折扣
    teamDiscount: teamDiscountInfo,
    // 附加费标准（方便前端显示单价）
    feeStandards: rateSheet ? {
      caddyFeeUnit: Number(rateSheet.caddyFee || 0),
      cartFeeUnit: Number(rateSheet.cartFee || 0),
      insuranceFeeUnit: Number(rateSheet.insuranceFee || 0),
    } : null,
  };
}

// ─── 标签映射 ────────────────────────────────────────────────────────────────
const DAY_TYPE_LABELS = {
  weekday: '平日',
  weekend: '周末',
  holiday: '假日',
};

const TIME_SLOT_LABELS = {
  morning: '早场',
  afternoon: '午场',
  twilight: '黄昏',
};

// ─── 导出 ────────────────────────────────────────────────────────────────────
module.exports = {
  determineDayType,
  determineTimeSlot,
  matchRateSheet,
  getGreenFee,
  getTeamDiscount,
  calculatePackagePrice,
  calculateBookingPrice,
  DAY_TYPE_LABELS,
  TIME_SLOT_LABELS,
};
