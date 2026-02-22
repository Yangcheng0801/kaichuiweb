import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  BarChart3, TrendingUp, Users, Car, Download, Calendar,
  DollarSign, CreditCard, Banknote, Smartphone, Building,
  UserCircle, ChevronLeft, RefreshCw, Layers, BedDouble
} from 'lucide-react'
import { api } from '@/utils/api'

/* ========== 收款方式中文 ========== */
const METHOD_MAP: Record<string, string> = {
  cash: '现金', wechat: '微信', alipay: '支付宝',
  card: '银行卡', member_card: '会员卡', transfer: '转账', other: '其他'
}
const METHOD_COLORS: Record<string, string> = {
  cash: '#22c55e', wechat: '#10b981', alipay: '#3b82f6',
  card: '#8b5cf6', member_card: '#f59e0b', transfer: '#06b6d4', other: '#6b7280'
}

/* ========== 消费类别中文 ========== */
const CAT_MAP: Record<string, string> = {
  green_fee: '果岭费', caddy_fee: '球童费', cart_fee: '球车费',
  insurance_fee: '保险费', room_fee: '客房费', 'f&b': '餐饮',
  fb: '餐饮', retail: '零售', other: '其他'
}

const PERIOD_OPTIONS = [
  { value: 'day', label: '今日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '本年' },
]

const TABS = [
  { key: 'revenue', label: '营收报表', icon: DollarSign },
  { key: 'bookings', label: '预订分析', icon: Calendar },
  { key: 'players', label: '球员分析', icon: Users },
  { key: 'resources', label: '资源利用率', icon: Layers },
]

/* ========== 简单横条 ========== */
function HBar({ items, height = 24 }: { items: { label: string; value: number; color: string }[]; height?: number }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) return <div className="bg-secondary rounded-full" style={{ height }} />
  return (
    <div className="flex rounded-full overflow-hidden" style={{ height }}>
      {items.map((item, idx) => (
        <div key={idx} title={`${item.label}: ${item.value}`}
          className="transition-all" style={{ width: `${(item.value / total) * 100}%`, background: item.color }} />
      ))}
    </div>
  )
}

/* ========== KPI 卡片 ========== */
function KpiCard({ label, value, sub, icon: Icon, color = 'text-muted-foreground', bg = 'bg-secondary/50' }: any) {
  return (
    <div className={`${bg} rounded-xl p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color} bg-white/60`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )
}

/* ========== 简易柱图 ========== */
function SimpleBarChart({ data, labelKey, valueKey, color = '#3b82f6', maxBars = 20 }: any) {
  const sliced = data.slice(-maxBars)
  const maxVal = Math.max(...sliced.map((d: any) => d[valueKey] || 0), 1)
  return (
    <div className="flex items-end gap-1 h-40">
      {sliced.map((d: any, i: number) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t" style={{ height: `${((d[valueKey] || 0) / maxVal) * 100}%`, minHeight: 2, background: color }} 
            title={`${d[labelKey]}: ${d[valueKey]}`} />
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{(d[labelKey] || '').slice(-5)}</span>
        </div>
      ))}
    </div>
  )
}

/* ========== 主组件 ========== */
export default function Reports() {
  const [activeTab, setActiveTab] = useState('revenue')
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(false)
  const [revenueData, setRevenueData] = useState<any>(null)
  const [bookingData, setBookingData] = useState<any>(null)
  const [playerData, setPlayerData] = useState<any>(null)
  const [resourceData, setResourceData] = useState<any>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (activeTab === 'revenue') {
        const res = await api.reports.getRevenue({ period })
        setRevenueData(res.data)
      } else if (activeTab === 'bookings') {
        const res = await api.reports.getBookings({ period })
        setBookingData(res.data)
      } else if (activeTab === 'players') {
        const res = await api.reports.getPlayers()
        setPlayerData(res.data)
      } else if (activeTab === 'resources') {
        const res = await api.reports.getResources()
        setResourceData(res.data)
      }
    } catch (e: any) {
      console.error('加载报表失败:', e)
    } finally {
      setLoading(false)
    }
  }, [activeTab, period])

  useEffect(() => { loadData() }, [loadData])

  const handleExport = async (type: string) => {
    try {
      const url = `/api/reports/export?type=${type}&period=${period}`
      window.open(url, '_blank')
      toast.success('导出已开始')
    } catch {
      toast.error('导出失败')
    }
  }

  return (
    <div className="min-h-screen bg-secondary/50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="p-2 hover:bg-secondary rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <BarChart3 size={24} className="text-blue-600" />
          <h1 className="text-xl font-bold text-foreground">报表与数据分析</h1>
        </div>
        <div className="flex items-center gap-2">
          {activeTab !== 'players' && activeTab !== 'resources' && (
            <div className="flex bg-secondary rounded-lg p-0.5">
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.value}
                  className={`px-3 py-1.5 text-xs rounded-md transition-all ${period === opt.value ? 'bg-white shadow text-blue-600 font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setPeriod(opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={loadData} className="p-2 hover:bg-secondary rounded-lg" title="刷新">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {(activeTab === 'revenue' || activeTab === 'bookings') && (
            <button onClick={() => handleExport(activeTab)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
              <Download size={14} /> 导出 CSV
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-all ${activeTab === tab.key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading && <div className="text-center py-20 text-muted-foreground">加载中...</div>}

        {!loading && activeTab === 'revenue' && revenueData && <RevenuePanel data={revenueData} />}
        {!loading && activeTab === 'bookings' && bookingData && <BookingPanel data={bookingData} />}
        {!loading && activeTab === 'players' && playerData && <PlayerPanel data={playerData} />}
        {!loading && activeTab === 'resources' && resourceData && <ResourcePanel data={resourceData} />}
      </div>
    </div>
  )
}

/* ======================== 营收报表面板 ======================== */
function RevenuePanel({ data }: { data: any }) {
  const methodItems = Object.entries(data.byMethod || {}).map(([k, v]) => ({
    label: METHOD_MAP[k] || k, value: v as number, color: METHOD_COLORS[k] || '#6b7280'
  }))
  const catItems = Object.entries(data.byCategory || {}).map(([k, v]) => ({
    label: CAT_MAP[k] || k, value: v as number
  })).sort((a, b) => b.value - a.value)

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="总营收" value={`¥${Number(data.totalRevenue || 0).toLocaleString()}`} icon={DollarSign} color="text-green-600" bg="bg-green-50" />
        <KpiCard label="交易笔数" value={data.transactionCount || 0} icon={CreditCard} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard label="统计周期" value={`${data.dateRange?.start || ''} ~ ${data.dateRange?.end || ''}`} icon={Calendar} color="text-muted-foreground" bg="bg-secondary/50" />
        <KpiCard label="日均营收" value={`¥${data.dailyTrend?.length ? Math.round(data.totalRevenue / data.dailyTrend.length).toLocaleString() : 0}`} icon={TrendingUp} color="text-amber-600" bg="bg-amber-50" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 收款方式分布 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">收款方式分布</h3>
          <HBar items={methodItems} height={28} />
          <div className="mt-3 space-y-2">
            {methodItems.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
                  <span className="text-muted-foreground">{item.label}</span>
                </div>
                <span className="font-medium">¥{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 消费类别分布 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">消费类别分布</h3>
          <div className="space-y-3">
            {catItems.map((item, idx) => {
              const max = catItems[0]?.value || 1
              return (
                <div key={idx}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium">¥{item.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(item.value / max) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 趋势图 */}
      {data.dailyTrend && data.dailyTrend.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">营收趋势</h3>
          <SimpleBarChart data={data.dailyTrend} labelKey="date" valueKey="revenue" color="#3b82f6" />
        </div>
      )}
    </div>
  )
}

/* ======================== 预订分析面板 ======================== */
function BookingPanel({ data }: { data: any }) {
  const STATUS_LABELS: Record<string, string> = {
    pending: '待确认', confirmed: '已确认', checked_in: '已签到',
    playing: '打球中', completed: '已完赛', cancelled: '已取消', no_show: '未到场'
  }
  const STATUS_COLORS: Record<string, string> = {
    pending: '#eab308', confirmed: '#3b82f6', checked_in: '#10b981',
    playing: '#22c55e', completed: '#6b7280', cancelled: '#ef4444', no_show: '#f97316'
  }

  const statusItems = Object.entries(data.byStatus || {}).map(([k, v]) => ({
    label: STATUS_LABELS[k] || k, value: v as number, color: STATUS_COLORS[k] || '#6b7280'
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="总预订数" value={data.totalBookings || 0} icon={Calendar} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard label="总球员数" value={data.totalPlayers || 0} icon={Users} color="text-green-600" bg="bg-green-50" />
        <KpiCard label="平均组人数" value={data.avgGroupSize || 0} icon={UserCircle} color="text-purple-600" bg="bg-purple-50" />
        <KpiCard label="取消率" value={`${data.cancelRate || 0}%`} icon={Calendar} color="text-red-600" bg="bg-red-50" />
        <KpiCard label="No-Show率" value={`${data.noShowRate || 0}%`} icon={Calendar} color="text-orange-600" bg="bg-orange-50" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 状态分布 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">预订状态分布</h3>
          <HBar items={statusItems} height={28} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {statusItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 身份分布 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">球员身份分布</h3>
          <div className="space-y-2">
            {Object.entries(data.identityDist || {}).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium">{v} 人次</span>
              </div>
            ))}
            {Object.keys(data.identityDist || {}).length === 0 && <div className="text-muted-foreground text-sm">暂无数据</div>}
          </div>
        </div>
      </div>

      {/* 预订趋势 */}
      {data.dailyTrend && data.dailyTrend.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">预订趋势</h3>
          <SimpleBarChart data={data.dailyTrend} labelKey="date" valueKey="count" color="#10b981" />
        </div>
      )}
    </div>
  )
}

/* ======================== 球员分析面板 ======================== */
function PlayerPanel({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="总球员数" value={data.totalPlayers || 0} icon={Users} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard label="活跃球员" value={data.activePlayers || 0} icon={UserCircle} color="text-green-600" bg="bg-green-50" />
        <KpiCard label="总储值余额" value={`¥${Number(data.totalBalance || 0).toLocaleString()}`} icon={DollarSign} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard label="人均余额" value={`¥${Number(data.avgBalance || 0).toLocaleString()}`} icon={Banknote} color="text-purple-600" bg="bg-purple-50" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 会员等级分布 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">会员等级分布</h3>
          <div className="space-y-2">
            {Object.entries(data.levelDist || {}).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => {
              const total = data.totalPlayers || 1
              return (
                <div key={k}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{k === 'none' ? '非会员' : `${k}级会员`}</span>
                    <span className="font-medium">{v} ({Math.round(v / total * 100)}%)</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(v / total) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 消费排行榜 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">消费排行榜 TOP 10</h3>
          <div className="space-y-2">
            {(data.topSpenders || []).slice(0, 10).map((s: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3 text-sm">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-secondary text-muted-foreground'}`}>
                  {idx + 1}
                </span>
                <span className="flex-1 text-foreground truncate">{s.playerName || '未知'}</span>
                <span className="font-medium text-foreground">¥{Number(s.totalSpent).toLocaleString()}</span>
                <span className="text-muted-foreground text-xs">{s.visitCount}次</span>
              </div>
            ))}
            {(!data.topSpenders || data.topSpenders.length === 0) && <div className="text-muted-foreground text-sm">暂无数据</div>}
          </div>
        </div>
      </div>

      {/* 新增趋势 */}
      {data.newTrend && data.newTrend.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4">新增球员趋势（按月）</h3>
          <SimpleBarChart data={data.newTrend} labelKey="month" valueKey="count" color="#8b5cf6" />
        </div>
      )}
    </div>
  )
}

/* ======================== 资源利用率面板 ======================== */
function ResourcePanel({ data }: { data: any }) {
  const c = data.carts || {}
  const cad = data.caddies || {}
  const l = data.lockers || {}
  const r = data.rooms || {}

  function GaugeCard({ label, value, total, unit = '%', color = '#3b82f6' }: any) {
    const pct = total > 0 ? Math.round(value / total * 100) : 0
    const circumference = 2 * Math.PI * 40
    const offset = circumference - (pct / 100) * circumference
    return (
      <div className="bg-white rounded-xl p-5 shadow-sm flex flex-col items-center">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 50 50)" className="transition-all duration-700" />
          <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-lg font-bold">{pct}{unit}</text>
        </svg>
        <div className="mt-2 text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{value} / {total}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-muted-foreground text-right">统计日期: {data.date}</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <GaugeCard label="球车利用率" value={c.inUse || 0} total={c.total || 0} color="#f59e0b" />
        <GaugeCard label="球童利用率" value={cad.busy || 0} total={cad.total || 0} color="#10b981" />
        <GaugeCard label="更衣柜使用率" value={l.occupied || 0} total={l.total || 0} color="#3b82f6" />
        <GaugeCard label="客房入住率" value={r.occupied || 0} total={r.total || 0} color="#8b5cf6" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 球车详情 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Car size={16} /> 球车详情</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">总数</span><span className="font-medium">{c.total}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">可用</span><span className="font-medium text-green-600">{c.available}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">使用中</span><span className="font-medium text-blue-600">{c.inUse}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">维修</span><span className="font-medium text-orange-600">{c.maintenance}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">今日使用次数</span><span className="font-medium">{c.todayUsage}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">周转率</span><span className="font-medium">{c.turnover}次/车</span></div>
          </div>
        </div>

        {/* 客房详情 */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><BedDouble size={16} /> 客房详情</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">总房数</span><span className="font-medium">{r.total}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">入住</span><span className="font-medium text-blue-600">{r.occupied}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">OCC%</span><span className="font-medium text-purple-600">{r.occupancyRate}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">球童总数</span><span className="font-medium">{cad.total}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">球童空闲</span><span className="font-medium text-green-600">{cad.available}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">球童忙碌</span><span className="font-medium text-amber-600">{cad.busy}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
