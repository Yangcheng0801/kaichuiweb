/**
 * 权益引擎工具函数
 *
 * 查询球员有效会籍 → 返回当前可用权益 → 供定价引擎和预订模块调用
 *
 * 导出:
 *  - getActiveMembership(db, clubId, playerId) → membership | null
 *  - getPlayerBenefits(db, clubId, playerId)  → BenefitsResult
 *  - consumeFreeRound(db, clubId, playerId)   → boolean
 *  - consumeGuestQuota(db, clubId, playerId, count) → boolean
 *  - addConsumption(db, clubId, playerId, amount) → void
 */

/**
 * 查找球员当前有效会籍（active / expiring）
 */
async function getActiveMembership(db, clubId, playerId) {
  const result = await db.collection('memberships')
    .where({ clubId, playerId })
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  const memberships = result.data || [];
  return memberships.find(m => ['active', 'expiring'].includes(m.status)) || null;
}

/**
 * 获取球员当前可用权益
 * 返回格式：
 * {
 *   hasMembership: boolean,
 *   membershipId, membershipNo, planName, planCategory, status,
 *   benefits: { freeRounds, discountRate, guestQuota, ... },
 *   usage: { roundsUsed, guestBrought, totalConsumption },
 *   remaining: { freeRounds: 36, guestQuota: 9 },
 *   canUseFreeRound: boolean,
 *   canBringGuest: boolean,
 *   discountRate: number,
 * }
 */
async function getPlayerBenefits(db, clubId, playerId) {
  const membership = await getActiveMembership(db, clubId, playerId);

  if (!membership) {
    return {
      hasMembership: false,
      membershipId: null,
      membershipNo: null,
      planName: null,
      planCategory: null,
      status: null,
      benefits: {},
      usage: {},
      remaining: {},
      canUseFreeRound: false,
      canBringGuest: false,
      discountRate: 1,
    };
  }

  const benefits = membership.benefits || {};
  const usage = membership.usage || { roundsUsed: 0, guestBrought: 0, totalConsumption: 0 };

  const totalFreeRounds = Number(benefits.freeRounds) || 0;
  const totalGuestQuota = Number(benefits.guestQuota) || 0;
  const roundsUsed = Number(usage.roundsUsed) || 0;
  const guestBrought = Number(usage.guestBrought) || 0;

  const remainingFreeRounds = totalFreeRounds > 0 ? Math.max(0, totalFreeRounds - roundsUsed) : Infinity;
  const remainingGuestQuota = totalGuestQuota > 0 ? Math.max(0, totalGuestQuota - guestBrought) : 0;

  return {
    hasMembership: true,
    membershipId: membership._id,
    membershipNo: membership.membershipNo,
    planName: membership.planName,
    planCategory: membership.planCategory,
    status: membership.status,
    benefits,
    usage,
    remaining: {
      freeRounds: totalFreeRounds > 0 ? remainingFreeRounds : '不限',
      guestQuota: remainingGuestQuota,
    },
    canUseFreeRound: remainingFreeRounds > 0,
    canBringGuest: remainingGuestQuota > 0,
    discountRate: Number(benefits.discountRate) || 1,
    priorityBooking: !!benefits.priorityBooking,
    freeCaddy: !!benefits.freeCaddy,
    freeCart: !!benefits.freeCart,
    freeLocker: !!benefits.freeLocker,
    freeParking: !!benefits.freeParking,
  };
}

/**
 * 消耗一次免费轮次
 * @returns true 如果成功消耗，false 如果无剩余免费轮次
 */
async function consumeFreeRound(db, clubId, playerId) {
  const membership = await getActiveMembership(db, clubId, playerId);
  if (!membership) return false;

  const benefits = membership.benefits || {};
  const usage = membership.usage || {};
  const totalFreeRounds = Number(benefits.freeRounds) || 0;
  const roundsUsed = Number(usage.roundsUsed) || 0;

  // 0 means unlimited
  if (totalFreeRounds > 0 && roundsUsed >= totalFreeRounds) {
    return false;
  }

  await db.collection('memberships').doc(membership._id).update({
    data: {
      'usage.roundsUsed': roundsUsed + 1,
      updatedAt: new Date().toISOString(),
    }
  });

  return true;
}

/**
 * 消耗带客名额
 * @param count 本次带客人数
 * @returns true 如果成功消耗
 */
async function consumeGuestQuota(db, clubId, playerId, count = 1) {
  const membership = await getActiveMembership(db, clubId, playerId);
  if (!membership) return false;

  const benefits = membership.benefits || {};
  const usage = membership.usage || {};
  const totalGuestQuota = Number(benefits.guestQuota) || 0;
  const guestBrought = Number(usage.guestBrought) || 0;

  if (totalGuestQuota > 0 && guestBrought + count > totalGuestQuota) {
    return false;
  }

  await db.collection('memberships').doc(membership._id).update({
    data: {
      'usage.guestBrought': guestBrought + count,
      updatedAt: new Date().toISOString(),
    }
  });

  return true;
}

/**
 * 累加消费金额到会籍使用记录
 */
async function addConsumption(db, clubId, playerId, amount) {
  const membership = await getActiveMembership(db, clubId, playerId);
  if (!membership) return;

  const current = Number(membership.usage?.totalConsumption) || 0;

  await db.collection('memberships').doc(membership._id).update({
    data: {
      'usage.totalConsumption': current + Number(amount),
      updatedAt: new Date().toISOString(),
    }
  });
}

module.exports = {
  getActiveMembership,
  getPlayerBenefits,
  consumeFreeRound,
  consumeGuestQuota,
  addConsumption,
};
