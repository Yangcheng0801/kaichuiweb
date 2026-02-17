/**
 * 库存管理 / Pro Shop 路由
 *
 * 集合：
 *   products            — 商品目录（SKU、名称、分类、品牌、价格、成本、条码）
 *   product_categories  — 商品分类
 *   stock_movements     — 库存变动流水（入库/出库/调整/盘点）
 *   purchase_orders     — 采购单
 *   suppliers           — 供应商
 *   proshop_sales       — 销售记录（POS）
 *
 * 核心流程：
 *   商品管理 → 供应商 → 采购入库 → 库存管理 → 销售出库 → 报表分析
 *
 * @param {Function} getDb
 */
module.exports = function (getDb) {
  const express = require('express');
  const router = express.Router();

  const DEFAULT_CLUB_ID = '80a8bd4f680c3bb901e1269130e92a37';
  function getClubId(req) {
    return req.query.clubId || req.body?.clubId || DEFAULT_CLUB_ID;
  }

  // ══════════════════════════════════════════════════════════════════════
  //                       商 品 分 类
  // ══════════════════════════════════════════════════════════════════════

  /* GET /api/inventory/categories */
  router.get('/categories', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const r = await db.collection('product_categories')
        .where({ clubId })
        .orderBy('sortOrder', 'asc')
        .limit(200)
        .get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* POST /api/inventory/categories */
  router.post('/categories', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { name, parentId, icon, sortOrder } = req.body;
      if (!name) return res.status(400).json({ success: false, message: '分类名称必填' });

      const now = new Date().toISOString();
      const doc = {
        clubId, name, parentId: parentId || null,
        icon: icon || '', sortOrder: Number(sortOrder) || 0,
        productCount: 0, status: 'active',
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('product_categories').add({ data: doc });
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* PUT /api/inventory/categories/:id */
  router.put('/categories/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, ...fields } = req.body;
      fields.updatedAt = new Date().toISOString();
      await db.collection('product_categories').doc(req.params.id).update({ data: fields });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* DELETE /api/inventory/categories/:id */
  router.delete('/categories/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('product_categories').doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                         商 品 管 理
  // ══════════════════════════════════════════════════════════════════════

  /* 生成SKU: PRD2602-000001 */
  async function generateSku(db, clubId) {
    const now = new Date();
    const prefix = `PRD${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const existing = await db.collection('products')
      .where({ clubId })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    let seq = 1;
    if (existing.data?.length > 0) {
      const last = existing.data[0].sku || '';
      const m = last.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `${prefix}-${String(seq).padStart(6, '0')}`;
  }

  /* GET /api/inventory/products  商品列表 */
  router.get('/products', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { categoryId, status, keyword, page = 1, pageSize = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(pageSize);

      const where = { clubId };
      if (categoryId) where.categoryId = categoryId;
      if (status) where.status = status;

      const [countRes, listRes] = await Promise.all([
        db.collection('products').where(where).count(),
        db.collection('products').where(where)
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(Number(pageSize))
          .get(),
      ]);

      let list = listRes.data || [];
      if (keyword) {
        const kw = keyword.toLowerCase();
        list = list.filter(p =>
          (p.name || '').toLowerCase().includes(kw) ||
          (p.sku || '').toLowerCase().includes(kw) ||
          (p.barcode || '').includes(kw) ||
          (p.brand || '').toLowerCase().includes(kw)
        );
      }

      res.json({ success: true, data: list, total: countRes.total || 0, page: Number(page), pageSize: Number(pageSize) });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* GET /api/inventory/products/:id  商品详情 */
  router.get('/products/:id', async (req, res) => {
    try {
      const db = getDb();
      const r = await db.collection('products').doc(req.params.id).get();
      const item = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!item) return res.status(404).json({ success: false, message: '商品不存在' });
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* POST /api/inventory/products  创建商品 */
  router.post('/products', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const {
        name, categoryId, categoryName, brand, description,
        barcode, price, costPrice, memberPrice,
        unit, minStock, maxStock, location,
        variants, images, tags,
      } = req.body;
      if (!name) return res.status(400).json({ success: false, message: '商品名称必填' });

      const sku = await generateSku(db, clubId);
      const now = new Date().toISOString();
      const doc = {
        clubId, sku, name,
        categoryId: categoryId || null,
        categoryName: categoryName || '',
        brand: brand || '',
        description: description || '',
        barcode: barcode || '',
        price: Number(price) || 0,
        costPrice: Number(costPrice) || 0,
        memberPrice: Number(memberPrice) || null,
        unit: unit || '件',
        // 库存
        stock: 0,
        minStock: Number(minStock) || 5,
        maxStock: Number(maxStock) || 999,
        location: location || '',
        // 扩展
        variants: variants || [],
        images: images || [],
        tags: tags || [],
        // 统计
        totalSold: 0,
        totalRevenue: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      const r = await db.collection('products').add({ data: doc });
      console.log(`[Inventory] 商品创建: ${sku} ${name}`);
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* PUT /api/inventory/products/:id  更新商品 */
  router.put('/products/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, sku, createdAt, stock, totalSold, totalRevenue, ...fields } = req.body;
      fields.updatedAt = new Date().toISOString();
      if (fields.price !== undefined) fields.price = Number(fields.price);
      if (fields.costPrice !== undefined) fields.costPrice = Number(fields.costPrice);
      if (fields.memberPrice !== undefined) fields.memberPrice = fields.memberPrice === null ? null : Number(fields.memberPrice);
      await db.collection('products').doc(req.params.id).update({ data: fields });
      res.json({ success: true, message: '商品更新成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* DELETE /api/inventory/products/:id */
  router.delete('/products/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('products').doc(req.params.id).update({
        data: { status: 'deleted', updatedAt: new Date().toISOString() }
      });
      res.json({ success: true, message: '已下架' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                      库 存 变 动 / 盘 点
  // ══════════════════════════════════════════════════════════════════════

  /* GET /api/inventory/movements  库存流水 */
  router.get('/movements', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { productId, type, page = 1, pageSize = 30 } = req.query;
      const skip = (Number(page) - 1) * Number(pageSize);

      const where = { clubId };
      if (productId) where.productId = productId;
      if (type) where.type = type;

      const [countRes, listRes] = await Promise.all([
        db.collection('stock_movements').where(where).count(),
        db.collection('stock_movements').where(where)
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(Number(pageSize))
          .get(),
      ]);
      res.json({ success: true, data: listRes.data || [], total: countRes.total || 0 });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/inventory/movements  库存变动
   * Body: { productId, type: 'in'|'out'|'adjust'|'stocktake', quantity, reason, reference, operatorName }
   */
  router.post('/movements', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { productId, type, quantity, reason, reference, operatorId, operatorName } = req.body;

      if (!productId || !type || quantity === undefined) {
        return res.status(400).json({ success: false, message: 'productId / type / quantity 必填' });
      }

      // 获取当前商品
      const pRes = await db.collection('products').doc(productId).get();
      const product = Array.isArray(pRes.data) ? pRes.data[0] : pRes.data;
      if (!product) return res.status(404).json({ success: false, message: '商品不存在' });

      const currentStock = Number(product.stock) || 0;
      const qty = Number(quantity);
      let newStock = currentStock;

      switch (type) {
        case 'in':        newStock = currentStock + Math.abs(qty); break;
        case 'out':       newStock = Math.max(0, currentStock - Math.abs(qty)); break;
        case 'adjust':    newStock = currentStock + qty; break;
        case 'stocktake': newStock = Math.max(0, qty); break;
        default:
          return res.status(400).json({ success: false, message: `无效类型: ${type}` });
      }

      const now = new Date().toISOString();
      const movement = {
        clubId,
        productId,
        productName: product.name,
        productSku: product.sku,
        type,
        quantity: qty,
        beforeStock: currentStock,
        afterStock: newStock,
        reason: reason || '',
        reference: reference || '',
        operatorId: operatorId || '',
        operatorName: operatorName || '',
        createdAt: now,
      };

      await db.collection('stock_movements').add({ data: movement });
      await db.collection('products').doc(productId).update({
        data: { stock: newStock, updatedAt: now }
      });

      // 低库存检查 → 触发通知
      if (newStock <= (product.minStock || 5)) {
        try {
          const ne = require('../utils/notification-engine');
          await ne.send(db, {
            clubId, type: 'system_announcement',
            title: `库存预警: ${product.name}`,
            content: `SKU ${product.sku} 当前库存 ${newStock}，低于最低库存 ${product.minStock || 5}`,
            recipientRole: 'admin',
            priority: 'important',
            sourceId: productId,
            sourceType: 'inventory',
          });
        } catch (_) {}
      }

      console.log(`[Inventory] 库存变动: ${product.sku} ${type} ${qty} → ${newStock}`);
      res.json({ success: true, data: { ...movement, newStock } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* GET /api/inventory/low-stock  低库存商品 */
  router.get('/low-stock', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const r = await db.collection('products')
        .where({ clubId, status: 'active' })
        .limit(500)
        .get();
      const list = (r.data || []).filter(p => (p.stock || 0) <= (p.minStock || 5));
      list.sort((a, b) => (a.stock || 0) - (b.stock || 0));
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                        供 应 商 管 理
  // ══════════════════════════════════════════════════════════════════════

  /* GET /api/inventory/suppliers */
  router.get('/suppliers', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const r = await db.collection('suppliers')
        .where({ clubId })
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
      res.json({ success: true, data: r.data || [] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* POST /api/inventory/suppliers */
  router.post('/suppliers', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { name, contactPerson, phone, email, address, paymentTerms, categories, notes } = req.body;
      if (!name) return res.status(400).json({ success: false, message: '供应商名称必填' });

      const now = new Date().toISOString();
      const doc = {
        clubId, name,
        contactPerson: contactPerson || '',
        phone: phone || '',
        email: email || '',
        address: address || '',
        paymentTerms: paymentTerms || '',
        categories: categories || [],
        notes: notes || '',
        totalOrders: 0,
        totalAmount: 0,
        status: 'active',
        createdAt: now, updatedAt: now,
      };
      const r = await db.collection('suppliers').add({ data: doc });
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* PUT /api/inventory/suppliers/:id */
  router.put('/suppliers/:id', async (req, res) => {
    try {
      const db = getDb();
      const { _id, createdAt, totalOrders, totalAmount, ...fields } = req.body;
      fields.updatedAt = new Date().toISOString();
      await db.collection('suppliers').doc(req.params.id).update({ data: fields });
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* DELETE /api/inventory/suppliers/:id */
  router.delete('/suppliers/:id', async (req, res) => {
    try {
      const db = getDb();
      await db.collection('suppliers').doc(req.params.id).remove();
      res.json({ success: true, message: '已删除' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                         采 购 单
  // ══════════════════════════════════════════════════════════════════════

  /* 生成采购单号: PO2602-000001 */
  async function generatePoNo(db, clubId) {
    const now = new Date();
    const prefix = `PO${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const existing = await db.collection('purchase_orders')
      .where({ clubId })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    let seq = 1;
    if (existing.data?.length > 0) {
      const last = existing.data[0].poNo || '';
      const m = last.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `${prefix}-${String(seq).padStart(6, '0')}`;
  }

  const PO_STATUS = {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    APPROVED: 'approved',
    ORDERED: 'ordered',
    PARTIAL: 'partial_received',
    RECEIVED: 'received',
    CANCELLED: 'cancelled',
  };

  const PO_TRANSITIONS = {
    draft:            ['submitted', 'cancelled'],
    submitted:        ['approved', 'cancelled'],
    approved:         ['ordered', 'cancelled'],
    ordered:          ['partial_received', 'received', 'cancelled'],
    partial_received: ['received'],
    received:         [],
    cancelled:        [],
  };

  /* GET /api/inventory/purchase-orders */
  router.get('/purchase-orders', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { status, supplierId, page = 1, pageSize = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(pageSize);

      const where = { clubId };
      if (status) where.status = status;
      if (supplierId) where.supplierId = supplierId;

      const [countRes, listRes] = await Promise.all([
        db.collection('purchase_orders').where(where).count(),
        db.collection('purchase_orders').where(where)
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(Number(pageSize))
          .get(),
      ]);
      res.json({ success: true, data: listRes.data || [], total: countRes.total || 0 });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* GET /api/inventory/purchase-orders/:id */
  router.get('/purchase-orders/:id', async (req, res) => {
    try {
      const db = getDb();
      const r = await db.collection('purchase_orders').doc(req.params.id).get();
      const item = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!item) return res.status(404).json({ success: false, message: '采购单不存在' });
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/inventory/purchase-orders
   * Body: { supplierId, supplierName, items: [{ productId, productName, sku, quantity, unitCost }], notes }
   */
  router.post('/purchase-orders', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { supplierId, supplierName, items, notes, createdBy, createdByName } = req.body;
      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: '采购明细不能为空' });
      }

      const poNo = await generatePoNo(db, clubId);
      const totalAmount = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0);
      const totalItems = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

      const now = new Date().toISOString();
      const doc = {
        clubId, poNo,
        supplierId: supplierId || null,
        supplierName: supplierName || '',
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName || '',
          sku: i.sku || '',
          quantity: Number(i.quantity) || 0,
          unitCost: Number(i.unitCost) || 0,
          subtotal: (Number(i.quantity) || 0) * (Number(i.unitCost) || 0),
          receivedQty: 0,
        })),
        totalItems,
        totalAmount: Math.round(totalAmount * 100) / 100,
        notes: notes || '',
        status: PO_STATUS.DRAFT,
        createdBy: createdBy || '',
        createdByName: createdByName || '',
        approvedBy: null,
        orderedAt: null,
        receivedAt: null,
        createdAt: now, updatedAt: now,
      };

      const r = await db.collection('purchase_orders').add({ data: doc });
      console.log(`[Inventory] 采购单创建: ${poNo}, ¥${totalAmount.toFixed(2)}`);
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* PUT /api/inventory/purchase-orders/:id/status  状态变更 */
  router.put('/purchase-orders/:id/status', async (req, res) => {
    try {
      const db = getDb();
      const { status: newStatus, operatorName } = req.body;
      const poRes = await db.collection('purchase_orders').doc(req.params.id).get();
      const po = Array.isArray(poRes.data) ? poRes.data[0] : poRes.data;
      if (!po) return res.status(404).json({ success: false, message: '采购单不存在' });

      const allowed = PO_TRANSITIONS[po.status] || [];
      if (!allowed.includes(newStatus)) {
        return res.status(400).json({ success: false, message: `不允许从 ${po.status} → ${newStatus}` });
      }

      const now = new Date().toISOString();
      const update = { status: newStatus, updatedAt: now };
      if (newStatus === 'approved') update.approvedBy = operatorName || '';
      if (newStatus === 'ordered') update.orderedAt = now;

      await db.collection('purchase_orders').doc(req.params.id).update({ data: update });
      console.log(`[Inventory] 采购单 ${po.poNo}: ${po.status} → ${newStatus}`);
      res.json({ success: true, message: `状态已变更为 ${newStatus}` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/inventory/purchase-orders/:id/receive  收货入库
   * Body: { items: [{ productId, receivedQty }], operatorName }
   */
  router.post('/purchase-orders/:id/receive', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { items: receivedItems, operatorName } = req.body;

      const poRes = await db.collection('purchase_orders').doc(req.params.id).get();
      const po = Array.isArray(poRes.data) ? poRes.data[0] : poRes.data;
      if (!po) return res.status(404).json({ success: false, message: '采购单不存在' });

      const now = new Date().toISOString();
      const updatedItems = [...(po.items || [])];
      let allReceived = true;

      for (const ri of (receivedItems || [])) {
        const idx = updatedItems.findIndex(i => i.productId === ri.productId);
        if (idx < 0) continue;

        const qty = Number(ri.receivedQty) || 0;
        updatedItems[idx].receivedQty = (updatedItems[idx].receivedQty || 0) + qty;

        // 入库
        if (qty > 0) {
          const pRes = await db.collection('products').doc(ri.productId).get();
          const product = Array.isArray(pRes.data) ? pRes.data[0] : pRes.data;
          if (product) {
            const newStock = (Number(product.stock) || 0) + qty;
            await db.collection('products').doc(ri.productId).update({
              data: { stock: newStock, updatedAt: now }
            });
            await db.collection('stock_movements').add({
              data: {
                clubId,
                productId: ri.productId,
                productName: product.name,
                productSku: product.sku,
                type: 'in',
                quantity: qty,
                beforeStock: product.stock || 0,
                afterStock: newStock,
                reason: `采购入库 ${po.poNo}`,
                reference: po.poNo,
                operatorName: operatorName || '',
                createdAt: now,
              }
            });
          }
        }

        if (updatedItems[idx].receivedQty < updatedItems[idx].quantity) allReceived = false;
      }

      // 检查是否还有未收完的
      if (allReceived) {
        allReceived = updatedItems.every(i => (i.receivedQty || 0) >= i.quantity);
      }

      const newStatus = allReceived ? PO_STATUS.RECEIVED : PO_STATUS.PARTIAL;
      await db.collection('purchase_orders').doc(req.params.id).update({
        data: {
          items: updatedItems,
          status: newStatus,
          receivedAt: allReceived ? now : null,
          updatedAt: now,
        }
      });

      // 更新供应商统计
      if (allReceived && po.supplierId) {
        try {
          const sRes = await db.collection('suppliers').doc(po.supplierId).get();
          const supplier = Array.isArray(sRes.data) ? sRes.data[0] : sRes.data;
          if (supplier) {
            await db.collection('suppliers').doc(po.supplierId).update({
              data: {
                totalOrders: (supplier.totalOrders || 0) + 1,
                totalAmount: Math.round(((supplier.totalAmount || 0) + (po.totalAmount || 0)) * 100) / 100,
                updatedAt: now,
              }
            });
          }
        } catch (_) {}
      }

      console.log(`[Inventory] 采购单 ${po.poNo} 收货, 状态: ${newStatus}`);
      res.json({ success: true, message: allReceived ? '全部收货完成' : '部分收货', data: { status: newStatus } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                       销 售 / POS
  // ══════════════════════════════════════════════════════════════════════

  /* 生成销售单号: PS2602-000001 */
  async function generateSaleNo(db, clubId) {
    const now = new Date();
    const prefix = `PS${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const existing = await db.collection('proshop_sales')
      .where({ clubId })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    let seq = 1;
    if (existing.data?.length > 0) {
      const last = existing.data[0].saleNo || '';
      const m = last.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `${prefix}-${String(seq).padStart(6, '0')}`;
  }

  /* GET /api/inventory/sales  销售记录 */
  router.get('/sales', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { status, startDate, endDate, page = 1, pageSize = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(pageSize);

      const where = { clubId };
      if (status) where.status = status;

      const [countRes, listRes] = await Promise.all([
        db.collection('proshop_sales').where(where).count(),
        db.collection('proshop_sales').where(where)
          .orderBy('createdAt', 'desc')
          .skip(skip)
          .limit(Number(pageSize))
          .get(),
      ]);

      let list = listRes.data || [];
      if (startDate) list = list.filter(s => s.createdAt >= startDate);
      if (endDate) list = list.filter(s => s.createdAt <= endDate + 'T23:59:59');

      res.json({ success: true, data: list, total: countRes.total || 0 });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/inventory/sales  创建销售单
   * Body: {
   *   items: [{ productId, productName, sku, quantity, unitPrice, discount }],
   *   payMethod, customerId?, customerName?, folioId?, operatorName
   * }
   */
  router.post('/sales', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const {
        items, payMethod, customerId, customerName,
        folioId, operatorId, operatorName, notes,
      } = req.body;
      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: '销售明细不能为空' });
      }

      const saleNo = await generateSaleNo(db, clubId);
      const now = new Date().toISOString();
      let totalAmount = 0;
      let totalDiscount = 0;

      const saleItems = [];
      for (const item of items) {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.unitPrice) || 0;
        const disc = Number(item.discount) || 0;
        const subtotal = qty * price - disc;
        totalAmount += subtotal;
        totalDiscount += disc;

        saleItems.push({
          productId: item.productId,
          productName: item.productName || '',
          sku: item.sku || '',
          quantity: qty,
          unitPrice: price,
          discount: disc,
          subtotal: Math.round(subtotal * 100) / 100,
        });

        // 扣减库存
        const pRes = await db.collection('products').doc(item.productId).get();
        const product = Array.isArray(pRes.data) ? pRes.data[0] : pRes.data;
        if (product) {
          const newStock = Math.max(0, (Number(product.stock) || 0) - qty);
          await db.collection('products').doc(item.productId).update({
            data: {
              stock: newStock,
              totalSold: (product.totalSold || 0) + qty,
              totalRevenue: Math.round(((product.totalRevenue || 0) + subtotal) * 100) / 100,
              updatedAt: now,
            }
          });
          await db.collection('stock_movements').add({
            data: {
              clubId,
              productId: item.productId,
              productName: product.name,
              productSku: product.sku,
              type: 'out',
              quantity: qty,
              beforeStock: product.stock || 0,
              afterStock: newStock,
              reason: `销售出库 ${saleNo}`,
              reference: saleNo,
              operatorName: operatorName || '',
              createdAt: now,
            }
          });
        }
      }

      const doc = {
        clubId, saleNo,
        items: saleItems,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        payMethod: payMethod || 'cash',
        customerId: customerId || null,
        customerName: customerName || '',
        folioId: folioId || null,
        operatorId: operatorId || '',
        operatorName: operatorName || '',
        notes: notes || '',
        status: 'completed',
        createdAt: now,
      };
      const r = await db.collection('proshop_sales').add({ data: doc });

      // 如果挂账到 folio
      if (folioId) {
        try {
          await db.collection('folio_charges').add({
            data: {
              clubId, folioId,
              chargeType: 'proshop',
              chargeSource: 'proshop',
              sourceId: r._id || r.id,
              description: `专卖店消费 ${saleNo}`,
              amount: doc.totalAmount,
              quantity: 1,
              unitPrice: doc.totalAmount,
              operatorName: operatorName || '',
              chargeTime: new Date(),
              status: 'posted',
              createdAt: new Date(),
            }
          });
        } catch (e) {
          console.warn('[Inventory] 挂账失败:', e.message);
        }
      }

      console.log(`[Inventory] 销售 ${saleNo}: ¥${doc.totalAmount}, 支付: ${payMethod}`);
      res.json({ success: true, data: { _id: r._id || r.id, ...doc } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  /* POST /api/inventory/sales/:id/refund  退货 */
  router.post('/sales/:id/refund', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);
      const { operatorName, items: refundItems } = req.body;

      const saleRes = await db.collection('proshop_sales').doc(req.params.id).get();
      const sale = Array.isArray(saleRes.data) ? saleRes.data[0] : saleRes.data;
      if (!sale) return res.status(404).json({ success: false, message: '销售单不存在' });
      if (sale.status === 'refunded') return res.status(400).json({ success: false, message: '已退货' });

      const now = new Date().toISOString();
      const itemsToRefund = refundItems || sale.items;

      for (const item of itemsToRefund) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;
        const pRes = await db.collection('products').doc(item.productId).get();
        const product = Array.isArray(pRes.data) ? pRes.data[0] : pRes.data;
        if (product) {
          const newStock = (Number(product.stock) || 0) + qty;
          await db.collection('products').doc(item.productId).update({
            data: { stock: newStock, updatedAt: now }
          });
          await db.collection('stock_movements').add({
            data: {
              clubId,
              productId: item.productId,
              productName: product.name || item.productName,
              productSku: product.sku || item.sku,
              type: 'in',
              quantity: qty,
              beforeStock: product.stock || 0,
              afterStock: newStock,
              reason: `退货入库 ${sale.saleNo}`,
              reference: sale.saleNo,
              operatorName: operatorName || '',
              createdAt: now,
            }
          });
        }
      }

      await db.collection('proshop_sales').doc(req.params.id).update({
        data: { status: 'refunded', refundedAt: now, updatedAt: now }
      });

      res.json({ success: true, message: '退货成功' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  //                         报 表 统 计
  // ══════════════════════════════════════════════════════════════════════

  /* GET /api/inventory/stats  综合统计 */
  router.get('/stats', async (req, res) => {
    try {
      const db = getDb();
      const clubId = getClubId(req);

      const [productsRes, salesRes, poRes, lowStockRes] = await Promise.all([
        db.collection('products').where({ clubId, status: 'active' }).limit(1000).get(),
        db.collection('proshop_sales').where({ clubId }).limit(1000).get(),
        db.collection('purchase_orders').where({ clubId }).limit(500).get(),
        db.collection('products').where({ clubId, status: 'active' }).limit(500).get(),
      ]);

      const products = productsRes.data || [];
      const sales = salesRes.data || [];
      const pos = poRes.data || [];
      const lowStock = (lowStockRes.data || []).filter(p => (p.stock || 0) <= (p.minStock || 5));

      // 商品统计
      const totalProducts = products.length;
      const totalStockValue = products.reduce((s, p) => s + (p.stock || 0) * (p.costPrice || 0), 0);
      const totalRetailValue = products.reduce((s, p) => s + (p.stock || 0) * (p.price || 0), 0);

      // 销售统计
      const completedSales = sales.filter(s => s.status === 'completed');
      const today = new Date().toISOString().slice(0, 10);
      const todaySales = completedSales.filter(s => (s.createdAt || '').startsWith(today));
      const totalSalesRevenue = completedSales.reduce((s, item) => s + (item.totalAmount || 0), 0);
      const todaySalesRevenue = todaySales.reduce((s, item) => s + (item.totalAmount || 0), 0);

      // 采购统计
      const pendingPOs = pos.filter(p => !['received', 'cancelled'].includes(p.status));
      const totalPurchaseAmount = pos.filter(p => p.status === 'received').reduce((s, p) => s + (p.totalAmount || 0), 0);

      // 畅销商品 TOP 10
      const topSellers = [...products]
        .sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0))
        .slice(0, 10)
        .map(p => ({ name: p.name, sku: p.sku, totalSold: p.totalSold || 0, revenue: p.totalRevenue || 0 }));

      // 按分类统计
      const byCategory = {};
      products.forEach(p => {
        const cat = p.categoryName || '未分类';
        if (!byCategory[cat]) byCategory[cat] = { count: 0, stockValue: 0, totalSold: 0 };
        byCategory[cat].count++;
        byCategory[cat].stockValue += (p.stock || 0) * (p.costPrice || 0);
        byCategory[cat].totalSold += p.totalSold || 0;
      });

      res.json({
        success: true,
        data: {
          products: { total: totalProducts, lowStockCount: lowStock.length, totalStockValue: Math.round(totalStockValue * 100) / 100, totalRetailValue: Math.round(totalRetailValue * 100) / 100 },
          sales: { totalCount: completedSales.length, totalRevenue: Math.round(totalSalesRevenue * 100) / 100, todayCount: todaySales.length, todayRevenue: Math.round(todaySalesRevenue * 100) / 100 },
          purchases: { pendingCount: pendingPOs.length, totalAmount: Math.round(totalPurchaseAmount * 100) / 100 },
          topSellers,
          byCategory,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
