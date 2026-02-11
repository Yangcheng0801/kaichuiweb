import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface Booking {
  _id: string
  date: string
  teeTime: string
  courseId: string
  courseName: string
  players: { name: string; type: string }[]
  playerCount: number
  caddyName: string
  cartNo: string
  totalFee: number
  status: string
  note: string
}

interface Course { _id: string; name: string; holes: number }

interface Props {
  onNewBooking: (date: string) => void
  onStatusChange: () => void
}

// ─── 状态样式 ─────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; dot: string; card: string; text: string }> = {
  pending:    { label: '待确认', dot: 'bg-yellow-400',  card: 'border-yellow-200 bg-yellow-50',  text: 'text-yellow-700' },
  confirmed:  { label: '已确认', dot: 'bg-emerald-400', card: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700' },
  checked_in: { label: '已签到', dot: 'bg-blue-400',    card: 'border-blue-200 bg-blue-50',       text: 'text-blue-700'    },
  completed:  { label: '已完赛', dot: 'bg-gray-300',    card: 'border-gray-200 bg-gray-50',       text: 'text-gray-500'    },
  cancelled:  { label: '已取消', dot: 'bg-red-300',     card: 'border-red-200 bg-red-50',         text: 'text-red-400'     },
}

// ─── 日期工具 ─────────────────────────────────────────────────────────────────

function formatDate(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function formatDisplay(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export default function TeeSheet({ onNewBooking, onStatusChange }: Props) {
  const today = formatDate(new Date())
  const [date, setDate]         = useState(today)
  const [courseId, setCourseId] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [courses, setCourses]   = useState<Course[]>([])
  const [loading, setLoading]   = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)  // 操作中的预订 id

  // 加载球场列表
  useEffect(() => {
    api.resources.courses.getList({ status: 'active' }).then((res: any) => {
      const list = res.data || []
      setCourses(list)
      if (list.length > 0 && !courseId) setCourseId(list[0]._id)
    })
  }, [])

  // 加载发球表
  const load = () => {
    if (!date) return
    setLoading(true)
    api.bookings.getTeeSheet({ date, courseId: courseId || undefined }).then((res: any) => {
      setBookings(res.data || [])
    }).catch(() => toast.error('加载发球表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [date, courseId])

  // 状态变更
  const handleStatusChange = async (id: string, action: 'checkIn' | 'complete' | 'cancel') => {
    setActionId(id)
    try {
      if (action === 'checkIn')  await api.bookings.checkIn(id)
      if (action === 'complete') await api.bookings.complete(id)
      if (action === 'cancel')   await api.bookings.cancel(id)
      toast.success(action === 'checkIn' ? '签到成功' : action === 'complete' ? '已标记完赛' : '预订已取消')
      load()
      onStatusChange()
    } catch { /* 拦截器处理 */ }
    finally { setActionId(null) }
  }

  // 按时间排序的预订
  const sorted = [...bookings].sort((a, b) => a.teeTime.localeCompare(b.teeTime))

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* 日期导航 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setDate(formatDate(addDays(new Date(date), -1)))}
            className="p-1.5 rounded hover:bg-white transition-colors text-gray-600"><ChevronLeft size={16} /></button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-2 py-1 bg-transparent text-sm font-medium text-gray-800 focus:outline-none" />
          <button onClick={() => setDate(formatDate(addDays(new Date(date), 1)))}
            className="p-1.5 rounded hover:bg-white transition-colors text-gray-600"><ChevronRight size={16} /></button>
        </div>

        {/* 今日快捷 */}
        {date !== today && (
          <button onClick={() => setDate(today)}
            className="px-3 py-1.5 text-xs text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
            今天
          </button>
        )}

        {/* 球场选择 */}
        {courses.length > 1 && (
          <select value={courseId} onChange={e => setCourseId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white">
            <option value="">全部球场</option>
            {courses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}

        {/* 新增按钮 */}
        <button onClick={() => onNewBooking(date)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
          <Plus size={15} /> 新增预订
        </button>
      </div>

      {/* 日期显示 */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="font-semibold text-gray-800">{formatDisplay(date)}</h3>
        <span className="text-sm text-gray-400">{sorted.length} 组预订</span>
      </div>

      {/* 发球表内容 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <div className="text-4xl mb-3">⛳</div>
          <p className="text-sm">当天暂无预订</p>
          <button onClick={() => onNewBooking(date)}
            className="mt-4 px-5 py-2 bg-emerald-600 text-white text-sm rounded-full hover:bg-emerald-700 transition-colors">
            新增预订
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(b => {
            const s = STATUS_MAP[b.status] || STATUS_MAP.pending
            const isActing = actionId === b._id
            return (
              <div key={b._id}
                className={`border rounded-xl p-4 transition-all ${s.card}`}>
                <div className="flex items-start justify-between gap-4">
                  {/* 左侧：时间 + 主要信息 */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    {/* 时间 */}
                    <div className="flex-shrink-0 text-center w-14">
                      <div className="text-xl font-bold text-gray-800 leading-none">{b.teeTime}</div>
                      <div className="text-xs text-gray-400 mt-1">{b.courseName}</div>
                    </div>
                    {/* 球员 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {b.players?.map((p, i) => (
                          <span key={i} className={`text-sm font-medium ${p.type === 'guest' ? 'text-purple-700' : 'text-gray-800'}`}>
                            {p.name}{p.type === 'guest' ? '（嘉）' : ''}
                          </span>
                        ))}
                        <span className="text-xs text-gray-400">{b.playerCount}人</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        {b.caddyName && <span>球童：{b.caddyName}</span>}
                        {b.cartNo    && <span>球车：{b.cartNo}</span>}
                        {b.totalFee > 0 && <span className="text-emerald-600 font-medium">¥{b.totalFee}</span>}
                        {b.note      && <span className="text-gray-400 truncate max-w-[160px]">备注：{b.note}</span>}
                      </div>
                    </div>
                  </div>

                  {/* 右侧：状态 + 操作 */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-2">
                    <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white/70 ${s.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                    {/* 操作按钮 */}
                    <div className="flex gap-1.5">
                      {b.status === 'confirmed' && (
                        <button disabled={isActing}
                          onClick={() => handleStatusChange(b._id, 'checkIn')}
                          className="px-2.5 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
                          签到
                        </button>
                      )}
                      {b.status === 'checked_in' && (
                        <button disabled={isActing}
                          onClick={() => handleStatusChange(b._id, 'complete')}
                          className="px-2.5 py-1 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">
                          完赛
                        </button>
                      )}
                      {(b.status === 'confirmed' || b.status === 'pending') && (
                        <button disabled={isActing}
                          onClick={() => handleStatusChange(b._id, 'cancel')}
                          className="px-2.5 py-1 text-xs bg-white text-red-400 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
                          取消
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
