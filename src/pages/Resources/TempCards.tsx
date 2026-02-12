import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, X, RotateCcw, CreditCard, Zap } from 'lucide-react'
import { api } from '@/utils/api'

interface TempCard {
  _id: string
  cardNo: string
  cardType: string   // physical / virtual
  status: string     // available / in_use / lost / retired
  currentBookingId: string | null
  currentPlayerName: string | null
  issuedAt: string | null
  returnedAt: string | null
}

const STATUS_MAP: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  available: { label: '可用',   dot: 'bg-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  in_use:    { label: '使用中', dot: 'bg-blue-400',    text: 'text-blue-700',    bg: 'bg-blue-50'    },
  lost:      { label: '遗失',   dot: 'bg-orange-400',  text: 'text-orange-700',  bg: 'bg-orange-50'  },
  retired:   { label: '已停用', dot: 'bg-gray-300',    text: 'text-gray-500',    bg: 'bg-gray-50'    },
}

function formatTime(v: any): string {
  if (!v) return '-'
  if (typeof v === 'object' && v.$date) return new Date(v.$date).toLocaleString('zh-CN')
  const d = new Date(v)
  return isNaN(d.getTime()) ? '-' : d.toLocaleString('zh-CN')
}

export default function TempCards() {
  const [cards, setCards]         = useState<TempCard[]>([])
  const [loading, setLoading]     = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType]     = useState('')

  // 新增表单
  const [formMode, setFormMode]   = useState<'single' | 'batch'>('single')
  const [formCardNo, setFormCardNo] = useState('')
  const [batchPrefix, setBatchPrefix] = useState('T-')
  const [batchStart, setBatchStart]   = useState('1')
  const [batchEnd, setBatchEnd]       = useState('20')

  const load = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (filterStatus) params.status = filterStatus
      if (filterType)   params.cardType = filterType
      const res = await api.tempCards.getList(params)
      setCards((res as any).data || [])
    } catch {
      toast.error('加载消费卡列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterStatus, filterType])

  // 统计
  const statsArr = [
    { label: '总数',   value: cards.length,                                    color: 'text-gray-800' },
    { label: '可用',   value: cards.filter(c => c.status === 'available').length, color: 'text-emerald-600' },
    { label: '使用中', value: cards.filter(c => c.status === 'in_use').length,    color: 'text-blue-600' },
    { label: '实体卡', value: cards.filter(c => c.cardType === 'physical').length, color: 'text-gray-600' },
    { label: '虚拟卡', value: cards.filter(c => c.cardType === 'virtual').length,  color: 'text-purple-600' },
  ]

  const handleCreate = async () => {
    if (formMode === 'single') {
      if (!formCardNo.trim()) { toast.error('卡号不能为空'); return }
      try {
        await api.tempCards.create({ cardNo: formCardNo.trim() })
        toast.success('消费卡录入成功')
        setShowAdd(false)
        setFormCardNo('')
        load()
      } catch { /* interceptor */ }
    } else {
      const start = parseInt(batchStart)
      const end = parseInt(batchEnd)
      if (isNaN(start) || isNaN(end) || end < start) { toast.error('请输入有效的起止编号'); return }
      const batch = []
      for (let i = start; i <= end; i++) {
        batch.push({ cardNo: `${batchPrefix}${String(i).padStart(4, '0')}` })
      }
      try {
        await api.tempCards.create({ batch })
        toast.success(`批量录入 ${batch.length} 张消费卡成功`)
        setShowAdd(false)
        load()
      } catch { /* interceptor */ }
    }
  }

  const handleReturn = async (card: TempCard) => {
    if (card.status !== 'in_use') return
    try {
      await api.tempCards.returnCard({ cardId: card._id })
      toast.success(`消费卡 ${card.cardNo} 已回收`)
      load()
    } catch { /* interceptor */ }
  }

  const handleDelete = async (card: TempCard) => {
    if (card.status === 'in_use') { toast.error('使用中的消费卡不能删除'); return }
    if (!confirm(`确定删除消费卡 ${card.cardNo}？`)) return
    try {
      await api.tempCards.remove(card._id)
      toast.success('已删除')
      load()
    } catch { /* interceptor */ }
  }

  return (
    <div className="space-y-6">
      {/* 统计 */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {statsArr.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">全部状态</option>
          <option value="available">可用</option>
          <option value="in_use">使用中</option>
          <option value="retired">已停用</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">全部类型</option>
          <option value="physical">实体卡</option>
          <option value="virtual">虚拟卡</option>
        </select>
        <button onClick={() => setShowAdd(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
          <Plus size={15} /> 录入实体卡
        </button>
      </div>

      {/* 卡片列表 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <div className="text-4xl mb-3"><CreditCard size={48} className="mx-auto opacity-30" /></div>
          <p className="text-sm">暂无消费卡</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="text-left px-4 py-3 font-medium">卡号</th>
                <th className="text-left px-4 py-3 font-medium">类型</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">当前使用者</th>
                <th className="text-left px-4 py-3 font-medium">发放时间</th>
                <th className="text-left px-4 py-3 font-medium">回收时间</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cards.map(c => {
                const sm = STATUS_MAP[c.status] || STATUS_MAP.available
                return (
                  <tr key={c._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {c.cardType === 'physical'
                          ? <CreditCard size={14} className="text-gray-400" />
                          : <Zap size={14} className="text-purple-400" />
                        }
                        {c.cardNo}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.cardType === 'physical' ? 'bg-gray-100 text-gray-600' : 'bg-purple-50 text-purple-600'}`}>
                        {c.cardType === 'physical' ? '实体卡' : '虚拟卡'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${sm.bg} ${sm.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                        {sm.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.currentPlayerName || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatTime(c.issuedAt)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatTime(c.returnedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status === 'in_use' && (
                          <button onClick={() => handleReturn(c)}
                            className="px-2.5 py-1 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-1">
                            <RotateCcw size={12} /> 回收
                          </button>
                        )}
                        {c.status !== 'in_use' && (
                          <button onClick={() => handleDelete(c)}
                            className="px-2.5 py-1 text-xs bg-white text-red-400 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 新增弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">录入实体消费卡</h2>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setFormMode('single')}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-all ${formMode === 'single' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium' : 'border-gray-200 text-gray-500'}`}>
                  单张录入
                </button>
                <button onClick={() => setFormMode('batch')}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-all ${formMode === 'batch' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium' : 'border-gray-200 text-gray-500'}`}>
                  批量录入
                </button>
              </div>

              {formMode === 'single' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">卡号</label>
                  <input value={formCardNo} onChange={e => setFormCardNo(e.target.value)}
                    placeholder="如：T-0001" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">卡号前缀</label>
                    <input value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)}
                      placeholder="如：T-" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">起始编号</label>
                      <input type="number" value={batchStart} onChange={e => setBatchStart(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">结束编号</label>
                      <input type="number" value={batchEnd} onChange={e => setBatchEnd(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    将生成 {batchPrefix}{String(parseInt(batchStart) || 1).padStart(4, '0')} ~ {batchPrefix}{String(parseInt(batchEnd) || 20).padStart(4, '0')}
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">确认录入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
