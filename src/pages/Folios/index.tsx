import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Receipt, Search, X, ArrowLeft, ChevronRight,
  DollarSign, Clock, CheckCircle, Ban, RefreshCw,
  Eye, CreditCard
} from 'lucide-react'
import { api } from '@/utils/api'

/* ========== 类型 ========== */
interface Folio {
  _id: string
  folioNo: string
  folioType: string
  status: string
  bookingId: string | null
  playerId: string | null
  cardNo: string | null
  roomNo: string | null
  guestName: string
  guestPhone: string
  totalCharges: number
  totalPayments: number
  balance: number
  openedAt: string
  closedAt: string | null
  settledAt: string | null
  createdAt: string
}

interface FolioCharge {
  _id: string
  chargeType: string
  chargeSource: string
  description: string
  amount: number
  quantity: number
  status: string
  chargeTime: string
  voidReason: string | null
}

interface FolioPayment {
  _id: string
  amount: number
  payMethod: string
  payMethodName: string
  referenceNo: string
  paidAt: string
  status: string
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  open:    { label: '消费中', cls: 'bg-success/10 text-success' },
  settled: { label: '已结算', cls: 'bg-secondary text-muted-foreground' },
  void:    { label: '已作废', cls: 'bg-destructive/10 text-destructive border border-destructive/20' },
}

const CHARGE_LABELS: Record<string, string> = {
  green_fee: '果岭费', caddy_fee: '球童费', caddy_request_fee: '点号费', cart_fee: '球车费',
  insurance: '保险费', locker_daily: '更衣柜', room: '客房费',
  dining: '餐饮', proshop: '球具店', minibar: '迷你吧', other: '其他',
}

const FOLIO_TYPE_MAP: Record<string, string> = {
  booking: '打球', walkin: '散客', room_only: '住宿',
}

/* ========== 主组件 ========== */
export default function Folios() {
  const navigate = useNavigate()
  const [folios, setFolios] = useState<Folio[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'all'>('active')
  const [search, setSearch] = useState('')
  const [selectedFolio, setSelectedFolio] = useState<Folio | null>(null)
  const [charges, setCharges] = useState<FolioCharge[]>([])
  const [payments, setPayments] = useState<FolioPayment[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // 列表
  const fetchFolios = useCallback(async () => {
    setLoading(true)
    try {
      let res: any
      if (tab === 'active') {
        res = await api.folios.getActive()
      } else {
        res = await api.folios.getList({ pageSize: 100, ...(search ? { guestName: search } : {}) })
      }
      setFolios(res.data || [])
    } catch { /* interceptor */ }
    setLoading(false)
  }, [tab, search])

  useEffect(() => { fetchFolios() }, [fetchFolios])

  // 详情
  const openDetail = async (folio: Folio) => {
    setSelectedFolio(folio)
    setDetailLoading(true)
    try {
      const res: any = await api.folios.getDetail(folio._id)
      setCharges(res.data?.charges || [])
      setPayments(res.data?.payments || [])
      // 更新余额
      setSelectedFolio(prev => prev ? { ...prev, totalCharges: res.data?.totalCharges ?? prev.totalCharges, totalPayments: res.data?.totalPayments ?? prev.totalPayments, balance: res.data?.balance ?? prev.balance } : null)
    } catch { /* interceptor */ }
    setDetailLoading(false)
  }

  const handleVoid = async (chargeId: string) => {
    if (!selectedFolio) return
    try {
      await api.folios.voidCharge(selectedFolio._id, chargeId, { reason: '手动冲销' })
      toast.success('已冲销')
      await openDetail(selectedFolio)
    } catch { /* interceptor */ }
  }

  const handleSettle = async () => {
    if (!selectedFolio) return
    try {
      await api.folios.settle(selectedFolio._id, { force: true })
      toast.success('结算成功')
      setSelectedFolio(null)
      fetchFolios()
    } catch { /* interceptor */ }
  }

  const activeCharges = charges.filter(c => c.status === 'posted')
  const voidedCharges = charges.filter(c => c.status === 'voided')

  return (
    <div className="min-h-screen bg-page-bg p-4 sm:p-6">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/home')} className="p-2 rounded-lg hover:bg-card text-muted-foreground transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">账单管理</h1>
            <p className="text-sm text-muted-foreground">Folio 统一消费 / 挂账中心</p>
          </div>
        </div>
        <button onClick={fetchFolios} disabled={loading} className="p-2 rounded-lg hover:bg-card text-muted-foreground transition-colors disabled:opacity-50">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tab + 搜索 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex bg-card rounded-xl p-1 shadow-sm border border-border">
          <button onClick={() => setTab('active')} className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${tab === 'active' ? 'bg-success/10 text-success shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            未结算
          </button>
          <button onClick={() => setTab('all')} className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${tab === 'all' ? 'bg-success/10 text-success shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            全部
          </button>
        </div>
        {tab === 'all' && (
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索客人姓名..."
              className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {/* 列表 */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">加载中...</div>
        ) : folios.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Receipt size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{tab === 'active' ? '暂无未结算账单' : '暂无账单记录'}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {folios.map(f => {
              const st = STATUS_MAP[f.status] || { label: f.status, cls: 'bg-secondary text-muted-foreground' }
              return (
                <div key={f._id} onClick={() => openDetail(f)}
                  className="px-5 py-4 flex items-center gap-4 hover:bg-secondary/50/50 cursor-pointer transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500 flex-shrink-0">
                    <Receipt size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{f.guestName || '未知'}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                      <span className="text-[11px] text-muted-foreground">{FOLIO_TYPE_MAP[f.folioType] || f.folioType}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>#{f.folioNo}</span>
                      {f.cardNo && <span>卡号 {f.cardNo}</span>}
                      {f.openedAt && <span>{new Date(f.openedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-foreground">¥{f.totalCharges}</div>
                    {f.balance > 0 && (
                      <div className="text-xs text-orange-600 font-medium">待收 ¥{f.balance}</div>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedFolio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h2 className="font-semibold text-foreground">账单详情</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  #{selectedFolio.folioNo}
                  <span className="ml-2">{selectedFolio.guestName}</span>
                  {selectedFolio.cardNo && <span className="ml-2">卡号 {selectedFolio.cardNo}</span>}
                </p>
              </div>
              <button onClick={() => setSelectedFolio(null)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-12 text-center text-muted-foreground text-sm">加载中...</div>
            ) : (
              <div className="px-6 py-5 space-y-5">
                {/* 汇总卡片 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-secondary/50 rounded-xl p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">消费合计</div>
                    <div className="text-xl font-bold text-foreground">¥{selectedFolio.totalCharges}</div>
                  </div>
                  <div className="bg-success/10 rounded-xl p-4 text-center">
                    <div className="text-xs text-success mb-1">已付</div>
                    <div className="text-xl font-bold text-success">¥{selectedFolio.totalPayments}</div>
                  </div>
                  <div className={`rounded-xl p-4 text-center ${selectedFolio.balance > 0 ? 'bg-orange-50' : 'bg-secondary/50'}`}>
                    <div className={`text-xs mb-1 ${selectedFolio.balance > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>待收</div>
                    <div className={`text-xl font-bold ${selectedFolio.balance > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                      ¥{Math.max(0, selectedFolio.balance)}
                    </div>
                  </div>
                </div>

                {/* 消费明细 */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <DollarSign size={14} />
                    消费明细 ({activeCharges.length})
                  </h3>
                  {activeCharges.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">暂无消费记录</div>
                  ) : (
                    <div className="bg-secondary/50 rounded-xl divide-y divide-border/50 overflow-hidden">
                      {activeCharges.map(c => (
                        <div key={c._id} className="flex items-center justify-between px-4 py-3 group">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-foreground">{c.description || CHARGE_LABELS[c.chargeType] || c.chargeType}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {CHARGE_LABELS[c.chargeType] || c.chargeType}
                              {c.chargeSource ? ` · ${c.chargeSource}` : ''}
                              {c.chargeTime && ` · ${new Date(c.chargeTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">¥{c.amount}</span>
                            {selectedFolio.status === 'open' && (
                              <button onClick={() => handleVoid(c._id)}
                                className="opacity-0 group-hover:opacity-100 text-[11px] text-red-400 hover:text-red-600 transition-all px-1.5 py-0.5 rounded hover:bg-red-50">
                                冲销
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {voidedCharges.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[11px] text-muted-foreground mb-1">已冲销 ({voidedCharges.length})</div>
                      {voidedCharges.map(c => (
                        <div key={c._id} className="flex items-center justify-between px-4 py-1.5 text-xs text-muted-foreground line-through">
                          <span>{c.description || c.chargeType}</span>
                          <span>¥{c.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 支付记录 */}
                {payments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <CreditCard size={14} />
                      支付记录 ({payments.length})
                    </h3>
                    <div className="bg-success/10 rounded-xl divide-y divide-success/10 overflow-hidden">
                      {payments.map(p => (
                        <div key={p._id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <div className="text-sm text-success">{p.payMethodName || p.payMethod}</div>
                            <div className="text-[11px] text-success">
                              {p.referenceNo}
                              {p.paidAt && ` · ${new Date(p.paidAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                          </div>
                          <span className="text-sm font-medium text-success">¥{p.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            {selectedFolio.status === 'open' && (
              <div className="flex gap-3 px-6 py-4 border-t border-border sticky bottom-0 bg-card">
                <button onClick={() => setSelectedFolio(null)}
                  className="flex-1 px-4 py-2 border border-border text-muted-foreground text-sm rounded-lg hover:bg-secondary/50 transition-colors">
                  关闭
                </button>
                <button onClick={handleSettle}
                  className="flex-1 px-4 py-2.5 bg-success text-primary-foreground text-sm rounded-lg hover:bg-success/90 transition-colors font-semibold">
                  结算此账单
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
