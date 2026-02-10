/**
 * 订单相关路由（腾讯云开发云托管）
 * 使用 getDb() 与主应用一致，支持 USE_HTTP_DB 时走 HTTP 方式访问数据库
 * @param {Function} getDb - 由 app.js 注入的 getDb()，返回 cloud.database() 或 HTTP 适配器
 */
function createOrdersRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  // 获取订单列表
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { page = 1, pageSize = 20, status } = req.query;

      let query = db.collection('orders');

      if (status) {
        query = query.where({ status });
      }

      const result = await query
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(parseInt(pageSize))
        .get();

      res.json({
        success: true,
        data: result.data,
        total: result.data.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    } catch (error) {
      console.error('获取订单列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 获取单个订单详情
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;

      const result = await db.collection('orders').doc(id).get();

      if (!result.data || result.data.length === 0) {
        return res.status(404).json({
          success: false,
          error: '订单不存在'
        });
      }

      res.json({
        success: true,
        data: result.data[0]
      });
    } catch (error) {
      console.error('获取订单详情失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 创建新订单
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const orderData = {
        ...req.body,
        status: 'pending',
        createTime: new Date(),
        updateTime: new Date()
      };

      const result = await db.collection('orders').add({
        data: orderData
      });

      res.json({
        success: true,
        data: {
          _id: result._id,
          ...orderData
        }
      });
    } catch (error) {
      console.error('创建订单失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 更新订单
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const updateData = {
        ...req.body,
        updateTime: new Date()
      };

      await db.collection('orders').doc(id).update({
        data: updateData
      });

      res.json({
        success: true,
        message: '订单更新成功'
      });
    } catch (error) {
      console.error('更新订单失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 删除订单
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;

      await db.collection('orders').doc(id).remove();

      res.json({
        success: true,
        message: '订单删除成功'
      });
    } catch (error) {
      console.error('删除订单失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createOrdersRouter;
