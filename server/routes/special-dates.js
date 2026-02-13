/**
 * 特殊日期管理路由 (Special Dates / Calendar)
 *
 * 集合：special_dates
 * 用于标记节假日、会员日、赛事日、封场日等特殊日期，
 * 供定价引擎 determineDayType() 查询使用
 *
 * API：
 *   GET    /            列表（按年/月筛选）
 *   POST   /            标记单个特殊日期
 *   POST   /batch       批量导入（如导入全年法定假日）
 *   PUT    /:id         编辑
 *   DELETE /:id         删除
 *   GET    /holidays    内置中国法定假日模板
 */
function createSpecialDatesRouter(getDb) {
  const express = require('express');
  const router = express.Router();
  const COLLECTION = 'special_dates';

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/special-dates  列表
  // query: clubId, year, month, dateType
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', year, month, dateType } = req.query;
      const cond = { clubId };
      if (dateType) cond.dateType = dateType;

      // 如果传了 year/month，按日期前缀筛选
      // 由于 TCB 不支持 startsWith，先取全量再客户端过滤
      const result = await db.collection(COLLECTION)
        .where(cond)
        .orderBy('date', 'asc')
        .limit(500)
        .get();

      let data = result.data || [];

      // 按年/月过滤
      if (year) {
        data = data.filter(d => d.date && d.date.startsWith(String(year)));
      }
      if (month) {
        const prefix = year
          ? `${year}-${String(month).padStart(2, '0')}`
          : `-${String(month).padStart(2, '0')}-`;
        data = data.filter(d => d.date && (year ? d.date.startsWith(prefix) : d.date.includes(prefix)));
      }

      res.json({ success: true, data });
    } catch (error) {
      console.error('[SpecialDates] 获取列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/special-dates  标记单个特殊日期
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb();
      const {
        clubId = 'default',
        date, dateType, dateName = '',
        pricingOverride, isClosed = false, closedReason = '',
      } = req.body;

      if (!date) return res.status(400).json({ success: false, error: '日期(date)必填，格式 YYYY-MM-DD' });
      if (!dateType) return res.status(400).json({ success: false, error: '日期类型(dateType)必填' });

      // 检查是否已存在
      const existing = await db.collection(COLLECTION)
        .where({ clubId, date })
        .limit(1)
        .get();

      if (existing.data && existing.data.length > 0) {
        // 已存在则更新
        await db.collection(COLLECTION).doc(existing.data[0]._id).update({
          dateType, dateName,
          pricingOverride: pricingOverride || dateType,
          isClosed: !!isClosed,
          closedReason: closedReason || '',
          updatedAt: new Date(),
        });
        return res.json({ success: true, message: '特殊日期已更新', data: { _id: existing.data[0]._id } });
      }

      const doc = {
        clubId, date, dateType,
        dateName: dateName || '',
        pricingOverride: pricingOverride || dateType,
        isClosed: !!isClosed,
        closedReason: closedReason || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const r = await db.collection(COLLECTION).add(doc);
      res.json({ success: true, data: { _id: r.id || r._id, ...doc }, message: '特殊日期标记成功' });
    } catch (error) {
      console.error('[SpecialDates] 创建失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/special-dates/batch  批量导入
  // Body: { clubId, dates: [{ date, dateType, dateName, pricingOverride, isClosed }] }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/batch', async (req, res) => {
    try {
      const db = getDb();
      const { clubId = 'default', dates = [] } = req.body;

      if (!Array.isArray(dates) || dates.length === 0) {
        return res.status(400).json({ success: false, error: '请提供 dates 数组' });
      }

      const now = new Date();
      let created = 0;
      let updated = 0;

      for (const item of dates) {
        if (!item.date || !item.dateType) continue;

        // 检查是否已存在
        const existing = await db.collection(COLLECTION)
          .where({ clubId, date: item.date })
          .limit(1)
          .get();

        if (existing.data && existing.data.length > 0) {
          await db.collection(COLLECTION).doc(existing.data[0]._id).update({
            dateType: item.dateType,
            dateName: item.dateName || '',
            pricingOverride: item.pricingOverride || item.dateType,
            isClosed: !!item.isClosed,
            closedReason: item.closedReason || '',
            updatedAt: now,
          });
          updated++;
        } else {
          await db.collection(COLLECTION).add({
            clubId,
            date: item.date,
            dateType: item.dateType,
            dateName: item.dateName || '',
            pricingOverride: item.pricingOverride || item.dateType,
            isClosed: !!item.isClosed,
            closedReason: item.closedReason || '',
            createdAt: now,
            updatedAt: now,
          });
          created++;
        }
      }

      res.json({
        success: true,
        message: `批量导入完成：新增 ${created} 条，更新 ${updated} 条`,
        data: { created, updated },
      });
    } catch (error) {
      console.error('[SpecialDates] 批量导入失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/special-dates/:id  编辑
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...body } = req.body;
      await db.collection(COLLECTION).doc(req.params.id).update({
        ...body,
        updatedAt: new Date(),
      });
      res.json({ success: true, message: '特殊日期更新成功' });
    } catch (error) {
      console.error('[SpecialDates] 更新失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE /api/special-dates/:id  删除
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection(COLLECTION).doc(req.params.id).remove();
      res.json({ success: true, message: '特殊日期已删除' });
    } catch (error) {
      console.error('[SpecialDates] 删除失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/special-dates/holidays  中国法定假日模板
  // query: year (默认当年)
  // 返回预置的法定假日列表，前端可直接用于批量导入
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/holidays', (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();

    // 中国法定假日模板（固定日期部分，每年基本不变）
    const holidays = [
      { date: `${year}-01-01`, dateName: '元旦', dateType: 'holiday' },
      // 春节（通常1月底-2月中，每年需手动调整）
      { date: `${year}-01-28`, dateName: '春节', dateType: 'holiday' },
      { date: `${year}-01-29`, dateName: '春节', dateType: 'holiday' },
      { date: `${year}-01-30`, dateName: '春节', dateType: 'holiday' },
      { date: `${year}-01-31`, dateName: '春节', dateType: 'holiday' },
      { date: `${year}-02-01`, dateName: '春节', dateType: 'holiday' },
      { date: `${year}-02-02`, dateName: '春节', dateType: 'holiday' },
      { date: `${year}-02-03`, dateName: '春节', dateType: 'holiday' },
      // 清明节（通常4月4-6日）
      { date: `${year}-04-04`, dateName: '清明节', dateType: 'holiday' },
      { date: `${year}-04-05`, dateName: '清明节', dateType: 'holiday' },
      { date: `${year}-04-06`, dateName: '清明节', dateType: 'holiday' },
      // 劳动节
      { date: `${year}-05-01`, dateName: '劳动节', dateType: 'holiday' },
      { date: `${year}-05-02`, dateName: '劳动节', dateType: 'holiday' },
      { date: `${year}-05-03`, dateName: '劳动节', dateType: 'holiday' },
      { date: `${year}-05-04`, dateName: '劳动节', dateType: 'holiday' },
      { date: `${year}-05-05`, dateName: '劳动节', dateType: 'holiday' },
      // 端午节（通常5月底-6月初，每年需手动调整）
      { date: `${year}-05-31`, dateName: '端午节', dateType: 'holiday' },
      { date: `${year}-06-01`, dateName: '端午节', dateType: 'holiday' },
      { date: `${year}-06-02`, dateName: '端午节', dateType: 'holiday' },
      // 中秋节（通常9月中旬，每年需手动调整）
      { date: `${year}-09-15`, dateName: '中秋节', dateType: 'holiday' },
      { date: `${year}-09-16`, dateName: '中秋节', dateType: 'holiday' },
      { date: `${year}-09-17`, dateName: '中秋节', dateType: 'holiday' },
      // 国庆节
      { date: `${year}-10-01`, dateName: '国庆节', dateType: 'holiday' },
      { date: `${year}-10-02`, dateName: '国庆节', dateType: 'holiday' },
      { date: `${year}-10-03`, dateName: '国庆节', dateType: 'holiday' },
      { date: `${year}-10-04`, dateName: '国庆节', dateType: 'holiday' },
      { date: `${year}-10-05`, dateName: '国庆节', dateType: 'holiday' },
      { date: `${year}-10-06`, dateName: '国庆节', dateType: 'holiday' },
      { date: `${year}-10-07`, dateName: '国庆节', dateType: 'holiday' },
    ];

    // 补充 pricingOverride 和 isClosed
    const result = holidays.map(h => ({
      ...h,
      pricingOverride: 'holiday',
      isClosed: false,
    }));

    res.json({
      success: true,
      data: result,
      message: `${year} 年法定假日模板（${result.length} 天），具体日期请根据国务院公告调整`,
    });
  });

  return router;
}

module.exports = createSpecialDatesRouter;
