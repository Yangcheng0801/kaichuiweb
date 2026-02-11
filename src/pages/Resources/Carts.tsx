import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { api } from '@/utils/api'

interface Cart {
  _id?: string
  cartNo: string        // 车牌号/编号
  model: string         // 型号
  seats: number         // 座位数
  feePerRound: number   // 每轮收费
  status: 'available' | 'in_use' | 'maintenance' | 'retired'
  note: string
  clubId: string
}

const DEFAULTS: Omit<Cart, '_id'> = {
  cartNo: '', model: '', seats: 2,
  feePerRound: 150, status: 'available', note: '', clubId: 'default'
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  available:   { label: '空闲',  color: 'bg-emerald-100 text-emerald-700' },
  in_use:      { label: '使用中', color: 'bg-blue-100   text-blue-700'    },
  maintenance: { label: '维修中', color: 'bg-yellow-100  text-yellow-700'  },
  retired:     { label: '已报废', color: 'bg-gray-100   text-gray-400'    },
}

export default function Carts() {
  const [list, setList]           = useState<Cart[]>([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Cart | null>(null)
  const [form, setForm]           = useState<Omit<Cart, '_id'>>(DEFAULTS)
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.resources.carts.getList().then((res: any) => {
      setList(res.data || [])
    }).catch(() => toast.error('加载球车列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(DEFAULTS); setModalOpen(true) }
  const openEdit = (item: Cart) => {
    setEditing(item)
    const { _id, ...rest } = item
    setForm(rest)
    setModalOpen(true)
  }
  const set = (key: keyof Omit<Cart, '_id'>, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.cartNo.trim()) { toast.error('车辆编号不能为空'); return }
    setSaving(true)
    try {
      if (editing?._id) {
        await api.resources.carts.update(editing._id, form)
        toast.success('球车信息更新成功')
      } else {
        await api.resources.carts.create(form)
        toast.success('球车添加成功')
      }
      setModalOpen(false); load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.resources.carts.delete(id)
      toast.success('球车已删除')
      setDeleteId(null); load()
    } catch { /* 拦截器处理 */ }
  }

  // 统计
  const stats = {
    available:   list.filter(c => c.status === 'available').length,
    in_use:      list.filter(c => c.status === 'in_use').length,
    maintenance: list.filter(c => c.status === 'maintenance').length,
  }

  return (
    <div>
      {/* 状态统计卡片 */}
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: '空闲', count: stats.available, color: 'text-emerald-600 bg-emerald-50' },
            { label: '使用中', count: stats.in_use, color: 'text-blue-600 bg-blue-50' },
            { label: '维修中', count: stats.maintenance, color: 'text-yellow-600 bg-yellow-50' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl px-4 py-3 ${s.color}`}>
              <div className="text-2xl font-bold">{s.count}</div>
              <div className="text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">共 {list.length} 辆球车</p>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
          <Plus size={15} /> 新增球车
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">暂无球车信息，点击右上角新增</div>
      ) : (
        <div className="space-y-3">
          {list.map(item => (
            <div key={item._id} className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {item.seats}座
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 text-sm">
                    {item.cartNo}
                    {item.model && <span className="ml-2 text-xs text-gray-400">{item.model}</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    ¥{item.feePerRound}/轮
                    {item.note && ` · ${item.note}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_MAP[item.status]?.color}`}>
                  {STATUS_MAP[item.status]?.label}
                </span>
                <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-emerald-600 transition-colors"><Pencil size={14} /></button>
                <button onClick={() => setDeleteId(item._id!)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? '编辑球车' : '新增球车'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">车辆编号 <span className="text-red-500">*</span></label>
                  <input type="text" value={form.cartNo} onChange={e => set('cartNo', e.target.value)} placeholder="例：A-01"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">车辆型号</label>
                  <input type="text" value={form.model} onChange={e => set('model', e.target.value)} placeholder="例：EZGo TXT"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">座位数</label>
                  <input type="number" value={form.seats} min={1} max={6} onChange={e => set('seats', parseInt(e.target.value, 10) || 2)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">每轮收费（元）</label>
                  <input type="number" value={form.feePerRound} min={0} onChange={e => set('feePerRound', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <select value={form.status} onChange={e => set('status', e.target.value as Cart['status'])}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  {Object.entries(STATUS_MAP).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea rows={2} value={form.note} onChange={e => set('note', e.target.value)} placeholder="可填写车况、维保记录等..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">取消</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={20} className="text-red-500" /></div>
            <h3 className="font-semibold text-gray-900 mb-2">确认删除该球车？</h3>
            <p className="text-sm text-gray-500 mb-6">删除后无法恢复。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
