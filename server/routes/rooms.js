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

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/rooms/rack  房态总览（Room Rack）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/rack', async (req, res) => {
    try {
      const db = getDb()
      const clubId = req.query.clubId || 'default'
      const allRes = await db.collection(COLLECTION)
        .where({ clubId })
        .orderBy('roomNo', 'asc')
        .limit(500)
        .get()
      res.json({ success: true, data: allRes.data || [] })
    } catch (error) {
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/rooms/:id/check-in  入住
  // Status: vacant_clean -> occupied
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/check-in', async (req, res) => {
    try {
      const db = getDb()
      const { id } = req.params
      const roomRes = await db.collection(COLLECTION).doc(id).get()
      const room = Array.isArray(roomRes.data) ? roomRes.data[0] : roomRes.data
      if (!room) return res.status(404).json({ success: false, error: '客房不存在' })

      const validFrom = ['available', 'vacant_clean', 'inspected']
      if (!validFrom.includes(room.status)) {
        return res.status(400).json({ success: false, error: `当前状态 ${room.status} 不允许入住` })
      }

      const {
        folioId, bookingId, guestName, guestCount = 1,
        expectedCheckOut, packageId, specialRequests,
      } = req.body
      const now = new Date()

      await db.collection(COLLECTION).doc(id).update({
        data: {
          status: 'occupied',
          currentBookingId: bookingId || null,
          currentGuestName: guestName || '',
          currentStay: {
            folioId: folioId || null,
            bookingId: bookingId || null,
            guestName: guestName || '',
            guestCount: Number(guestCount),
            checkInTime: now,
            expectedCheckOut: expectedCheckOut || '',
            packageId: packageId || null,
            specialRequests: specialRequests || '',
          },
          updateTime: now,
        }
      })

      // Folio 挂房费
      if (folioId && room.pricePerNight > 0) {
        try {
          await db.collection('folio_charges').add({
            clubId: room.clubId || 'default', folioId,
            chargeType: 'room', chargeSource: `客房 ${room.roomNo}`,
            sourceId: id, description: `${room.roomNo} 房费`,
            amount: room.pricePerNight, quantity: 1, unitPrice: room.pricePerNight,
            operatorId: null, operatorName: '', chargeTime: now,
            status: 'posted', voidReason: null, createdAt: now,
          })
          // recalc folio
          const charges = await db.collection('folio_charges').where({ folioId, status: 'posted' }).get()
          const totalCharges = (charges.data || []).reduce((s, c) => s + (c.amount || 0), 0)
          const payments = await db.collection('folio_payments').where({ folioId, status: 'success' }).get()
          const totalPayments = (payments.data || []).reduce((s, p) => s + (p.amount || 0), 0)
          await db.collection('folios').doc(folioId).update({
            totalCharges: Math.round(totalCharges * 100) / 100,
            totalPayments: Math.round(totalPayments * 100) / 100,
            balance: Math.round((totalCharges - totalPayments) * 100) / 100,
            roomNo: room.roomNo,
            updatedAt: now,
          })
        } catch (e) { console.warn('[Rooms] Folio 挂房费失败:', e.message) }
      }

      res.json({ success: true, message: `客房 ${room.roomNo} 入住成功` })
    } catch (error) {
      console.error('[Rooms] 入住失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // PUT /api/rooms/:id/check-out  退房
  // Status: occupied -> vacant_dirty + 自动创建清洁任务
  // ══════════════════════════════════════════════════════════════════════════════
  router.put('/:id/check-out', async (req, res) => {
    try {
      const db = getDb()
      const { id } = req.params
      const roomRes = await db.collection(COLLECTION).doc(id).get()
      const room = Array.isArray(roomRes.data) ? roomRes.data[0] : roomRes.data
      if (!room) return res.status(404).json({ success: false, error: '客房不存在' })
      if (room.status !== 'occupied') return res.status(400).json({ success: false, error: '非入住状态' })

      const now = new Date()

      await db.collection(COLLECTION).doc(id).update({
        data: {
          status: 'vacant_dirty',
          currentBookingId: null,
          currentGuestName: null,
          currentStay: null,
          updateTime: now,
        }
      })

      // 自动创建退房清洁任务
      try {
        await db.collection('housekeeping_tasks').add({
          clubId: room.clubId || 'default',
          roomId: id, roomNo: room.roomNo, floor: room.floor || '',
          taskType: 'checkout_clean', priority: 'high',
          status: 'pending', assignedTo: null, assignedName: '',
          startedAt: null, completedAt: null, inspectedBy: null, inspectedAt: null,
          notes: '', createdAt: now,
        })
      } catch (e) { console.warn('[Rooms] 创建清洁任务失败:', e.message) }

      res.json({ success: true, message: `客房 ${room.roomNo} 退房成功，已创建清洁任务` })
    } catch (error) {
      console.error('[Rooms] 退房失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}

module.exports = createRoomsRouter
