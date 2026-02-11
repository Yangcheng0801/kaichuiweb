import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { api } from '@/utils/api'

interface Course {
  _id?: string
  name: string
  holes: number
  par: number
  yardage: number
  description: string
  status: 'active' | 'maintenance' | 'closed'
  clubId: string
}

const DEFAULTS: Omit<Course, '_id'> = {
  name: '', holes: 18, par: 72, yardage: 6500,
  description: '', status: 'active', clubId: 'default'
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:      { label: '开放中',  color: 'bg-emerald-100 text-emerald-700' },
  maintenance: { label: '维护中',  color: 'bg-yellow-100  text-yellow-700'  },
  closed:      { label: '已关闭',  color: 'bg-gray-100    text-gray-500'    },
}

export default function Courses() {
  const [list, setList]         = useState<Course[]>([])
  const [loading, setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]   = useState<Course | null>(null)   // null = 新增
  const [form, setForm]         = useState<Omit<Course, '_id'>>(DEFAULTS)
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.resources.courses.getList().then((res: any) => {
      setList(res.data || [])
    }).catch(() => toast.error('加载球场列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm(DEFAULTS)
    setModalOpen(true)
  }

  const openEdit = (item: Course) => {
    setEditing(item)
    const { _id, ...rest } = item
    setForm(rest)
    setModalOpen(true)
  }

  const set = (key: keyof Omit<Course, '_id'>, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('球场名称不能为空'); return }
    setSaving(true)
    try {
      if (editing?._id) {
        await api.resources.courses.update(editing._id, form)
        toast.success('球场更新成功')
      } else {
        await api.resources.courses.create(form)
        toast.success('球场创建成功')
      }
      setModalOpen(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.resources.courses.delete(id)
      toast.success('球场已删除')
      setDeleteId(null)
      load()
    } catch { /* 错误已由拦截器处理 */ }
  }

  return (
    <div>
      {/* 操作栏 */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">共 {list.length} 个球场</p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus size={15} /> 新增球场
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">暂无球场，点击右上角新增</div>
      ) : (
        <div className="space-y-3">
          {list.map(item => (
            <div key={item._id} className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {item.holes}H
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{item.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Par {item.par} · {item.yardage} 码
                    {item.description && ` · ${item.description}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_MAP[item.status]?.color}`}>
                  {STATUS_MAP[item.status]?.label}
                </span>
                <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-emerald-600 transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleteId(item._id!)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
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
              <h2 className="font-semibold text-gray-900">{editing ? '编辑球场' : '新增球场'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">球场名称 <span className="text-red-500">*</span></label>
                <input
                  type="text" value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="例：南区18洞球场"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '洞数', key: 'holes' as const, min: 9, max: 36, step: 9 },
                  { label: 'Par', key: 'par' as const, min: 54, max: 90 },
                  { label: '码数', key: 'yardage' as const, min: 1000, max: 10000, step: 100 },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                    <input
                      type="number" value={form[f.key]} min={f.min} max={f.max} step={f.step || 1}
                      onChange={e => set(f.key, parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <select
                  value={form.status}
                  onChange={e => set('status', e.target.value as Course['status'])}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                >
                  {Object.entries(STATUS_MAP).map(([v, { label }]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  rows={2} value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="可填写球场特色、注意事项等..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">取消</button>
              <button
                onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-500" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">确认删除球场？</h3>
            <p className="text-sm text-gray-500 mb-6">删除后无法恢复，请谨慎操作。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
