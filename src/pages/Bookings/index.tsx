import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, List } from 'lucide-react'
import TeeSheet from './TeeSheet'
import BookingForm from './BookingForm'

type ViewKey = 'teesheet' | 'list'

const VIEWS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: 'teesheet', label: '发球表', icon: <CalendarDays size={16} /> },
  { key: 'list',     label: '预订列表', icon: <List size={16} /> },
]

export default function Bookings() {
  const navigate = useNavigate()
  const [activeView, setActiveView]   = useState<ViewKey>('teesheet')
  const [formOpen, setFormOpen]       = useState(false)
  const [formDate, setFormDate]       = useState('')   // 从发球表点击新增时带入日期
  const [refreshKey, setRefreshKey]   = useState(0)   // 触发子组件刷新

  const handleNewBooking = (date: string) => {
    setFormDate(date)
    setFormOpen(true)
  }

  const handleFormSuccess = () => {
    setRefreshKey(k => k + 1)
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 h-[60px] flex items-center gap-4 shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <h1 className="text-base font-semibold text-gray-900">预订管理</h1>
      </header>

      <div className="flex-1 flex flex-col px-6 py-6 gap-4">
        {/* 视图切换 Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeView === v.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>

        {/* 内容区：撐满剩余高度 */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {activeView === 'teesheet' && (
            <TeeSheet
              key={refreshKey}
              onNewBooking={handleNewBooking}
              onStatusChange={handleFormSuccess}
            />
          )}
          {activeView === 'list' && (
            <BookingList key={refreshKey} onNewBooking={handleNewBooking} />
          )}
        </div>
      </div>

      {/* 新建预订弹窗 */}
      {formOpen && (
        <BookingForm
          initialDate={formDate}
          onClose={() => setFormOpen(false)}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  )
}

// ─── 预订列表视图（简版） ─────────────────────────────────────────────────────

import { useEffect } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { api } from '@/utils/api'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: '待确认', color: 'bg-yellow-100 text-yellow-700'  },
  confirmed:  { label: '已确认', color: 'bg-emerald-100 text-emerald-700' },
  checked_in: { label: '已签到', color: 'bg-blue-100 text-blue-700'      },
  completed:  { label: '已完赛', color: 'bg-gray-100 text-gray-500'      },
  cancelled:  { label: '已取消', color: 'bg-red-100 text-red-400'        },
}

function BookingList({ onNewBooking }: { onNewBooking: (date: string) => void }) {
  const [list, setList]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus]   = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const load = () => {
    setLoading(true)
    api.bookings.getList(status ? { status } : {}).then((res: any) => {
      setList(res.data || [])
    }).catch(() => toast.error('加载预订列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [status])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2 flex-wrap">
          {[
            { value: '', label: '全部' },
            { value: 'confirmed', label: '已确认' },
            { value: 'checked_in', label: '已签到' },
            { value: 'completed', label: '已完赛' },
            { value: 'cancelled', label: '已取消' },
          ].map(opt => (
            <button key={opt.value} onClick={() => setStatus(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                status === opt.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={() => onNewBooking(today)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
          <Plus size={15} /> 新增预订
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <div className="text-4xl mb-3">⛳</div>
          <p className="text-sm">暂无预订记录</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(b => {
            const s = STATUS_MAP[b.status] || STATUS_MAP.pending
            return (
              <div key={b._id} className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="flex-shrink-0 text-center w-16">
                    <div className="text-sm font-bold text-gray-800">{b.date}</div>
                    <div className="text-base font-semibold text-emerald-600">{b.teeTime}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">
                      {b.courseName} · {b.playerCount}人
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {b.players?.map((p: any) => p.name).join('、')}
                      {b.caddyName && ` · 球童：${b.caddyName}`}
                      {b.totalFee > 0 && ` · ¥${b.totalFee}`}
                    </div>
                  </div>
                </div>
                <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ml-4 ${s.color}`}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
