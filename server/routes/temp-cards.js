/**
 * 临时消费卡管理路由
 * 集合：temp_consume_cards
 *
 * 支持两种模式：
 *   1. 实体卡（physical）：前台预先录入固定编号的卡片，签到时绑定到预订，离场回收
 *   2. 虚拟卡（virtual）：系统自动生成临时编号，签到时创建，离场自动失效
 *
 * @param {Function} getDb - 由 app.js 注入
 */
function createTempCardsRouter(getDb) {
  const express = require('express')
  const router = express.Router()

  const COLLECTION = 'temp_consume_cards'

  // ─── 生成虚拟临时卡号（6位数字，V前缀）─────────────────────────────────────
  async function generateVirtualCardNo(db, clubId) {
    const maxRetries = 10
    for (let i = 0; i < maxRetries; i++) {
      const num = Math.floor(100000 + Math.random() * 900000)
      const cardNo = `V${num}`
      // 查重
      const existing = await db.collection(COLLECTION)
        .where({ cardNo, clubId })
        .limit(1)
        .get()
      if (!existing.data || existing.data.length === 0) return cardNo
    }
    // 兜底：时间戳
    return `V${Date.now().toString().slice(-6)}`
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // GET /api/temp-cards  列表（支持状态筛选）
  // ══════════════════════════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    try {
      const db = getDb()
      const { status, cardType, clubId } = req.query

      const cond = {}
      if (status)   cond.status = status
      if (cardType) cond.cardType = cardType
      if (clubId)   cond.clubId = clubId

      const hasWhere = Object.keys(cond).length > 0
      const base = hasWhere
        ? db.collection(COLLECTION).where(cond)
        : db.collection(COLLECTION)

      const result = await base
        .orderBy('cardNo', 'asc')
        .limit(500)
        .get()

      res.json({ success: true, data: result.data, total: result.data.length })
    } catch (error) {
      console.error('[TempCards] 获取列表失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/temp-cards  录入实体卡（支持批量）
  // Body: { cardNo, clubId } 或 { batch: [{ cardNo }], clubId }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/', async (req, res) => {
    try {
      const db = getDb()
      const { batch, clubId = 'default' } = req.body

      if (Array.isArray(batch) && batch.length > 0) {
        const results = []
        for (const item of batch) {
          const data = {
            cardNo:             item.cardNo || '',
            cardType:           'physical',
            status:             'available',
            currentBookingId:   null,
            currentPlayerName:  null,
            issuedAt:           null,
            returnedAt:         null,
            clubId,
            createTime: new Date(),
            updateTime: new Date(),
          }
          const r = await db.collection(COLLECTION).add({ data })
          results.push({ _id: r._id, ...data })
        }
        return res.json({ success: true, data: results, message: `批量录入 ${results.length} 张消费卡成功` })
      }

      const { cardNo } = req.body
      if (!cardNo) return res.status(400).json({ success: false, error: '卡号不能为空' })

      const data = {
        cardNo,
        cardType:           'physical',
        status:             'available',
        currentBookingId:   null,
        currentPlayerName:  null,
        issuedAt:           null,
        returnedAt:         null,
        clubId:             clubId || 'default',
        createTime: new Date(),
        updateTime: new Date(),
      }

      const result = await db.collection(COLLECTION).add({ data })
      res.json({ success: true, data: { _id: result._id, ...data }, message: '消费卡录入成功' })
    } catch (error) {
      console.error('[TempCards] 录入失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/temp-cards/issue  发卡（绑定到预订）
  // Body: { cardId, bookingId, playerName, clubId }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/issue', async (req, res) => {
    try {
      const db = getDb()
      const { cardId, bookingId, playerName } = req.body

      if (!cardId) return res.status(400).json({ success: false, error: '请选择消费卡' })
      if (!bookingId) return res.status(400).json({ success: false, error: '缺少预订ID' })

      await db.collection(COLLECTION).doc(cardId).update({
        data: {
          status:             'in_use',
          currentBookingId:   bookingId,
          currentPlayerName:  playerName || '',
          issuedAt:           new Date(),
          updateTime:         new Date(),
        }
      })

      // 读回完整记录
      const result = await db.collection(COLLECTION).doc(cardId).get()
      const card = Array.isArray(result.data) ? result.data[0] : result.data

      res.json({ success: true, data: card, message: '消费卡已发放' })
    } catch (error) {
      console.error('[TempCards] 发卡失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/temp-cards/return  回收卡
  // Body: { cardId }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/return', async (req, res) => {
    try {
      const db = getDb()
      const { cardId } = req.body

      if (!cardId) return res.status(400).json({ success: false, error: '缺少卡片ID' })

      // 读取当前卡信息
      const cardRes = await db.collection(COLLECTION).doc(cardId).get()
      const card = Array.isArray(cardRes.data) ? cardRes.data[0] : cardRes.data

      if (!card) return res.status(404).json({ success: false, error: '消费卡不存在' })

      // 虚拟卡回收后变为 retired（不可复用），实体卡回收后变为 available
      const newStatus = card.cardType === 'virtual' ? 'retired' : 'available'

      await db.collection(COLLECTION).doc(cardId).update({
        data: {
          status:             newStatus,
          currentBookingId:   null,
          currentPlayerName:  null,
          returnedAt:         new Date(),
          updateTime:         new Date(),
        }
      })

      res.json({ success: true, message: '消费卡已回收' })
    } catch (error) {
      console.error('[TempCards] 回收失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // POST /api/temp-cards/generate  系统生成虚拟临时卡号（直接绑定到预订）
  // Body: { bookingId, playerName, clubId }
  // ══════════════════════════════════════════════════════════════════════════════
  router.post('/generate', async (req, res) => {
    try {
      const db = getDb()
      const { bookingId, playerName, clubId = 'default' } = req.body

      if (!bookingId) return res.status(400).json({ success: false, error: '缺少预订ID' })

      const cardNo = await generateVirtualCardNo(db, clubId)

      const data = {
        cardNo,
        cardType:           'virtual',
        status:             'in_use',
        currentBookingId:   bookingId,
        currentPlayerName:  playerName || '',
        issuedAt:           new Date(),
        returnedAt:         null,
        clubId,
        createTime: new Date(),
        updateTime: new Date(),
      }

      const result = await db.collection(COLLECTION).add({ data })
      const card = { _id: result._id, ...data }

      console.log(`[TempCards] 生成虚拟消费卡: ${cardNo} → 预订 ${bookingId}`)
      res.json({ success: true, data: card, message: `已生成临时消费卡号 ${cardNo}` })
    } catch (error) {
      console.error('[TempCards] 生成失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // DELETE /api/temp-cards/:id  删除（仅限 available/retired 状态）
  // ══════════════════════════════════════════════════════════════════════════════
  router.delete('/:id', async (req, res) => {
    try {
      const db = getDb()
      const cardRes = await db.collection(COLLECTION).doc(req.params.id).get()
      const card = Array.isArray(cardRes.data) ? cardRes.data[0] : cardRes.data

      if (!card) return res.status(404).json({ success: false, error: '消费卡不存在' })
      if (card.status === 'in_use') {
        return res.status(400).json({ success: false, error: '使用中的消费卡不能删除，请先回收' })
      }

      await db.collection(COLLECTION).doc(req.params.id).remove()
      res.json({ success: true, message: '消费卡已删除' })
    } catch (error) {
      console.error('[TempCards] 删除失败:', error)
      res.status(500).json({ success: false, error: error.message })
    }
  })

  return router
}

module.exports = createTempCardsRouter
