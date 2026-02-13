/**
 * 身份类型管理页面 (Identity Types)
 *
 * 功能：
 *   - 管理球场所有可用球员身份类型
 *   - 按分类（标准/会员/特殊）分组显示
 *   - 支持新增、编辑、停用/启用、删除（系统默认不可删除）
 *   - 一键初始化默认身份（11种行业标准身份）
 *   - 色彩标识 + 排序
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Plus, X, Edit3, Trash2, Zap, Shield, Users, Star, ChevronRight } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface IdentityType {
  _id: string
  clubId: string
  code: string
  name: string
  category: 'standard' | 'member' | 'special'
  memberLevel: number | null
  sortOrder: number
  color: string
  isDefault: boolean
  status: 'active' | 'inactive'
  ageMin: number | null
  ageMax: number | null
  description: string
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  standard: { label: '标准身份', icon: <Users size={16} />, description: '基础客户类型，如散客、嘉宾' },
  member:   { label: '会员身份', icon: <Star size={16} />,  description: '会员等级体系，按等级享受不同折扣' },
  special:  { label: '特殊身份', icon: <Shield size={16} />, description: '青少年、教练、长者、礼遇、员工等特殊客群' },
}

const PRESET_COLORS = [
  '#6b7280', '#3b82f6', '#10b981', '#eab308', '#8b5cf6',
  '#f43f5e', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
  '#64748b', '#ef4444', '#84cc16', '#ec4899', '#0ea5e9',
]

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function IdentityTypes() {
  const [identities, setIdentities] = useState<IdentityType[]>([])
  const [loading, setLoading] = useState(true)
  const [editItem, setEditItem] = useState<IdentityType | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<Partial<IdentityType>>({})
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await api.identityTypes.getList()
      setIdentities(res.data || [])
    } catch {
      // interceptor
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── 分组 ──
  const grouped = {
    standard: identities.filter(i => i.category === 'standard'),
    member:   identities.filter(i => i.category === 'member'),
    special:  identities.filter(i => i.category === 'special'),
  }

  // ── 初始化种子 ──
  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res: any = await api.identityTypes.seed()
      if (res.data?.skipped) {
        toast.info('身份类型已存在，无需重复初始化')
      } else {
        toast.success(res.message || '初始化成功')
      }
      load()
    } catch {} finally {
      setSeeding(false)
    }
  }

  // ── 新建 ──
  const openNew = () => {
    setIsNew(true)
    setEditItem(null)
    setForm({
      code: '', name: '', category: 'special',
      memberLevel: null, sortOrder: 200,
      color: '#06b6d4', ageMin: null, ageMax: null, description: '',
    })
  }

  // ── 编辑 ──
  const openEdit = (item: IdentityType) => {
    setIsNew(false)
    setEditItem(item)
    setForm({ ...item })
  }

  const closeForm = () => { setEditItem(null); setIsNew(false); setForm({}) }

  // ── 保存 ──
  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error('身份代码和名称必填')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        await api.identityTypes.create(form)
        toast.success('身份类型创建成功')
      } else if (editItem?._id) {
        await api.identityTypes.update(editItem._id, form)
        toast.success('身份类型更新成功')
      }
      closeForm()
      load()
    } catch {} finally {
      setSaving(false)
    }
  }

  // ── 删除 ──
  const handleDelete = async (item: IdentityType) => {
    if (item.isDefault) {
      toast.error('系统默认身份不可删除，可设置为停用')
      return
    }
    if (!confirm(`确认删除「${item.name}」？`)) return
    try {
      await api.identityTypes.remove(item._id)
      toast.success('已删除')
      load()
    } catch {}
  }

  // ── 停用/启用 ──
  const handleToggleStatus = async (item: IdentityType) => {
    const newStatus = item.status === 'active' ? 'inactive' : 'active'
    try {
      await api.identityTypes.update(item._id, { status: newStatus })
      toast.success(newStatus === 'active' ? '已启用' : '已停用')
      load()
    } catch {}
  }

  // ── 身份卡片渲染 ──
  const renderCard = (item: IdentityType) => (
    <div
      key={item._id}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all group ${
        item.status === 'inactive' ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* 色彩标识 */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: item.color }}>
        {item.name[0]}
      </div>

      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{item.name}</span>
          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.code}</span>
          {item.isDefault && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">系统</span>}
          {item.status === 'inactive' && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full">已停用</span>}
        </div>
        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
          {item.memberLevel !== null && <span>会员等级 Lv.{item.memberLevel}</span>}
          {item.ageMin !== null && <span>{item.ageMin}-{item.ageMax ?? '∞'}岁</span>}
          {item.description && <span className="truncate">{item.description}</span>}
          <span>排序: {item.sortOrder}</span>
        </div>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => handleToggleStatus(item)} className={`p-1.5 rounded-lg text-xs ${item.status === 'active' ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
          title={item.status === 'active' ? '停用' : '启用'}>
          {item.status === 'active' ? '停用' : '启用'}
        </button>
        <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
          <Edit3 size={13} />
        </button>
        {!item.isDefault && (
          <button onClick={() => handleDelete(item)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )

  // ── 编辑/新建弹窗 ──
  const renderFormModal = () => {
    if (!isNew && !editItem) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{isNew ? '新建身份类型' : '编辑身份类型'}</h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* 代码 + 名称 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">身份代码 <span className="text-red-500">*</span></label>
                <input value={form.code || ''} onChange={e => setForm(p => ({ ...p, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                  disabled={!isNew && editItem?.isDefault}
                  placeholder="如：junior, vip_gold"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 font-mono disabled:bg-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">显示名称 <span className="text-red-500">*</span></label>
                <input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="如：青少年"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>

            {/* 分类 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">分类</label>
              <select value={form.category || 'special'} onChange={e => setForm(p => ({ ...p, category: e.target.value as any }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                <option value="standard">标准身份</option>
                <option value="member">会员身份</option>
                <option value="special">特殊身份</option>
              </select>
            </div>

            {/* 会员等级（仅 member 分类） */}
            {form.category === 'member' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">会员等级</label>
                <input type="number" min={1} max={10} value={form.memberLevel ?? ''} onChange={e => setForm(p => ({ ...p, memberLevel: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            )}

            {/* 年龄限制 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">最小年龄</label>
                <input type="number" min={0} value={form.ageMin ?? ''} onChange={e => setForm(p => ({ ...p, ageMin: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="不限" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">最大年龄</label>
                <input type="number" min={0} value={form.ageMax ?? ''} onChange={e => setForm(p => ({ ...p, ageMax: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="不限" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>

            {/* 颜色 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">标识颜色</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                    className={`w-7 h-7 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            {/* 排序 + 说明 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">排序权重</label>
                <input type="number" value={form.sortOrder ?? 200} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">描述</label>
                <input value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="选填" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={closeForm} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">身份类型管理</h2>
          <p className="text-sm text-gray-500 mt-0.5">管理球场所有球员身份，配置后可在价格矩阵中为每种身份设置独立价格</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> 刷新
          </button>
          {identities.length === 0 && (
            <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
              <Zap size={14} /> {seeding ? '初始化中...' : '一键初始化'}
            </button>
          )}
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
            <Plus size={14} /> 新增身份
          </button>
        </div>
      </div>

      {/* 内容 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">加载中...</div>
      ) : identities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <Users size={48} className="text-gray-200" />
          <p className="text-sm">暂无身份类型，点击「一键初始化」生成行业默认身份</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(['standard', 'member', 'special'] as const).map(cat => {
            const items = grouped[cat]
            if (items.length === 0) return null
            const info = CATEGORY_LABELS[cat]
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-gray-400">{info.icon}</span>
                  <h3 className="text-sm font-semibold text-gray-700">{info.label}</h3>
                  <ChevronRight size={12} className="text-gray-300" />
                  <span className="text-xs text-gray-400">{info.description}</span>
                  <span className="text-xs text-gray-300 ml-auto">{items.length} 项</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map(renderCard)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 弹窗 */}
      {renderFormModal()}
    </div>
  )
}
