import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { api } from '@/utils/api'

interface Caddie {
  _id?: string
  caddyNo?: string
  name: string
  gender: 'male' | 'female'
  phone: string
  experience: number   // 年限
  level: 'junior' | 'senior' | 'expert'
  status: 'available' | 'busy' | 'off'
  note: string
  clubId: string
}

const DEFAULTS: Omit<Caddie, '_id'> = {
  caddyNo: '', name: '', gender: 'female', phone: '', experience: 1,
  level: 'junior', status: 'available', note: '', clubId: 'default'
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  available: { label: '空闲',  color: 'bg-emerald-100 text-emerald-700' },
  busy:      { label: '服务中', color: 'bg-blue-100   text-blue-700'    },
  off:       { label: '休息',  color: 'bg-gray-100   text-gray-500'    },
}

const LEVEL_MAP: Record<string, string> = {
  junior: '初级', senior: '中级', expert: '高级'
}

export default function Caddies() {
  const [list, setList]           = useState<Caddie[]>([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Caddie | null>(null)
  const [form, setForm]           = useState<Omit<Caddie, '_id'>>(DEFAULTS)
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.resources.caddies.getList().then((res: any) => {
      setList(res.data || [])
    }).catch(() => toast.error('加载球童列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(DEFAULTS); setModalOpen(true) }
  const openEdit = (item: Caddie) => {
    setEditing(item)
    const { _id, no, ...rest } = item as Caddie & { no?: string }
    setForm({ ...rest, caddyNo: (rest.caddyNo || no || '').toString() })
    setModalOpen(true)
  }
  const set = (key: keyof Omit<Caddie, '_id'>, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('球童姓名不能为空'); return }
    setSaving(true)
    try {
      if (editing?._id) {
        await api.resources.caddies.update(editing._id, form)
        toast.success('球童信息更新成功')
      } else {
        await api.resources.caddies.create(form)
        toast.success('球童添加成功')
      }
      setModalOpen(false); load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.resources.caddies.delete(id)
      toast.success('球童已删除')
      setDeleteId(null); load()
    } catch { /* 拦截器处理 */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">共 {list.length} 名球童</p>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
          <Plus size={15} /> 新增球童
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">暂无球童信息，点击右上角新增</div>
      ) : (
        <div className="space-y-3">
          {list.map(item => (
            <div key={item._id} className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm flex-shrink-0 ${item.gender === 'female' ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
                  {item.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 text-sm">
                    {((item as Caddie).caddyNo || (item as { no?: string }).no) && (
                      <span className="inline-block mr-2 font-mono text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">{((item as Caddie).caddyNo || (item as { no?: string }).no)}号</span>
                    )}
                    {item.name}
                    <span className="ml-2 text-xs text-gray-400">{item.gender === 'female' ? '女' : '男'} · {LEVEL_MAP[item.level]}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {item.experience} 年经验{item.phone && ` · ${item.phone}`}
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
              <h2 className="font-semibold text-gray-900">{editing ? '编辑球童' : '新增球童'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">球童号</label>
                  <input type="text" value={form.caddyNo || ''} onChange={e => set('caddyNo', e.target.value)} placeholder="如: 18"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">姓名 <span className="text-red-500">*</span></label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="请输入姓名"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                  <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="手机号"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">性别</label>
                  <select value={form.gender} onChange={e => set('gender', e.target.value as Caddie['gender'])}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                    <option value="female">女</option>
                    <option value="male">男</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">等级</label>
                  <select value={form.level} onChange={e => set('level', e.target.value as Caddie['level'])}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                    {Object.entries(LEVEL_MAP).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">经验（年）</label>
                  <input type="number" value={form.experience} min={0} max={50} onChange={e => set('experience', parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <select value={form.status} onChange={e => set('status', e.target.value as Caddie['status'])}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
                  {Object.entries(STATUS_MAP).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea rows={2} value={form.note} onChange={e => set('note', e.target.value)} placeholder="可填写特长、资质等..."
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
            <h3 className="font-semibold text-gray-900 mb-2">确认删除该球童？</h3>
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
