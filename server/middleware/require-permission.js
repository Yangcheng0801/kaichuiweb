/**
 * RBAC 权限校验中间件
 * 
 * 使用方式：
 *   router.get('/xxx', requirePermission('bookings', 'view'), handler)
 *   router.post('/xxx', requirePermission('bookings', 'create'), handler)
 * 
 * 依赖：req.userId、req.clubId 由 requireAuthWithClubId 中间件注入
 */

function requirePermission(getDb) {
  // 缓存角色权限（5分钟刷新）
  let rolesCache = null;
  let cacheTime = 0;
  const CACHE_TTL = 5 * 60 * 1000;

  async function loadRoles(clubId) {
    const now = Date.now();
    if (rolesCache && (now - cacheTime) < CACHE_TTL) {
      return rolesCache;
    }

    try {
      const db = getDb();
      const res = await db.collection('roles').where({ clubId, status: 'active' }).limit(100).get();
      rolesCache = res.data || [];
      cacheTime = now;
      return rolesCache;
    } catch (err) {
      console.error('[Permission] 加载角色失败:', err.message);
      return rolesCache || [];
    }
  }

  return function (module, action) {
    return async function (req, res, next) {
      // 如果没有 userId（未登录），跳过权限检查（由上层 auth 中间件处理）
      if (!req.userId) {
        return next();
      }

      try {
        const db = getDb();
        const clubId = req.clubId || '80a8bd4f680c3bb901e1269130e92a37';

        // 获取用户角色
        const userRes = await db.collection('users').doc(req.userId).get();
        const user = (userRes.data || [])[0] || userRes.data;

        if (!user) {
          return res.status(403).json({ success: false, message: '用户不存在' });
        }

        const userRole = user.roleCode || user.role || 'general_manager';

        // 总经理/系统管理员跳过检查
        if (['general_manager', 'system_admin', 'admin'].includes(userRole)) {
          return next();
        }

        // 加载角色权限
        const roles = await loadRoles(clubId);
        const role = roles.find(r => r.code === userRole);

        if (!role) {
          // 未找到角色定义，放行（兼容旧数据）
          console.warn('[Permission] 未找到角色定义:', userRole, '，放行');
          return next();
        }

        const perms = role.permissions || {};
        const modulePerms = perms[module];

        if (!modulePerms || !modulePerms[action]) {
          return res.status(403).json({
            success: false,
            message: `权限不足：${role.name} 无 ${module}.${action} 权限`
          });
        }

        next();
      } catch (err) {
        console.error('[Permission] 权限检查失败:', err.message);
        // 权限检查失败时放行，避免阻塞业务
        next();
      }
    };
  };
}

module.exports = { requirePermission };
