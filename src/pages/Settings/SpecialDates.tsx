/**
 * 特殊日期管理页面 (Special Dates / Calendar)
 *
 * 功能：
 *   - 月历视图：显示当月每天的类型标记（颜色区分平日/周末/假日/封场）
 *   - 单击日期标记/编辑特殊日期
 *   - 法定假日一键导入（内置中国法定假日模板）
 *   - 赛事/会员日标记
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, X, Download, CalendarDays } from 'lucide-react'
import { api } from '@/utils/api'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface SpecialDate {
  _id: string
  clubId: string
  date: string
  dateType: string
  dateName: string
  pricingOverride: string
  isClosed: boolean
  closedReason: string
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DATE_TYPES = [
  { key: 'holiday',     label: '节假日', color: 'bg-red-100 text-red-700 border-red-200' },
  { key: 'member_day',  label: '会员日', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'tournament',  label: '赛事日', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'closed',      label: '封场日', color: 'bg-secondary text-muted-foreground border-border' },
]

const DATE_TYPE_MAP: Record<string, { label: string; bgClass: string; dotClass: string }> = {
  holiday:    { label: '假', bgClass: 'bg-red-50',    dotClass: 'bg-red-500' },
  member_day: { label: '会', bgClass: 'bg-purple-50', dotClass: 'bg-purple-500' },
  tournament: { label: '赛', bgClass: 'bg-blue-50',   dotClass: 'bg-blue-500' },
  closed:     { label: '封', bgClass: 'bg-secondary',  dotClass: 'bg-secondary/500' },
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startDow = (firstDay.getDay() + 6) % 7 // Mon=0
  const totalDays = lastDay.getDate()

  const days: { date: string; day: number; inMonth: boolean }[] = []
  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i)
    days.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), inMonth: false })
  }
  // Current month
  for (let d = 1; d <= totalDays; d++) {
    const dt = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ date: dt, day: d, inMonth: true })
  }
  // Next month padding
  while (days.length % 7 !== 0) {
    const last = new Date(days[days.length - 1].date)
    last.setDate(last.getDate() + 1)
    days.push({ date: last.toISOString().slice(0, 10), day: last.getDate(), inMonth: false })
  }
  return days
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function SpecialDates() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [specialDates, setSpecialDates] = useState<SpecialDate[]>([])
  const [loading, setLoading] = useState(true)

  // Edit form
  const [editDate, setEditDate] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<SpecialDate>>({})
  const [saving, setSaving] = useState(false)
  const [importLoading, setImportLoading] = useState(false)

  const loadDates = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await api.specialDates.getList({ year, month })
      setSpecialDates(res.data || [])
    } catch {} finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { loadDates() }, [loadDates])

  const dateMap = new Map<string, SpecialDate>()
  for (const sd of specialDates) {
    dateMap.set(sd.date, sd)
  }

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // ── 点击日期 ──
  const handleDayClick = (dateStr: string) => {
    const existing = dateMap.get(dateStr)
    setEditDate(dateStr)
    if (existing) {
      setEditData({ ...existing })
    } else {
      setEditData({ date: dateStr, dateType: 'holiday', dateName: '', isClosed: false, closedReason: '' })
    }
  }

  const handleSave = async () => {
    if (!editDate || !editData.dateType) return
    setSaving(true)
    try {
      const existing = dateMap.get(editDate)
      if (existing?._id) {
        await api.specialDates.update(existing._id, editData)
      } else {
        await api.specialDates.create({ ...editData, date: editDate })
      }
      toast.success('保存成功')
      setEditDate(null)
      loadDates()
    } catch {} finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editDate) return
    const existing = dateMap.get(editDate)
    if (!existing?._id) { setEditDate(null); return }
    try {
      await api.specialDates.remove(existing._id)
      toast.success('已删除')
      setEditDate(null)
      loadDates()
    } catch {}
  }

  // ── 导入法定假日 ──
  const handleImportHolidays = async () => {
    setImportLoading(true)
    try {
      // 获取模板
      const tplRes: any = await api.specialDates.getHolidays(year)
      const dates = tplRes.data || []
      if (dates.length === 0) { toast.error('未获取到假日模板'); return }
      // 批量导入
      const batchRes: any = await api.specialDates.batch({ dates })
      toast.success(batchRes.message || '导入成功')
      loadDates()
    } catch {} finally {
      setImportLoading(false)
    }
  }

  const days = getMonthDays(year, month)
  const todayStr = now.toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">日历管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">标记节假日、会员日、赛事日和封场日，影响自动定价</p>
        </div>
        <button
          onClick={handleImportHolidays}
          disabled={importLoading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-success text-white rounded-lg hover:bg-success/90 font-medium disabled:opacity-50"
        >
          <Download size={14} />
          {importLoading ? '导入中...' : `导入${year}年法定假日`}
        </button>
      </div>

      {/* 图例 */}
      <div className="flex gap-4 flex-wrap">
        {DATE_TYPES.map(dt => (
          <div key={dt.key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${DATE_TYPE_MAP[dt.key]?.dotClass}`} />
            <span className="text-xs text-muted-foreground">{dt.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <span className="text-xs text-muted-foreground">周末</span>
        </div>
      </div>

      {/* 月导航 */}
      <div className="flex items-center gap-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-secondary"><ChevronLeft size={18} /></button>
        <span className="text-base font-semibold text-foreground">{year}年{month}月</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-secondary"><ChevronRight size={18} /></button>
      </div>

      {/* 日历网格 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* 星期头 */}
          <div className="grid grid-cols-7 bg-secondary/50">
            {WEEKDAYS.map(w => (
              <div key={w} className="py-2 text-center text-xs font-semibold text-muted-foreground">{w}</div>
            ))}
          </div>
          {/* 日期 */}
          <div className="grid grid-cols-7">
            {days.map(({ date, day, inMonth }) => {
              const sd = dateMap.get(date)
              const isToday = date === todayStr
              const dow = new Date(date + 'T12:00:00').getDay()
              const isWeekend = dow === 0 || dow === 6
              const typeInfo = sd ? DATE_TYPE_MAP[sd.dateType] : null

              return (
                <button
                  key={date}
                  onClick={() => inMonth && handleDayClick(date)}
                  disabled={!inMonth}
                  className={`relative h-20 p-1.5 border-b border-r border-border text-left transition-all
                    ${!inMonth ? 'opacity-30 cursor-default' : 'hover:bg-success/10 cursor-pointer'}
                    ${isToday ? 'ring-2 ring-ring ring-inset' : ''}
                    ${typeInfo ? typeInfo.bgClass : isWeekend ? 'bg-amber-50/50' : ''}
                  `}
                >
                  <div className="flex items-center gap-1">
                    <span className={`text-sm font-medium ${isToday ? 'text-success' : !inMonth ? 'text-muted-foreground' : isWeekend ? 'text-amber-600' : 'text-foreground'}`}>
                      {day}
                    </span>
                    {typeInfo && (
                      <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white ${typeInfo.dotClass}`}>
                        {typeInfo.label}
                      </span>
                    )}
                  </div>
                  {sd && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{sd.dateName}</div>
                  )}
                  {sd?.isClosed && (
                    <div className="text-[10px] text-red-500 font-medium">封场</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <CalendarDays size={18} className="text-success" />
                {editDate}
              </h2>
              <button onClick={() => setEditDate(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">日期类型</label>
                <div className="grid grid-cols-2 gap-2">
                  {DATE_TYPES.map(dt => (
                    <button
                      key={dt.key}
                      onClick={() => setEditData(p => ({ ...p, dateType: dt.key, pricingOverride: dt.key === 'closed' ? 'weekday' : dt.key }))}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${editData.dateType === dt.key ? dt.color + ' ring-2 ring-offset-1' : 'border-border text-muted-foreground hover:bg-secondary/50'}`}
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">名称</label>
                <input value={editData.dateName || ''} onChange={e => setEditData(p => ({ ...p, dateName: e.target.value }))} placeholder="如：劳动节" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editData.isClosed || false} onChange={e => setEditData(p => ({ ...p, isClosed: e.target.checked }))} className="w-4 h-4 rounded text-success focus:ring-ring" />
                  <span className="text-sm text-foreground">封场</span>
                </label>
              </div>
              {editData.isClosed && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">封场原因</label>
                  <input value={editData.closedReason || ''} onChange={e => setEditData(p => ({ ...p, closedReason: e.target.value }))} placeholder="如：草坪维护" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              {dateMap.has(editDate) ? (
                <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600">删除标记</button>
              ) : <span />}
              <div className="flex gap-3">
                <button onClick={() => setEditDate(null)} className="px-4 py-2 text-sm text-muted-foreground">取消</button>
                <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-success text-white text-sm rounded-lg hover:bg-success/90 disabled:opacity-50 font-medium">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
