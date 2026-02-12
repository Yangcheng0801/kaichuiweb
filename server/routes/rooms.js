/**
 * 客房管理路由
 * 集合：rooms
 * 
 * 功能：CRUD + 统计 + 状态管理（available/occupied/cleaning/maintenance/retired）
 * 签到时分配客房 → status 改为 occupied，绑定 bookingId
 * 退房/完赛时释放 → status 改为 cleaning 或 available
 *
 * @param {Function} getDb - 由 app.js 注入
 */
function createRoomsRouter(getDb) {
  const express = require('express')
  const router = express.Router()

  const COLLECTION = 'rooms'

  function parsePage(query) {
    let page = parseInt(query.page, 10)
    let pageSize = parseInt(query.pageSize, 10)
    page = Number.isFinite(page) && page > 0 ? page : 1
    pageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 200 ? pageSize : 50
    return { page, pageSize }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/rooms/stats  统计
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/stats', async (req, res) => {
    try {
      const db = getDb()
      const { clubId } = req.query

      const cond = {}
      if (clubId) cond.clubId = clubId

      const allRes = await db.collection(COLLECTION)
        .where(Object.keys(cond).length > 0 ? cond : {})
        .limit(1000)
        .get()

      const all = allRes.data || []
      const stats = {
        total:       all.length,
        available:   all.filter(r => r.status === 'available').length,
        occupied:    all.filter(r => r.status === 'occupied').length,
        cleaning:    all.filter(r => r.status === 'cleaning').length,
        maintenance: all.filter(r => r.status === 'maintenance').length,
        retired:     all.filter(r => r.status === 'retired').length,
      }

      res.json({ success: true, data: stats })
    } catch (error) {
      console.error('[Rooms] 获取统计失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/rooms  列表（支持状态、房型、楼层筛选）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb()
      const { page, pageSize } = parsePage(req.query)
      const { status, roomType, floor, clubId } = req.query

      const cond = {}
      if (status)   cond.status = status
      if (roomType) cond.roomType = roomType
      if (floor)    cond.floor = floor
      if (clubId)   cond.clubId = clubId

      const hasWhere = Object.keys(cond).length > 0
      const base = hasWhere
        ? db.collection(COLLECTION).where(cond)
        : db.collection(COLLECTION)

      const result = await base
        .orderBy('roomNo', 'asc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      res.json({ success: true, data: result.data, total: result.data.length, page, pageSize })
    } catch (error) {
      console.error('[Rooms] 获取列表失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/rooms/:id  详情
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/:id', async (req, res) => {
    try {
      const db = getDb()
      const result = await db.collection(COLLECTION).doc(req.params.id).get()
      const item = Array.isArray(result.data) ? result.data[0] : result.data
      if (!item) return res.status(404).json({ success: false, error: '客房不存在' })
      res.json({ success: true, data: item })
    } catch (error) {
      console.error('[Rooms] 获取详情失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/rooms  新增（支持批量）
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb()
      const { batch, clubId = 'default' } = req.body

      if (Array.isArray(batch) && batch.length > 0) {
        const results = []
        for (const item of batch) {
          const data = {
            roomNo:             item.roomNo || '',
            roomType:           item.roomType || 'standard',
            floor:              item.floor || '',
            status:             'available',
            currentBookingId:   null,
            currentGuestName:   null,
            pricePerNight:      Number(item.pricePerNight || 0),
            amenities:          item.amenities || [],
            clubId,
            createTime: new Date(),
            updateTime: new Date(),
          }
          const r = await db.collection(COLLECTION).add({ data })
          results.push({ _id: r._id, ...data })
        }
        return res.json({ success: true, data: results, message: `批量创建 ${results.length} 间客房成功` })
      }

      const { roomNo, roomType, floor, pricePerNight, amenities } = req.body
      if (!roomNo) return res.status(400).json({ success: false, error: '房间号不能为空' })

      const data = {
        roomNo,
        roomType:           roomType || 'standard',
        floor:              floor || '',
        status:             'available',
        currentBookingId:   null,
        currentGuestName:   null,
        pricePerNight:      Number(pricePerNight || 0),
        amenities:          amenities || [],
        clubId:             clubId || 'default',
        createTime: new Date(),
        updateTime: new Date(),
      }

      const result = await db.collection(COLLECTION).add({ data })
      res.json({ success: true, data: { _id: result._id, ...data }, message: '客房创建成功' })
    } catch (error) {
      console.error('[Rooms] 创建失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/rooms/:id  更新
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id', async (req, res) => {
    try {
      const db = getDb()
      const { _id, createTime, ...body } = req.body
      const data = { ...body, updateTime: new Date() }
      await db.collection(COLLECTION).doc(req.params.id).update({ data })
      res.json({ success: true, message: '客房更新成功' })
    } catch (error) {
      console.error('[Rooms] 更新失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE /api/rooms/:id  删除
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb()
      await db.collection(COLLECTION).doc(req.params.id).remove()
      res.json({ success: true, message: '客房已删除' })
    } catch (error) {
      console.error('[Rooms] 删除失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}

module.exports = createRoomsRouter
