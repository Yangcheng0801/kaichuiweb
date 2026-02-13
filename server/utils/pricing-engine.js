/**
 * 定价引擎 (Pricing Engine) v2
 *
 * 核心升级：
 *   1. 动态身份定价 — prices: Record<string, number> 代替固定 priceWalkin/priceGuest/priceMember1-4
 *   2. 加打定价 (addOnPrices) — 完赛后追加 9 洞的折扣价
 *   3. 减打定价 (reducedPlayPolicy) — 未打满全程的退款/折扣策略
 *   4. 向后兼容旧版 rate_sheets（自动将 priceWalkin 等字段映射为 prices 对象）
 *
 * 数据流：
 *   1. determineDayType()  → 查 special_dates → 或按星期判断 → weekday|weekend|holiday
 *   2. determineTimeSlot() → 根据 teeTime 映射 → morning|afternoon|twilight
 *   3. matchRateSheet()    → 从 rate_sheets 中按优先级匹配最佳规则
 *   4. getGreenFee()       → 从规则 prices{} 中取对应身份价格
 *   5. getAddOnFee()       → 从规则 addOnPrices{} 中取加打价格
 *   6. getReducedFee()     → 根据 reducedPlayPolicy 计算减打价格
 *   7. calculateBookingPrice() → 主函数，组合以上逻辑
 *
 * @param {Function} getDb - 注入的数据库获取函数
 */

// ─── 日期类型判定 ────────────────────────────────────────────────────────────
/**
 * 判定某个日期的定价类型
 * 优先查 special_dates 集合（节假日/会员日/赛事日/封场），
 * 无匹配时按星期几自动判断
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

  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const isWeekend = day === 0 || day === 6;

  return {
    dayType: isWeekend ? 'weekend' : 'weekday',
    dateName: null,
    isClosed: false,
  };
}

// ─── 时段判定 ────────────────────────────────────────────────────────────────
function determineTimeSlot(teeTime) {
  if (!teeTime) return 'morning';
  const hour = parseInt(teeTime.split(':')[0], 10);
  if (hour < 12) return 'morning';
  if (hour < 16) return 'afternoon';
  return 'twilight';
}

// ─── 匹配价格规则 ────────────────────────────────────────────────────────────
async function matchRateSheet(db, clubId, courseId, dayType, timeSlot, holes, dateStr) {
  try {
    const cond = { clubId, dayType, timeSlot, status: 'active' };

    const res = await db.collection('rate_sheets')
      .where(cond)
      .orderBy('priority', 'desc')
      .limit(20)
      .get();

    if (!res.data || res.data.length === 0) return null;

    const now = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();

    for (const rule of res.data) {
      if (rule.courseId && courseId && rule.courseId !== courseId) continue;
      if (rule.holes && holes && rule.holes !== holes) continue;

      if (rule.validFrom) {
        const from = new Date(rule.validFrom);
        if (now < from) continue;
      }
      if (rule.validTo) {
        const to = new Date(rule.validTo);
        to.setHours(23, 59, 59, 999);
        if (now > to) continue;
      }

      return rule;
    }

    return null;
  } catch (e) {
    console.warn('[PricingEngine] 匹配 rate_sheets 失败:', e.message);
    return null;
  }
}

// ─── 从规则中提取标准化 prices 对象 ──────────────────────────────────────────
/**
 * 兼容旧版：如果 rate_sheet 没有 prices{}，从 priceWalkin/priceGuest/priceMember1-4 构建
 */
function normalizePrices(rateSheet) {
  if (!rateSheet) return {};
  if (rateSheet.prices && typeof rateSheet.prices === 'object' && Object.keys(rateSheet.prices).length > 0) {
    return rateSheet.prices;
  }
  // 向后兼容：从旧字段构建
  const prices = {};
  if (rateSheet.priceWalkin !== undefined)  prices.walkin    = Number(rateSheet.priceWalkin);
  if (rateSheet.priceGuest !== undefined)   prices.guest     = Number(rateSheet.priceGuest);
  if (rateSheet.priceMember1 !== undefined) prices.member_1  = Number(rateSheet.priceMember1);
  if (rateSheet.priceMember2 !== undefined) prices.member_2  = Number(rateSheet.priceMember2);
  if (rateSheet.priceMember3 !== undefined) prices.member_3  = Number(rateSheet.priceMember3);
  if (rateSheet.priceMember4 !== undefined) prices.member_4  = Number(rateSheet.priceMember4);
  return prices;
}

// ─── 从 prices 中取果岭费 ────────────────────────────────────────────────────
/**
 * 根据球员身份 code，从 prices 中取对应价格
 *
 * 降级逻辑：
 *   1. 精确匹配 identityCode（如 'member_2'、'junior'、'coach'）
 *   2. 如果是 member 类型但无精确匹配 → 取 member_1
 *   3. 如果是 guest → 取 guest → walkin
 *   4. 兜底 → walkin
 *
 * @param {object} rateSheet - 匹配到的价格规则
 * @param {string} identityCode - 身份代码（如 'walkin'、'member_2'、'junior'、'coach'）
 * @returns {number}
 */
function getGreenFee(rateSheet, identityCode) {
  if (!rateSheet) return 0;
  const prices = normalizePrices(rateSheet);
  if (!identityCode) identityCode = 'walkin';

  // 精确匹配
  if (prices[identityCode] !== undefined && prices[identityCode] !== null) {
    return Number(prices[identityCode]);
  }

  // 会员降级
  if (identityCode.startsWith('member_')) {
    if (prices.member_1 !== undefined) return Number(prices.member_1);
  }

  // 嘉宾降级
  if (identityCode === 'guest') {
    return Number(prices.walkin || 0);
  }

  // 兜底散客
  return Number(prices.walkin || 0);
}

// ─── 加打定价 (Add-On Round) ─────────────────────────────────────────────────
/**
 * 获取加打价格（完赛后追加 9 洞）
 *
 * @param {object} rateSheet - 匹配到的价格规则
 * @param {string} identityCode - 身份代码
 * @returns {{ fee: number, available: boolean, description: string }}
 */
function getAddOnFee(rateSheet, identityCode) {
  if (!rateSheet) return { fee: 0, available: false, description: '无价格规则' };
  if (!identityCode) identityCode = 'walkin';

  const addOnPrices = rateSheet.addOnPrices || {};

  // 如果有 addOnPrices 配置
  if (Object.keys(addOnPrices).length > 0) {
    // 精确匹配
    if (addOnPrices[identityCode] !== undefined && addOnPrices[identityCode] !== null) {
      return { fee: Number(addOnPrices[identityCode]), available: true, description: '加打9洞' };
    }
    // 会员降级
    if (identityCode.startsWith('member_') && addOnPrices.member_1 !== undefined) {
      return { fee: Number(addOnPrices.member_1), available: true, description: '加打9洞' };
    }
    // 散客兜底
    if (addOnPrices.walkin !== undefined) {
      return { fee: Number(addOnPrices.walkin), available: true, description: '加打9洞' };
    }
  }

  // 无专门加打价 → 按标准价的 50% 估算（行业惯例：加9洞 ≈ 标准18洞的 40%-60%）
  const standardFee = getGreenFee(rateSheet, identityCode);
  const estimatedFee = Math.round(standardFee * 0.5);
  return { fee: estimatedFee, available: true, description: '加打9洞（估算50%）' };
}

// ─── 减打定价 (Reduced Play) ─────────────────────────────────────────────────
/**
 * 计算减打价格（未打满全程）
 *
 * 策略类型：
 *   - proportional: 按比例（如打了9洞 = 标准价 × rate）
 *   - fixed_rate:   固定减打价（从 fixedPrices 中取）
 *   - no_refund:    不退款（全额收费）
 *
 * @param {object} rateSheet - 匹配到的价格规则
 * @param {string} identityCode - 身份代码
 * @param {number} holesPlayed - 实际打了几洞
 * @param {number} holesBooked - 预订的洞数
 * @returns {{ fee: number, policy: string, description: string }}
 */
function getReducedFee(rateSheet, identityCode, holesPlayed, holesBooked) {
  if (!rateSheet) return { fee: 0, policy: 'none', description: '无价格规则' };
  if (!identityCode) identityCode = 'walkin';

  const standardFee = getGreenFee(rateSheet, identityCode);
  const policy = rateSheet.reducedPlayPolicy || {};
  const policyType = policy.type || 'proportional';

  switch (policyType) {
    case 'no_refund':
      return { fee: standardFee, policy: 'no_refund', description: '全额收费（不退减打差额）' };

    case 'fixed_rate': {
      const fixedPrices = policy.fixedPrices || {};
      let fixedFee = fixedPrices[identityCode];
      if (fixedFee === undefined && identityCode.startsWith('member_')) fixedFee = fixedPrices.member_1;
      if (fixedFee === undefined) fixedFee = fixedPrices.walkin;
      if (fixedFee !== undefined) {
        return { fee: Number(fixedFee), policy: 'fixed_rate', description: `减打固定价` };
      }
      // 无固定价则降级为比例
      const rate = policy.rate || 0.6;
      return { fee: Math.round(standardFee * rate), policy: 'fixed_rate_fallback', description: `减打按${Math.round(rate * 100)}%收费` };
    }

    case 'proportional':
    default: {
      const rate = policy.rate || 0.6;
      // 如果打了 9 洞（18 洞预订），按比例
      const ratio = holesBooked > 0 ? (holesPlayed / holesBooked) : 1;
      const adjustedRate = Math.max(ratio, rate); // 不低于最低收费比例
      return { fee: Math.round(standardFee * adjustedRate), policy: 'proportional', description: `减打按${Math.round(adjustedRate * 100)}%收费` };
    }
  }
}

// ─── 团队折扣 ────────────────────────────────────────────────────────────────
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
async function calculatePackagePrice(db, clubId, packageId, identityCode, dayType) {
  if (!packageId) return null;
  if (!identityCode) identityCode = 'walkin';

  try {
    const res = await db.collection('stay_packages').doc(packageId).get();
    const pkg = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!pkg || pkg.status !== 'active') return null;

    const pricing = pkg.pricing || {};
    let price = 0;

    // 先尝试动态 prices 对象
    if (pricing.prices && typeof pricing.prices === 'object') {
      price = Number(pricing.prices[identityCode] || pricing.prices.walkin || pricing.basePrice || 0);
    } else {
      // 向后兼容旧字段
      if (identityCode.startsWith('member_')) {
        const level = identityCode.split('_')[1];
        const key = `priceMember${level}`;
        price = Number(pricing[key] || pricing.memberPrice || pricing.basePrice || 0);
      } else if (identityCode === 'guest') {
        price = Number(pricing.priceGuest || pricing.basePrice || 0);
      } else {
        price = Number(pricing.priceWalkin || pricing.basePrice || 0);
      }
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

// ─── 解析身份代码 ────────────────────────────────────────────────────────────
/**
 * 将前端传入的球员对象标准化为 identityCode
 *
 * 支持的输入格式：
 *   - { identityCode: 'junior' }   → 'junior'（新版）
 *   - { memberType: 'member', memberLevel: 2 } → 'member_2'（旧版兼容）
 *   - { type: 'walkin' }           → 'walkin'（旧版兼容）
 */
function resolveIdentityCode(player) {
  if (!player) return 'walkin';
  // 新版：直接有 identityCode
  if (player.identityCode) return player.identityCode;
  // 旧版兼容
  const mType = player.memberType || player.type || 'walkin';
  if (mType === 'member' && player.memberLevel) {
    return `member_${player.memberLevel}`;
  }
  return mType;
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
 * @param {Array}  input.players - [{ identityCode?, memberType?, memberLevel?, name }]
 * @param {boolean} [input.needCaddy=false]
 * @param {boolean} [input.needCart=false]
 * @param {string} [input.packageId]
 * @param {number} [input.totalPlayers]
 * @param {boolean} [input.isAddOn=false] - 是否为加打
 * @param {boolean} [input.isReduced=false] - 是否为减打
 * @param {number} [input.holesPlayed] - 实际打的洞数（减打时使用）
 * @returns {Promise<object>}
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
    isAddOn = false,
    isReduced = false,
    holesPlayed = 0,
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
  if (packageId && !isAddOn && !isReduced) {
    const firstPlayer = players[0] || {};
    const firstIdentity = resolveIdentityCode(firstPlayer);
    const pkgResult = await calculatePackagePrice(db, clubId, packageId, firstIdentity, dayInfo.dayType);

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
        greenFee: pkgResult.packagePrice,
        caddyFee: pkgResult.includes.caddyIncluded ? 0 : (rateSheet ? Number(rateSheet.caddyFee || 0) : 0),
        cartFee: pkgResult.includes.cartIncluded ? 0 : (rateSheet ? Number(rateSheet.cartFee || 0) : 0),
        insuranceFee: rateSheet ? Number(rateSheet.insuranceFee || 0) * players.length : 0,
        roomFee: 0,
        otherFee: 0,
        discount: 0,
        totalFee: 0,
        playerBreakdown: [],
        addOnInfo: null,
        reducedInfo: null,
      };
    }
  }

  // 5. 逐人计算果岭费
  const playerBreakdown = [];
  let totalGreenFee = 0;

  for (const p of players) {
    const identityCode = resolveIdentityCode(p);
    let fee = 0;
    let addOnInfo = null;
    let reducedInfo = null;

    if (isAddOn) {
      // 加打模式
      const addOnResult = getAddOnFee(rateSheet, identityCode);
      fee = addOnResult.fee;
      addOnInfo = addOnResult;
    } else if (isReduced) {
      // 减打模式
      const reducedResult = getReducedFee(rateSheet, identityCode, holesPlayed || 9, holes);
      fee = reducedResult.fee;
      reducedInfo = reducedResult;
    } else {
      // 标准模式
      fee = getGreenFee(rateSheet, identityCode);
    }

    totalGreenFee += fee;

    playerBreakdown.push({
      name: p.name || '',
      identityCode,
      greenFee: fee,
      addOnInfo,
      reducedInfo,
    });
  }

  // 6. 附加费
  const caddyFee = needCaddy ? Number(rateSheet ? rateSheet.caddyFee || 0 : 0) : 0;
  const cartFee = needCart ? Number(rateSheet ? rateSheet.cartFee || 0 : 0) : 0;
  // 加打时保险费通常不再重复收取
  const insuranceFee = isAddOn ? 0 : (Number(rateSheet ? rateSheet.insuranceFee || 0 : 0) * players.length);

  // 7. 团队折扣
  let discount = 0;
  let teamDiscountInfo = null;
  const effectiveTotal = totalPlayers || players.length;
  if (effectiveTotal >= 8 && !isAddOn && !isReduced) {
    const teamInfo = await getTeamDiscount(db, clubId, effectiveTotal);
    if (teamInfo.discountRate < 1) {
      const baseAmount = totalGreenFee;
      const discountedAmount = baseAmount * teamInfo.discountRate;
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

  // 9. 加打/减打汇总信息
  const addOnSummary = isAddOn ? {
    isAddOn: true,
    addOnHoles: 9,
    description: '加打9洞',
    hasCustomPrices: rateSheet?.addOnPrices && Object.keys(rateSheet.addOnPrices).length > 0,
  } : null;

  const reducedSummary = isReduced ? {
    isReduced: true,
    holesBooked: holes,
    holesPlayed: holesPlayed || 9,
    policy: rateSheet?.reducedPlayPolicy?.type || 'proportional',
    description: playerBreakdown[0]?.reducedInfo?.description || '减打',
  } : null;

  return {
    success: true,
    priceSource: isAddOn ? 'addOn' : (isReduced ? 'reduced' : 'auto'),
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
    // 加打/减打信息
    addOnInfo: addOnSummary,
    reducedInfo: reducedSummary,
    // 附加费标准
    feeStandards: rateSheet ? {
      caddyFeeUnit: Number(rateSheet.caddyFee || 0),
      cartFeeUnit: Number(rateSheet.cartFee || 0),
      insuranceFeeUnit: Number(rateSheet.insuranceFee || 0),
    } : null,
    // 加打/减打价格参考表（供前端预览）
    addOnPricesRef: rateSheet?.addOnPrices || null,
    reducedPolicyRef: rateSheet?.reducedPlayPolicy || null,
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
  normalizePrices,
  getGreenFee,
  getAddOnFee,
  getReducedFee,
  getTeamDiscount,
  calculatePackagePrice,
  calculateBookingPrice,
  resolveIdentityCode,
  DAY_TYPE_LABELS,
  TIME_SLOT_LABELS,
};
