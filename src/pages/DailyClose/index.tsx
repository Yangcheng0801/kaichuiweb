import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Moon, ChevronLeft, RefreshCw, AlertTriangle, CheckCircle,
  Clock, DollarSign, Calendar, FileText, Users, CreditCard,
  Ban, Search, ArrowRight
} from 'lucide-react'
import { api } from '@/utils/api'

/* ========== 收款方式中文 ========== */
const METHOD_MAP: Record<string, string> = {
  cash: '现金', wechat: '微信', alipay: '支付宝',
  card: '银行卡', member_card: '会员卡', transfer: '转账', other: '其他'
}

const CAT_MAP: Record<string, string> = {
  green_fee: '果岭费', caddy_fee: '球童费', cart_fee: '球车费',
  insurance_fee: '保险费', room_fee: '客房费', 'f&b': '餐饮',
  fb: '餐饮', retail: '零售', other: '其他'
}

const TABS = [
  { key: 'execute', label: '执行日结', icon: Moon },
  { key: 'report', label: '日结报告', icon: FileText },
  { key: 'history', label: '历史查询', icon: Calendar },
]

export default function DailyClose() {
  const [activeTab, setActiveTab] = useState('execute')
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [targetDate, setTargetDate] = useState(new Date().toISOString().slice(0, 10))
  const [cashDeclared, setCashDeclared] = useState('')
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [noShowProcessing, setNoShowProcessing] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [historyList, setHistoryList] = useState<any[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [selectedReport, setSelectedReport] = useState<any>(null)

  /* ========== 加载预检数据 ========== */
  const loadPreview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.dailyClose.getPreview({ date: targetDate })
      setPreviewData(res.data)
    } catch (e: any) {
      console.error('加载预检失败:', e)
    } finally {
      setLoading(false)
    }
  }, [targetDate])

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.dailyClose.getReports({ pageSize: 100 })
      setHistoryList(res.data?.list || [])
    } catch (e: any) {
      console.error('加载历史失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'execute') loadPreview()
    if (activeTab === 'history') loadHistory()
  }, [activeTab, loadPreview, loadHistory])

  /* ========== 自动 No-Show ========== */
  const handleAutoNoShow = async () => {
    if (!previewData?.noShowCandidates?.length) return
    setNoShowProcessing(true)
    try {
      const res: any = await api.dailyClose.autoNoShow({ date: targetDate })
      toast.success(res.message || '操作成功')
      loadPreview()
    } catch (e: any) {
      toast.error('No-Show 标记失败')
    } finally {
      setNoShowProcessing(false)
    }
  }

  /* ========== 执行日结 ========== */
  const handleExecute = async () => {
    if (closing) return
    setClosing(true)
    try {
      const res: any = await api.dailyClose.execute({
        date: targetDate,
        cashDeclared: cashDeclared ? Number(cashDeclared) : undefined,
        notes
      })
      toast.success(res.message || '日结完成')
      setReportData(res.data)
      setActiveTab('report')
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '日结失败')
    } finally {
      setClosing(false)
    }
  }

  /* ========== 查看历史报告详情 ========== */
  const viewReport = async (dateStr: string) => {
    try {
      const res = await api.dailyClose.getReportDetail(dateStr)
      setSelectedReport(res.data)
    } catch {
      toast.error('加载报告失败')
    }
  }

  return (
    <div className="min-h-screen bg-secondary/50 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="p-2 hover:bg-secondary rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <Moon size={24} className="text-indigo-600" />
          <h1 className="text-xl font-bold text-foreground">日结 / 夜审</h1>
        </div>
        <button onClick={() => activeTab === 'execute' ? loadPreview() : loadHistory()}
          className="p-2 hover:bg-secondary rounded-lg" title="刷新">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-card border-b px-6">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition-all ${activeTab === tab.key ? 'border-indigo-600 text-indigo-600 font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'execute' && <ExecutePanel
          data={previewData} loading={loading} targetDate={targetDate}
          setTargetDate={setTargetDate} cashDeclared={cashDeclared}
          setCashDeclared={setCashDeclared} notes={notes} setNotes={setNotes}
          onAutoNoShow={handleAutoNoShow} noShowProcessing={noShowProcessing}
          onExecute={handleExecute} closing={closing} onRefresh={loadPreview}
        />}

        {activeTab === 'report' && <ReportPanel data={reportData || selectedReport} />}

        {activeTab === 'history' && <HistoryPanel
          list={historyList} search={historySearch}
          setSearch={setHistorySearch} onView={(d: string) => { viewReport(d); setActiveTab('report') }}
        />}
      </div>
    </div>
  )
}

/* ======================== 执行日结面板 ======================== */
function ExecutePanel({ data, loading, targetDate, setTargetDate, cashDeclared, setCashDeclared,
  notes, setNotes, onAutoNoShow, noShowProcessing, onExecute, closing, onRefresh }: any) {

  if (loading) return <div className="text-center py-20 text-muted-foreground">加载预检数据...</div>
  if (!data) return <div className="text-center py-20 text-muted-foreground">暂无数据</div>

  const warnings: string[] = []
  if (data.openFolios?.count > 0) warnings.push(`${data.openFolios.count} 张未结算账单（¥${data.openFolios.balance}）`)
  if (data.noShowCandidates?.length > 0) warnings.push(`${data.noShowCandidates.length} 笔已确认未签到预订可标记 No-Show`)
  if (data.unsettledCompleted?.length > 0) warnings.push(`${data.unsettledCompleted.length} 笔已完赛但有未收款`)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 日期选择 */}
      <div className="bg-card rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">日结日期</h3>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
      </div>

      {/* 预警项 */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
            <AlertTriangle size={16} /> 夜审预警（{warnings.length} 项）
          </h3>
          <ul className="space-y-2">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-0.5">-</span> {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No-Show 处理 */}
      {data.noShowCandidates?.length > 0 && (
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Ban size={16} className="text-orange-500" /> 自动 No-Show
            </h3>
            <button onClick={onAutoNoShow} disabled={noShowProcessing}
              className="px-3 py-1.5 bg-orange-600 text-primary-foreground rounded-lg text-xs hover:bg-orange-700 disabled:opacity-50">
              {noShowProcessing ? '处理中...' : `标记 ${data.noShowCandidates.length} 笔 No-Show`}
            </button>
          </div>
          <div className="space-y-1 max-h-40 overflow-auto">
            {data.noShowCandidates.map((b: any) => (
              <div key={b._id} className="flex items-center justify-between text-sm py-1 border-b border-border/50">
                <span className="text-muted-foreground">{b.orderNo}</span>
                <span className="text-foreground">{b.playerName}</span>
                <span className="text-muted-foreground">{b.teeTime}</span>
                <span className="text-muted-foreground">{b.playerCount}人</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 收款汇总 */}
      <div className="bg-card rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <DollarSign size={16} className="text-green-600" /> 当日收款汇总
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {Object.entries(data.paymentSummary || {}).map(([method, amount]: any) => (
            <div key={method} className="bg-secondary/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">{METHOD_MAP[method] || method}</div>
              <div className="text-lg font-bold text-foreground">¥{Number(amount).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm font-medium text-foreground">收款合计</span>
          <span className="text-xl font-bold text-green-600">¥{Number(data.totalCollected || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* 消费汇总 */}
      <div className="bg-card rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <CreditCard size={16} className="text-blue-600" /> 当日消费汇总
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {Object.entries(data.chargeSummary || {}).map(([cat, amount]: any) => (
            <div key={cat} className="bg-secondary/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">{CAT_MAP[cat] || cat}</div>
              <div className="text-lg font-bold text-foreground">¥{Number(amount).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm font-medium text-foreground">消费合计</span>
          <span className="text-xl font-bold text-blue-600">¥{Number(data.totalCharged || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* 预订统计 */}
      <div className="bg-card rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users size={16} className="text-purple-600" /> 预订统计
        </h3>
        <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-center">
          {[
            { k: 'total', l: '总预订', c: 'text-foreground' },
            { k: 'confirmed', l: '已确认', c: 'text-blue-600' },
            { k: 'checkedIn', l: '已签到', c: 'text-success' },
            { k: 'playing', l: '打球中', c: 'text-green-600' },
            { k: 'completed', l: '已完赛', c: 'text-muted-foreground' },
            { k: 'cancelled', l: '已取消', c: 'text-red-600' },
            { k: 'noShow', l: 'No-Show', c: 'text-orange-600' },
          ].map(s => (
            <div key={s.k} className="bg-secondary/50 rounded-lg p-2">
              <div className="text-xs text-muted-foreground">{s.l}</div>
              <div className={`text-lg font-bold ${s.c}`}>{data.bookingStats?.[s.k] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 交班信息 */}
      <div className="bg-card rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-foreground">交班信息</h3>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">实点现金金额</label>
          <input type="number" value={cashDeclared} onChange={e => setCashDeclared(e.target.value)}
            placeholder="输入实际清点现金金额" className="w-full border rounded-lg px-3 py-2 text-sm" />
          {cashDeclared && data.paymentSummary?.cash !== undefined && (
            <div className={`text-xs mt-1 ${Number(cashDeclared) - (data.paymentSummary.cash || 0) === 0 ? 'text-green-600' : 'text-red-600'}`}>
              差额: ¥{(Number(cashDeclared) - (data.paymentSummary.cash || 0)).toFixed(2)}
              {Number(cashDeclared) - (data.paymentSummary.cash || 0) === 0 ? ' (无差异)' : ''}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">备注</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="日结备注（可选）" className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none" />
        </div>
      </div>

      {/* 执行按钮 */}
      <div className="flex justify-center">
        <button onClick={onExecute} disabled={closing}
          className="px-8 py-3 bg-indigo-600 text-primary-foreground rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-lg">
          {closing ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle size={16} />}
          {closing ? '正在日结...' : `确认完成 ${targetDate} 日结`}
        </button>
      </div>
    </div>
  )
}

/* ======================== 日结报告面板 ======================== */
function ReportPanel({ data }: { data: any }) {
  if (!data) return (
    <div className="text-center py-20 text-muted-foreground">
      <FileText size={48} className="mx-auto mb-3 opacity-30" />
      <p>请先执行日结或从历史查询中选择报告</p>
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 报告头 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-primary-foreground">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm opacity-80">日结报告</div>
            <div className="text-2xl font-bold mt-1">{data.date}</div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-80">当日营收</div>
            <div className="text-2xl font-bold mt-1">¥{Number(data.totalCollected || 0).toLocaleString()}</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 text-sm opacity-80">
          <span>操作人: {data.operatorName || '系统'}</span>
          <span>日结时间: {data.closedAt ? new Date(data.closedAt).toLocaleString('zh-CN') : '-'}</span>
        </div>
      </div>

      {/* KPI 行 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 shadow-sm text-center">
          <div className="text-xs text-muted-foreground">总预订</div>
          <div className="text-2xl font-bold text-foreground">{data.bookingStats?.total || 0}</div>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm text-center">
          <div className="text-xs text-muted-foreground">完赛</div>
          <div className="text-2xl font-bold text-green-600">{data.bookingStats?.completed || 0}</div>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm text-center">
          <div className="text-xs text-muted-foreground">交易笔数</div>
          <div className="text-2xl font-bold text-blue-600">{data.transactionCount || 0}</div>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-sm text-center">
          <div className="text-xs text-muted-foreground">总消费额</div>
          <div className="text-2xl font-bold text-amber-600">¥{Number(data.totalCharged || 0).toLocaleString()}</div>
        </div>
      </div>

      {/* 收款明细 */}
      <div className="bg-card rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">收款明细</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground text-left">
            <th className="py-2">收款方式</th><th className="py-2 text-right">金额</th>
          </tr></thead>
          <tbody>
            {Object.entries(data.paymentSummary || {}).map(([k, v]: any) => (
              <tr key={k} className="border-b border-border/50">
                <td className="py-2 text-foreground">{METHOD_MAP[k] || k}</td>
                <td className="py-2 text-right font-medium">¥{Number(v).toLocaleString()}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="py-2">合计</td>
              <td className="py-2 text-right text-green-600">¥{Number(data.totalCollected || 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        {data.cashDeclared !== null && data.cashDeclared !== undefined && (
          <div className={`mt-3 text-sm ${data.cashDiff === 0 ? 'text-green-600' : 'text-red-600'}`}>
            实点现金: ¥{data.cashDeclared} | 差额: ¥{data.cashDiff} {data.cashDiff === 0 ? '(无差异)' : ''}
          </div>
        )}
      </div>

      {/* 消费分类 */}
      <div className="bg-card rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">消费分类</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground text-left">
            <th className="py-2">类别</th><th className="py-2 text-right">金额</th>
          </tr></thead>
          <tbody>
            {Object.entries(data.chargeSummary || {}).map(([k, v]: any) => (
              <tr key={k} className="border-b border-border/50">
                <td className="py-2 text-foreground">{CAT_MAP[k] || k}</td>
                <td className="py-2 text-right font-medium">¥{Number(v).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 未结算 */}
      {data.openFolios && data.openFolios.count > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <AlertTriangle size={16} /> 未结算账单
          </h3>
          <p className="text-sm text-amber-700 mt-1">
            {data.openFolios.count} 张，余额 ¥{data.openFolios.balance}
          </p>
        </div>
      )}

      {data.notes && (
        <div className="bg-card rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-2">备注</h3>
          <p className="text-sm text-muted-foreground">{data.notes}</p>
        </div>
      )}
    </div>
  )
}

/* ======================== 历史查询面板 ======================== */
function HistoryPanel({ list, search, setSearch, onView }: any) {
  const filtered = list.filter((r: any) =>
    !search || r.date?.includes(search) || r.operatorName?.includes(search)
  )

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* 搜索 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索日期或操作人..." className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>

      {/* 列表 */}
      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">暂无日结记录</div>
      )}

      <div className="space-y-3">
        {filtered.map((report: any) => (
          <div key={report._id || report.date} className="bg-card rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onView(report.date)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <FileText size={18} className="text-indigo-600" />
                </div>
                <div>
                  <div className="font-medium text-foreground">{report.date}</div>
                  <div className="text-xs text-muted-foreground">
                    {report.operatorName || '系统'} | {report.closedAt ? new Date(report.closedAt).toLocaleTimeString('zh-CN') : '-'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-bold text-green-600">¥{Number(report.totalCollected || 0).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{report.transactionCount || 0} 笔</div>
                </div>
                <ArrowRight size={16} className="text-muted-foreground" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
