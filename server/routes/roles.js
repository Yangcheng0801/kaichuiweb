/**
 * RBAC 角色与权限管理路由
 * 支持角色 CRUD、权限矩阵管理、一键初始化默认角色
 */
const express = require('express');

module.exports = function (getDb) {
  const router = express.Router();
  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';

  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || req.clubId || DEFAULT_CLUB_ID;
  }

  /* 系统模块定义 */
  const SYSTEM_MODULES = [
    { code: 'bookings',    name: '预订管理' },
    { code: 'players',     name: '球员管理' },
    { code: 'resources',   name: '资源管理' },
    { code: 'carts',       name: '球车管理' },
    { code: 'folios',      name: '账单管理' },
    { code: 'dining',      name: '餐饮管理' },
    { code: 'rooms',       name: '客房管理' },
    { code: 'lockers',     name: '更衣柜管理' },
    { code: 'reports',     name: '报表分析' },
    { code: 'daily_close', name: '日结/夜审' },
    { code: 'settings',    name: '系统设置' },
    { code: 'roles',       name: '权限管理' },
  ];

  /* 默认角色模板 */
  const DEFAULT_ROLES = [
    {
      code: 'general_manager',
      name: '总经理',
      description: '拥有系统全部权限',
      isSystem: true,
      permissions: Object.fromEntries(SYSTEM_MODULES.map(m => [m.code, { view: true, create: true, edit: true, delete: true }]))
    },
    {
      code: 'front_desk_manager',
      name: '前台主管',
      description: '管理前台业务、预订、签到、账单',
      isSystem: true,
      permissions: {
        bookings: { view: true, create: true, edit: true, delete: true },
        players:  { view: true, create: true, edit: true, delete: false },
        folios:   { view: true, create: true, edit: true, delete: false },
        resources:{ view: true, create: false, edit: false, delete: false },
        carts:    { view: true, create: false, edit: false, delete: false },
        dining:   { view: true, create: false, edit: false, delete: false },
        rooms:    { view: true, create: false, edit: true, delete: false },
        lockers:  { view: true, create: false, edit: true, delete: false },
        reports:  { view: true, create: false, edit: false, delete: false },
        daily_close:{ view: true, create: true, edit: false, delete: false },
        settings: { view: true, create: false, edit: false, delete: false },
        roles:    { view: false, create: false, edit: false, delete: false },
      }
    },
    {
      code: 'front_desk_staff',
      name: '前台接待',
      description: '日常预订接待、签到、收银',
      isSystem: true,
      permissions: {
        bookings: { view: true, create: true, edit: true, delete: false },
        players:  { view: true, create: true, edit: false, delete: false },
        folios:   { view: true, create: true, edit: true, delete: false },
        resources:{ view: true, create: false, edit: false, delete: false },
        carts:    { view: true, create: false, edit: false, delete: false },
        dining:   { view: false, create: false, edit: false, delete: false },
        rooms:    { view: true, create: false, edit: false, delete: false },
        lockers:  { view: true, create: false, edit: true, delete: false },
        reports:  { view: false, create: false, edit: false, delete: false },
        daily_close:{ view: true, create: true, edit: false, delete: false },
        settings: { view: false, create: false, edit: false, delete: false },
        roles:    { view: false, create: false, edit: false, delete: false },
      }
    },
    {
      code: 'caddy_manager',
      name: '球童主管',
      description: '管理球童排班、球车调度',
      isSystem: true,
      permissions: {
        bookings: { view: true, create: false, edit: false, delete: false },
        players:  { view: true, create: false, edit: false, delete: false },
        folios:   { view: false, create: false, edit: false, delete: false },
        resources:{ view: true, create: true, edit: true, delete: false },
        carts:    { view: true, create: true, edit: true, delete: false },
        dining:   { view: false, create: false, edit: false, delete: false },
        rooms:    { view: false, create: false, edit: false, delete: false },
        lockers:  { view: false, create: false, edit: false, delete: false },
        reports:  { view: true, create: false, edit: false, delete: false },
        daily_close:{ view: false, create: false, edit: false, delete: false },
        settings: { view: false, create: false, edit: false, delete: false },
        roles:    { view: false, create: false, edit: false, delete: false },
      }
    },
    {
      code: 'dining_manager',
      name: '餐饮经理',
      description: '管理餐饮菜单、订单、日报',
      isSystem: true,
      permissions: {
        bookings: { view: false, create: false, edit: false, delete: false },
        players:  { view: true, create: false, edit: false, delete: false },
        folios:   { view: true, create: true, edit: false, delete: false },
        resources:{ view: false, create: false, edit: false, delete: false },
        carts:    { view: false, create: false, edit: false, delete: false },
        dining:   { view: true, create: true, edit: true, delete: true },
        rooms:    { view: false, create: false, edit: false, delete: false },
        lockers:  { view: false, create: false, edit: false, delete: false },
        reports:  { view: true, create: false, edit: false, delete: false },
        daily_close:{ view: false, create: false, edit: false, delete: false },
        settings: { view: false, create: false, edit: false, delete: false },
        roles:    { view: false, create: false, edit: false, delete: false },
      }
    },
    {
      code: 'finance',
      name: '财务',
      description: '查看账单、报表、日结',
      isSystem: true,
      permissions: {
        bookings: { view: true, create: false, edit: false, delete: false },
        players:  { view: true, create: false, edit: false, delete: false },
        folios:   { view: true, create: false, edit: true, delete: false },
        resources:{ view: false, create: false, edit: false, delete: false },
        carts:    { view: false, create: false, edit: false, delete: false },
        dining:   { view: true, create: false, edit: false, delete: false },
        rooms:    { view: true, create: false, edit: false, delete: false },
        lockers:  { view: true, create: false, edit: false, delete: false },
        reports:  { view: true, create: true, edit: false, delete: false },
        daily_close:{ view: true, create: true, edit: false, delete: false },
        settings: { view: false, create: false, edit: false, delete: false },
        roles:    { view: false, create: false, edit: false, delete: false },
      }
    },
    {
      code: 'system_admin',
      name: '系统管理员',
      description: '管理系统设置、角色权限',
      isSystem: true,
      permissions: Object.fromEntries(SYSTEM_MODULES.map(m => [m.code, { view: true, create: true, edit: true, delete: true }]))
    },
  ];

  /* ==================== 获取系统模块列表 ==================== */
  router.get('/modules', (req, res) => {
    res.json({ success: true, data: SYSTEM_MODULES });
  });

  /* ==================== 角色列表 ==================== */
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const rolesRes = await db.collection('roles')
        .where({ clubId })
        .orderBy('sortOrder', 'asc')
        .limit(100)
        .get();
      res.json({ success: true, data: rolesRes.data || [] });
    } catch (err) {
      console.error('[Roles] 查询角色列表失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 创建角色 ==================== */
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { code, name, description, permissions } = req.body;

      if (!code || !name) {
        return res.status(400).json({ success: false, message: '角色编码和名称必填' });
      }

      // 检查唯一性
      const existing = await db.collection('roles').where({ clubId, code }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        return res.status(400).json({ success: false, message: `角色编码 "${code}" 已存在` });
      }

      const now = new Date().toISOString();
      const result = await db.collection('roles').add({
        data: {
          clubId,
          code,
          name,
          description: description || '',
          permissions: permissions || {},
          isSystem: false,
          status: 'active',
          sortOrder: 99,
          createdAt: now,
          updatedAt: now
        }
      });

      res.json({ success: true, data: { _id: result._id } });
    } catch (err) {
      console.error('[Roles] 创建角色失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 更新角色 ==================== */
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { name, description, permissions, status } = req.body;
      const update = { updatedAt: new Date().toISOString() };
      if (name !== undefined) update.name = name;
      if (description !== undefined) update.description = description;
      if (permissions !== undefined) update.permissions = permissions;
      if (status !== undefined) update.status = status;

      await db.collection('roles').doc(req.params.id).update({ data: update });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      console.error('[Roles] 更新角色失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 删除角色 ==================== */
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      // 检查是否为系统角色
      const roleRes = await db.collection('roles').doc(req.params.id).get();
      const role = (roleRes.data || [])[0] || roleRes.data;
      if (role && role.isSystem) {
        return res.status(400).json({ success: false, message: '系统预设角色不可删除' });
      }
      await db.collection('roles').doc(req.params.id).remove();
      res.json({ success: true, message: '删除成功' });
    } catch (err) {
      console.error('[Roles] 删除角色失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* ==================== 一键初始化默认角色 ==================== */
  router.post('/seed', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);

      // 检查是否已有角色
      const existing = await db.collection('roles').where({ clubId }).limit(1).get();
      if (existing.data && existing.data.length > 0) {
        return res.json({ success: true, message: '角色已存在，跳过初始化', data: { seeded: 0 } });
      }

      const now = new Date().toISOString();
      let count = 0;
      for (let i = 0; i < DEFAULT_ROLES.length; i++) {
        const role = DEFAULT_ROLES[i];
        await db.collection('roles').add({
          data: {
            clubId,
            ...role,
            status: 'active',
            sortOrder: i + 1,
            createdAt: now,
            updatedAt: now
          }
        });
        count++;
      }

      res.json({ success: true, message: `成功初始化 ${count} 个默认角色`, data: { seeded: count } });
    } catch (err) {
      console.error('[Roles] 初始化默认角色失败:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
