/**
 * 更衣柜管理路由
 * 集合：lockers
 * 
 * 功能：CRUD + 统计 + 状态管理（available/occupied/maintenance/retired）
 * 签到时分配更衣柜 → status 改为 occupied，绑定 bookingId
 * 完赛/取消时释放 → status 改回 available，清除绑定
 *
 * @param {Function} getDb - 由 app.js 注入
 */
function createLockersRouter(getDb) {
  const express = require('express')
  const router = express.Router()

  const COLLECTION = 'lockers'

  // ─── 分页解析 ──────────────────────────────────────────────────────────────
  function parsePage(query) {
    let page = parseInt(query.page, 10)
    let pageSize = parseInt(query.pageSize, 10)
    page = Number.isFinite(page) && page > 0 ? page : 1
    pageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 200 ? pageSize : 50
    return { page, pageSize }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/lockers/stats  统计（总数/可用/占用/维护）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/stats', async (req, res) => {
    try {
      const db = getDb()
      const { clubId } = req.query

      const cond = {}
      if (clubId) cond.clubId = clubId

      // 查所有更衣柜
      const allRes = await db.collection(COLLECTION)
        .where(Object.keys(cond).length > 0 ? cond : {})
        .limit(1000)
        .get()

      const all = allRes.data || []
      const stats = {
        total:       all.length,
        available:   all.filter(l => l.status === 'available').length,
        occupied:    all.filter(l => l.status === 'occupied').length,
        maintenance: all.filter(l => l.status === 'maintenance').length,
        retired:     all.filter(l => l.status === 'retired').length,
      }

      res.json({ success: true, data: stats })
    } catch (error) {
      console.error('[Lockers] 获取统计失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/lockers  列表（支持状态筛选、区域筛选、分页）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb()
      const { page, pageSize } = parsePage(req.query)
      const { status, area, clubId } = req.query

      const cond = {}
      if (status) cond.status = status
      if (area)   cond.area = area
      if (clubId) cond.clubId = clubId

      const hasWhere = Object.keys(cond).length > 0
      const base = hasWhere
        ? db.collection(COLLECTION).where(cond)
        : db.collection(COLLECTION)

      const result = await base
        .orderBy('lockerNo', 'asc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      res.json({ success: true, data: result.data, total: result.data.length, page, pageSize })
    } catch (error) {
      console.error('[Lockers] 获取列表失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/lockers/:id  详情
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb()
      const result = await db.collection(COLLECTION).doc(req.params.id).get()
      const item = Array.isArray(result.data) ? result.data[0] : result.data
      if (!item) return res.status(404).json({ success: false, error: '更衣柜不存在' })
      res.json({ success: true, data: item })
    } catch (error) {
      console.error('[Lockers] 获取详情失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/lockers  新增（支持单个和批量）
  // Body: { lockerNo, area, size, dailyFee, clubId }
  //   或 { batch: [{ lockerNo, area, size, dailyFee }], clubId }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb()
      const { batch, clubId = 'default' } = req.body

      // 批量创建
      if (Array.isArray(batch) && batch.length > 0) {
        const results = []
        for (const item of batch) {
          const data = {
            lockerNo:           item.lockerNo || '',
            area:               item.area || '',
            size:               item.size || 'standard',
            status:             'available',
            currentBookingId:   null,
            currentPlayerName:  null,
            dailyFee:           Number(item.dailyFee || 0),
            clubId,
            createTime: new Date(),
            updateTime: new Date(),
          }
          const r = await db.collection(COLLECTION).add({ data })
          results.push({ _id: r._id, ...data })
        }
        return res.json({ success: true, data: results, message: `批量创建 ${results.length} 个更衣柜成功` })
      }

      // 单个创建
      const { lockerNo, area, size, dailyFee } = req.body
      if (!lockerNo) return res.status(400).json({ success: false, error: '更衣柜编号不能为空' })

      const data = {
        lockerNo,
        area:               area || '',
        size:               size || 'standard',
        status:             'available',
        currentBookingId:   null,
        currentPlayerName:  null,
        dailyFee:           Number(dailyFee || 0),
        clubId:             clubId || 'default',
        createTime: new Date(),
        updateTime: new Date(),
      }

      const result = await db.collection(COLLECTION).add({ data })
      res.json({ success: true, data: { _id: result._id, ...data }, message: '更衣柜创建成功' })
    } catch (error) {
      console.error('[Lockers] 创建失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/lockers/:id  更新（编辑信息 / 变更状态）
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb()
      const { _id, createTime, ...body } = req.body
      const data = { ...body, updateTime: new Date() }
      await db.collection(COLLECTION).doc(req.params.id).update({ data })
      res.json({ success: true, message: '更衣柜更新成功' })
    } catch (error) {
      console.error('[Lockers] 更新失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE /api/lockers/:id  删除
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb()
      await db.collection(COLLECTION).doc(req.params.id).remove()
      res.json({ success: true, message: '更衣柜已删除' })
    } catch (error) {
      console.error('[Lockers] 删除失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/lockers/:id/issue-key  发放钥匙/手环
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/:id/issue-key', async (req, res) => {
    try {
      const db = getDb()
      const { id } = req.params
      const { keyType = 'physical_key', keyNo, issuedTo, playerName, bookingId, contractId, operatorId, operatorName } = req.body
      if (!keyNo) return res.status(400).json({ success: false, error: '钥匙/手环编号不能为空' })

      const now = new Date()
      await db.collection(COLLECTION).doc(id).update({
        data: {
          keyInfo: { keyType, keyNo, issuedTo: issuedTo || null, issuedAt: now, returnedAt: null },
          updateTime: now,
        }
      })

      // 记录使用日志
      await db.collection('locker_usage_logs').add({
        clubId: req.body.clubId || 'default',
        lockerId: id,
        lockerNo: req.body.lockerNo || '',
        action: 'key_issued',
        playerId: issuedTo || null,
        playerName: playerName || '',
        bookingId: bookingId || null,
        contractId: contractId || null,
        keyNo,
        operatorId: operatorId || null,
        operatorName: operatorName || '',
        actionTime: now,
        note: `发放${keyType === 'wristband' ? '手环' : keyType === 'card' ? '门禁卡' : '钥匙'} ${keyNo}`,
        createdAt: now,
      })

      res.json({ success: true, message: '钥匙/手环已发放' })
    } catch (error) {
      console.error('[Lockers] 发放钥匙失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/lockers/:id/return-key  回收钥匙/手环
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/:id/return-key', async (req, res) => {
    try {
      const db = getDb()
      const { id } = req.params
      const { operatorId, operatorName, playerName, bookingId, contractId } = req.body
      const now = new Date()

      // 读取当前钥匙信息
      const lockerRes = await db.collection(COLLECTION).doc(id).get()
      const locker = Array.isArray(lockerRes.data) ? lockerRes.data[0] : lockerRes.data
      const keyNo = locker?.keyInfo?.keyNo || ''

      await db.collection(COLLECTION).doc(id).update({
        data: {
          'keyInfo.returnedAt': now,
          'keyInfo.issuedTo': null,
          updateTime: now,
        }
      })

      await db.collection('locker_usage_logs').add({
        clubId: req.body.clubId || locker?.clubId || 'default',
        lockerId: id,
        lockerNo: locker?.lockerNo || '',
        action: 'key_returned',
        playerId: null,
        playerName: playerName || '',
        bookingId: bookingId || null,
        contractId: contractId || null,
        keyNo,
        operatorId: operatorId || null,
        operatorName: operatorName || '',
        actionTime: now,
        note: `回收钥匙 ${keyNo}`,
        createdAt: now,
      })

      res.json({ success: true, message: '钥匙/手环已回收' })
    } catch (error) {
      console.error('[Lockers] 回收钥匙失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/lockers/:id/usage-logs  使用记录
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/:id/usage-logs', async (req, res) => {
    try {
      const db = getDb()
      const r = await db.collection('locker_usage_logs')
        .where({ lockerId: req.params.id })
        .orderBy('actionTime', 'desc')
        .limit(200)
        .get()
      res.json({ success: true, data: r.data || [] })
    } catch (error) {
      console.error('[Lockers] 获取使用记录失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}

module.exports = createLockersRouter
