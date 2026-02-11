/**
 * 资源管理路由
 * 包含：球场（courses）、球童（caddies）、球车（carts）
 * 三个集合均支持完整 CRUD + 分页查询
 *
 * @param {Function} getDb - 由 app.js 注入的 getDb()
 */
function createResourcesRouter(getDb) {
  const express = require('express');
  const router = express.Router();

  // ─── 工具函数 ───────────────────────────────────────────────────────────────

  function parsePage(query) {
    let page = parseInt(query.page, 10);
    let pageSize = parseInt(query.pageSize, 10);
    page = Number.isFinite(page) && page > 0 ? page : 1;
    pageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;
    return { page, pageSize };
  }

  /**
   * 通用 CRUD 路由工厂，为每个集合生成标准的增删改查端点
   * @param {string} collection - TCB 集合名
   * @param {string} label - 中文名（用于错误提示）
   */
  function mountCrud(collection, label) {

    // GET / - 列表（支持分页、status 筛选、clubId 筛选）
    router.get(`/${collection}`, async (req, res) => {
      try {
        const db = getDb();
        const { page, pageSize } = parsePage(req.query);
        const { status, clubId } = req.query;

        const cond = {};
        if (status) cond.status = status;
        if (clubId) cond.clubId = clubId;

        const hasWhere = Object.keys(cond).length > 0;
        const base = hasWhere ? db.collection(collection).where(cond) : db.collection(collection);

        const result = await base
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get();

        res.json({ success: true, data: result.data, total: result.data.length, page, pageSize });
      } catch (error) {
        console.error(`[Resources] 获取${label}列表失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET /:collection/:id - 详情
    router.get(`/${collection}/:id`, async (req, res) => {
      try {
        const db = getDb();
        const result = await db.collection(collection).doc(req.params.id).get();
        const item = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!item) return res.status(404).json({ success: false, error: `${label}不存在` });
        res.json({ success: true, data: item });
      } catch (error) {
        console.error(`[Resources] 获取${label}详情失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // POST /:collection - 创建
    router.post(`/${collection}`, async (req, res) => {
      try {
        const db = getDb();
        const { _id, ...body } = req.body;
        const data = { ...body, createTime: new Date(), updateTime: new Date() };
        const result = await db.collection(collection).add({ data });
        res.json({ success: true, data: { _id: result._id, ...data }, message: `${label}创建成功` });
      } catch (error) {
        console.error(`[Resources] 创建${label}失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // PUT /:collection/:id - 更新
    router.put(`/${collection}/:id`, async (req, res) => {
      try {
        const db = getDb();
        const { _id, createTime, ...body } = req.body;
        const data = { ...body, updateTime: new Date() };
        await db.collection(collection).doc(req.params.id).update({ data });
        res.json({ success: true, message: `${label}更新成功` });
      } catch (error) {
        console.error(`[Resources] 更新${label}失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // DELETE /:collection/:id - 删除
    router.delete(`/${collection}/:id`, async (req, res) => {
      try {
        const db = getDb();
        await db.collection(collection).doc(req.params.id).remove();
        res.json({ success: true, message: `${label}删除成功` });
      } catch (error) {
        console.error(`[Resources] 删除${label}失败:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  // ─── 挂载三个资源集合 ─────────────────────────────────────────────────────────
  mountCrud('courses', '球场');
  mountCrud('caddies', '球童');
  mountCrud('carts',   '球车');

  return router;
}

module.exports = createResourcesRouter;
