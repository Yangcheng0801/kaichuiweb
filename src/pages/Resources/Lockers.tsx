import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, X, Wrench, Unlock, Key, FileText, Clock, RefreshCw, AlertTriangle } from 'lucide-react'
import { api } from '@/utils/api'

/* ========== 类型 ========== */
interface Locker {
  _id: string
  lockerNo: string
  area: string
  size: string
  status: string
  currentBookingId: string | null
  currentPlayerName: string | null
  dailyFee: number
  rentalType?: string
  keyInfo?: { keyType: string; keyNo: string; issuedTo: string | null; issuedAt: string | null; returnedAt: string | null }
  currentContract?: { contractId: string; tenantId: string; tenantName: string; startDate: string; endDate: string; monthlyFee: number } | null
}

interface Contract {
  _id: string; contractNo: string; lockerId: string; lockerNo: string
  tenantId: string; tenantName: string; tenantPhone: string
  rentalType: string; startDate: string; endDate: string; fee: number
  paymentStatus: string; status: string; createdAt: string
}

interface UsageLog {
  _id: string; lockerNo: string; action: string; playerName: string
  keyNo: string; note: string; actionTime: string
}

interface Stats { total: number; available: number; occupied: number; maintenance: number; retired: number }

const SIZE_MAP: Record<string, string> = { standard: '标准', large: '大号', vip: 'VIP' }

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  available:   { bg: 'bg-emerald-50',  border: 'border-emerald-300', text: 'text-emerald-700', label: '可用' },
  occupied:    { bg: 'bg-red-50',      border: 'border-red-300',     text: 'text-red-600',     label: '占用' },
  maintenance: { bg: 'bg-gray-100',    border: 'border-gray-300',    text: 'text-gray-500',    label: '维护' },
  retired:     { bg: 'bg-gray-50',     border: 'border-gray-200',    text: 'text-gray-400',    label: '停用' },
}

const RENTAL_TYPE_MAP: Record<string, string> = { daily: '日租', monthly: '月租', annual: '年租', vip: 'VIP专属' }
const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  active:          { label: '生效中', cls: 'bg-emerald-100 text-emerald-700' },
  expired:         { label: '已到期', cls: 'bg-gray-100 text-gray-600' },
  terminated:      { label: '已终止', cls: 'bg-red-100 text-red-600' },
  pending_renewal: { label: '待续费', cls: 'bg-orange-100 text-orange-700' },
}
const ACTION_MAP: Record<string, string> = {
  key_issued: '发放钥匙', key_returned: '回收钥匙',
  check_out: '取用更衣柜', check_in: '归还更衣柜',
  contract_created: '创建合同', contract_terminated: '终止合同',
}

/* ========== 主组件 ========== */
export default function Lockers() {
  const [tab, setTab] = useState<'grid' | 'contracts' | 'keys' | 'logs'>('grid')
  const [lockers, setLockers] = useState<Locker[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [filterArea, setFilterArea] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 合同
  const [contracts, setContracts] = useState<Contract[]>([])
  const [expiring, setExpiring] = useState<Contract[]>([])
  const [showNewContract, setShowNewContract] = useState(false)

  // 钥匙
  const [selectedLocker, setSelectedLocker] = useState<Locker | null>(null)
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [keyAction, setKeyAction] = useState<'issue' | 'return'>('issue')

  // 使用记录
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([])
  const [logLockerId, setLogLockerId] = useState('')

  // 新增表单
  const [formMode, setFormMode] = useState<'single' | 'batch'>('single')
  const [formLockerNo, setFormLockerNo] = useState('')
  const [formArea, setFormArea] = useState('')
  const [formSize, setFormSize] = useState('standard')
  const [formFee, setFormFee] = useState('0')
  const [batchPrefix, setBatchPrefix] = useState('')
  const [batchStart, setBatchStart] = useState('1')
  const [batchEnd, setBatchEnd] = useState('10')
  const [batchArea, setBatchArea] = useState('')

  // 合同表单
  const [cfLockerId, setCfLockerId] = useState('')
  const [cfLockerNo, setCfLockerNo] = useState('')
  const [cfTenantName, setCfTenantName] = useState('')
  const [cfTenantPhone, setCfTenantPhone] = useState('')
  const [cfRentalType, setCfRentalType] = useState('annual')
  const [cfStartDate, setCfStartDate] = useState('')
  const [cfEndDate, setCfEndDate] = useState('')
  const [cfFee, setCfFee] = useState('0')

  // 钥匙表单
  const [keyType, setKeyType] = useState('physical_key')
  const [keyNo, setKeyNo] = useState('')

  /* ---------- 数据加载 ---------- */
  const loadLockers = async () => {
    setLoading(true)
    try {
      const params: any = { pageSize: 200 }
      if (filterStatus) params.status = filterStatus
      if (filterArea) params.area = filterArea
      const [listRes, statsRes] = await Promise.all([
        api.lockers.getList(params), api.lockers.getStats(),
      ])
      setLockers((listRes as any).data || [])
      setStats((statsRes as any).data || null)
    } catch { toast.error('加载失败') }
    setLoading(false)
  }

  const loadContracts = async () => {
    try {
      const [listRes, expRes] = await Promise.all([
        api.lockerContracts.getList(), api.lockerContracts.getExpiring(),
      ])
      setContracts((listRes as any).data || [])
      setExpiring((expRes as any).data || [])
    } catch { /* */ }
  }

  const loadUsageLogs = async (lockerId?: string) => {
    if (!lockerId) return
    try {
      const res: any = await api.lockers.getUsageLogs(lockerId)
      setUsageLogs(res.data || [])
    } catch { /* */ }
  }

  useEffect(() => { loadLockers() }, [filterArea, filterStatus])
  useEffect(() => { if (tab === 'contracts') loadContracts() }, [tab])

  const areas = [...new Set(lockers.map(l => l.area).filter(Boolean))]

  /* ---------- 操作 ---------- */
  const handleCreate = async () => {
    if (formMode === 'single') {
      if (!formLockerNo.trim()) { toast.error('编号不能为空'); return }
      try {
        await api.lockers.create({ lockerNo: formLockerNo.trim(), area: formArea, size: formSize, dailyFee: Number(formFee) })
        toast.success('创建成功'); setShowAdd(false); setFormLockerNo(''); loadLockers()
      } catch { /* */ }
    } else {
      const start = parseInt(batchStart), end = parseInt(batchEnd)
      if (isNaN(start) || isNaN(end) || end < start) { toast.error('请输入有效的起止编号'); return }
      const batch = []
      for (let i = start; i <= end; i++) batch.push({ lockerNo: `${batchPrefix}${String(i).padStart(3, '0')}`, area: batchArea, size: formSize, dailyFee: Number(formFee) })
      try {
        await api.lockers.create({ batch })
        toast.success(`批量创建 ${batch.length} 个更衣柜成功`); setShowAdd(false); loadLockers()
      } catch { /* */ }
    }
  }

  const handleStatusChange = async (locker: Locker, newStatus: string) => {
    try {
      const data: any = { status: newStatus }
      if (newStatus === 'available') { data.currentBookingId = null; data.currentPlayerName = null }
      await api.lockers.update(locker._id, data)
      toast.success(`更衣柜 ${locker.lockerNo} 已${newStatus === 'maintenance' ? '设为维护' : '释放'}`)
      loadLockers()
    } catch { /* */ }
  }

  const handleDelete = async (locker: Locker) => {
    if (locker.status === 'occupied') { toast.error('占用中不能删除'); return }
    if (!confirm(`确定删除 ${locker.lockerNo}？`)) return
    try { await api.lockers.remove(locker._id); toast.success('已删除'); loadLockers() } catch { /* */ }
  }

  const handleCreateContract = async () => {
    if (!cfLockerId || !cfTenantName.trim()) { toast.error('请填写必要信息'); return }
    try {
      await api.lockerContracts.create({
        lockerId: cfLockerId, lockerNo: cfLockerNo,
        tenantName: cfTenantName.trim(), tenantPhone: cfTenantPhone,
        rentalType: cfRentalType, startDate: cfStartDate, endDate: cfEndDate, fee: Number(cfFee),
      })
      toast.success('合同创建成功'); setShowNewContract(false)
      loadContracts(); loadLockers()
    } catch { /* */ }
  }

  const handleTerminateContract = async (c: Contract) => {
    if (!confirm(`确定终止合同 ${c.contractNo}？更衣柜将被释放`)) return
    try { await api.lockerContracts.terminate(c._id); toast.success('已终止'); loadContracts(); loadLockers() } catch { /* */ }
  }

  const handleIssueKey = async () => {
    if (!selectedLocker || !keyNo.trim()) { toast.error('请填写钥匙编号'); return }
    try {
      await api.lockers.issueKey(selectedLocker._id, {
        keyType, keyNo: keyNo.trim(), lockerNo: selectedLocker.lockerNo,
        issuedTo: selectedLocker.currentContract?.tenantId || null,
        playerName: selectedLocker.currentPlayerName || selectedLocker.currentContract?.tenantName || '',
      })
      toast.success('钥匙已发放'); setShowKeyDialog(false); setKeyNo(''); loadLockers()
    } catch { /* */ }
  }

  const handleReturnKey = async () => {
    if (!selectedLocker) return
    try {
      await api.lockers.returnKey(selectedLocker._id, { lockerNo: selectedLocker.lockerNo })
      toast.success('钥匙已回收'); setShowKeyDialog(false); loadLockers()
    } catch { /* */ }
  }

  // 按区域分组
  const grouped = lockers.reduce<Record<string, Locker[]>>((acc, l) => {
    const key = l.area || '未分区'
    if (!acc[key]) acc[key] = []
    acc[key].push(l)
    return acc
  }, {})

  /* ========== 渲染 ========== */
  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: '总数', value: stats.total, color: 'text-gray-800' },
            { label: '可用', value: stats.available, color: 'text-emerald-600' },
            { label: '占用', value: stats.occupied, color: 'text-red-600' },
            { label: '维护', value: stats.maintenance, color: 'text-gray-500' },
            { label: '停用', value: stats.retired, color: 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
        {[
          { key: 'grid' as const, label: '柜位总览' },
          { key: 'contracts' as const, label: '合同管理' },
          { key: 'keys' as const, label: '钥匙管理' },
          { key: 'logs' as const, label: '使用记录' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${tab === t.key ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ======== Tab: 柜位总览 ======== */}
      {tab === 'grid' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">全部区域</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">全部状态</option>
              <option value="available">可用</option>
              <option value="occupied">占用</option>
              <option value="maintenance">维护</option>
            </select>
            <div className="ml-auto flex items-center gap-2 text-[11px] text-gray-400">
              <span className="inline-block w-3 h-3 bg-emerald-300 rounded-sm border border-emerald-400" /> 日租
              <span className="inline-block w-3 h-3 bg-amber-300 rounded-sm border border-amber-400 ml-2" /> 长租
            </div>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
              <Plus size={15} /> 新增
            </button>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">加载中...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-16 text-gray-300"><p className="text-sm">暂无更衣柜</p></div>
          ) : (
            Object.entries(grouped).map(([area, items]) => (
              <div key={area}>
                <h4 className="text-sm font-medium text-gray-600 mb-2">{area} <span className="text-gray-400">({items.length})</span></h4>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                  {items.sort((a, b) => a.lockerNo.localeCompare(b.lockerNo)).map(l => {
                    const sc = STATUS_COLORS[l.status] || STATUS_COLORS.available
                    const isLongTerm = l.rentalType === 'monthly' || l.rentalType === 'annual' || l.rentalType === 'vip'
                    return (
                      <div key={l._id} className="group relative"
                        onClick={() => { setSelectedLocker(l); setTab('logs'); setLogLockerId(l._id); loadUsageLogs(l._id) }}>
                        <div className={`${sc.bg} ${isLongTerm ? 'border-amber-400' : sc.border} border-2 rounded-lg p-2 text-center cursor-pointer transition-all hover:shadow-md`}>
                          <div className={`text-xs font-bold ${sc.text}`}>{l.lockerNo}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{sc.label}</div>
                          {l.currentPlayerName && <div className="text-[10px] text-gray-500 mt-0.5 truncate">{l.currentPlayerName}</div>}
                          {l.currentContract?.tenantName && !l.currentPlayerName && <div className="text-[10px] text-amber-600 mt-0.5 truncate">{l.currentContract.tenantName}</div>}
                          {l.keyInfo?.keyNo && !l.keyInfo.returnedAt && <Key size={8} className="absolute top-1 right-1 text-amber-500" />}
                        </div>
                        <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5 z-10">
                          {l.status === 'available' && (
                            <button onClick={e => { e.stopPropagation(); handleStatusChange(l, 'maintenance') }} title="维护"
                              className="w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center text-[10px] hover:bg-gray-700">
                              <Wrench size={10} />
                            </button>
                          )}
                          {(l.status === 'occupied' || l.status === 'maintenance') && (
                            <button onClick={e => { e.stopPropagation(); handleStatusChange(l, 'available') }} title="释放"
                              className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] hover:bg-emerald-700">
                              <Unlock size={10} />
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); setSelectedLocker(l); setKeyAction('issue'); setShowKeyDialog(true) }} title="钥匙"
                            className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] hover:bg-amber-600">
                            <Key size={10} />
                          </button>
                          {l.status !== 'occupied' && (
                            <button onClick={e => { e.stopPropagation(); handleDelete(l) }} title="删除"
                              className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] hover:bg-red-600">
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* ======== Tab: 合同管理 ======== */}
      {tab === 'contracts' && (
        <>
          {/* 到期预警 */}
          {expiring.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-700 mb-2">
                <AlertTriangle size={16} /> 30天内到期合同 ({expiring.length})
              </div>
              <div className="space-y-1">
                {expiring.slice(0, 5).map(c => (
                  <div key={c._id} className="flex items-center justify-between text-sm">
                    <span className="text-orange-800">{c.lockerNo} - {c.tenantName}</span>
                    <span className="text-orange-600">到期 {c.endDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">租赁合同列表</h3>
            <button onClick={() => { setShowNewContract(true); setCfStartDate(new Date().toISOString().slice(0, 10)) }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
              <Plus size={15} /> 新建合同
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {contracts.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">暂无合同</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {contracts.map(c => {
                  const st = CONTRACT_STATUS[c.status] || { label: c.status, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={c._id} className="px-5 py-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 flex-shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{c.lockerNo}</span>
                          <span className="text-sm text-gray-600">{c.tenantName}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                          <span className="text-[11px] text-gray-400">{RENTAL_TYPE_MAP[c.rentalType] || c.rentalType}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          #{c.contractNo} · {c.startDate} 至 {c.endDate} · ¥{c.fee}
                        </div>
                      </div>
                      {c.status === 'active' && (
                        <button onClick={() => handleTerminateContract(c)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">
                          终止
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ======== Tab: 钥匙管理 ======== */}
      {tab === 'keys' && (
        <>
          <h3 className="text-sm font-semibold text-gray-700">钥匙/手环发放状态</h3>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {lockers.filter(l => l.keyInfo?.keyNo).map(l => (
                <div key={l._id} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
                    <Key size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{l.lockerNo} - {l.keyInfo!.keyNo}</div>
                    <div className="text-xs text-gray-400">
                      {l.keyInfo!.keyType === 'wristband' ? '手环' : l.keyInfo!.keyType === 'card' ? '门禁卡' : '钥匙'}
                      {l.keyInfo!.returnedAt ? ' · 已归还' : ' · 使用中'}
                      {l.currentPlayerName && ` · ${l.currentPlayerName}`}
                    </div>
                  </div>
                  {!l.keyInfo!.returnedAt ? (
                    <button onClick={() => { setSelectedLocker(l); setKeyAction('return'); setShowKeyDialog(true) }}
                      className="text-xs text-orange-600 hover:text-orange-800 px-2 py-1 rounded hover:bg-orange-50">
                      回收
                    </button>
                  ) : (
                    <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">已归还</span>
                  )}
                </div>
              ))}
              {lockers.filter(l => l.keyInfo?.keyNo).length === 0 && (
                <div className="p-12 text-center text-gray-400 text-sm">暂无钥匙发放记录</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ======== Tab: 使用记录 ======== */}
      {tab === 'logs' && (
        <>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-700">使用记录</h3>
            {selectedLocker && (
              <span className="text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                {selectedLocker.lockerNo}
              </span>
            )}
            <select value={logLockerId} onChange={e => { setLogLockerId(e.target.value); loadUsageLogs(e.target.value) }}
              className="ml-auto px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">选择更衣柜</option>
              {lockers.map(l => <option key={l._id} value={l._id}>{l.lockerNo}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {usageLogs.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">{logLockerId ? '暂无记录' : '请选择更衣柜查看使用记录'}</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {usageLogs.map(log => (
                  <div key={log._id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                      <Clock size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-700">{ACTION_MAP[log.action] || log.action}</div>
                      <div className="text-xs text-gray-400">{log.note}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {log.playerName && <div className="text-xs text-gray-600">{log.playerName}</div>}
                      <div className="text-[11px] text-gray-400">
                        {log.actionTime ? new Date(log.actionTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ======== 新增更衣柜弹窗 ======== */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">新增更衣柜</h2>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setFormMode('single')} className={`flex-1 py-2 text-sm rounded-lg border transition-all ${formMode === 'single' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium' : 'border-gray-200 text-gray-500'}`}>单个创建</button>
                <button onClick={() => setFormMode('batch')} className={`flex-1 py-2 text-sm rounded-lg border transition-all ${formMode === 'batch' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium' : 'border-gray-200 text-gray-500'}`}>批量创建</button>
              </div>
              {formMode === 'single' ? (
                <>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">编号</label><input value={formLockerNo} onChange={e => setFormLockerNo(e.target.value)} placeholder="如：A-101" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">区域</label><input value={formArea} onChange={e => setFormArea(e.target.value)} placeholder="如：A区" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                </>
              ) : (
                <>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">编号前缀</label><input value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)} placeholder="如：A-" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">起始</label><input type="number" value={batchStart} onChange={e => setBatchStart(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">结束</label><input type="number" value={batchEnd} onChange={e => setBatchEnd(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                  </div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">区域</label><input value={batchArea} onChange={e => setBatchArea(e.target.value)} placeholder="如：A区" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">规格</label><select value={formSize} onChange={e => setFormSize(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">{Object.entries(SIZE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">日租金</label><input type="number" value={formFee} onChange={e => setFormFee(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreate} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">确认创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== 新建合同弹窗 ======== */}
      {showNewContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">新建租赁合同</h2>
              <button onClick={() => setShowNewContract(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">选择更衣柜</label>
                <select value={cfLockerId} onChange={e => { setCfLockerId(e.target.value); const l = lockers.find(x => x._id === e.target.value); setCfLockerNo(l?.lockerNo || '') }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">请选择</option>
                  {lockers.filter(l => l.status === 'available').map(l => <option key={l._id} value={l._id}>{l.lockerNo} ({l.area})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">租户姓名</label><input value={cfTenantName} onChange={e => setCfTenantName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">手机号</label><input value={cfTenantPhone} onChange={e => setCfTenantPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">租赁类型</label>
                <div className="flex gap-2">
                  {(['monthly', 'annual'] as const).map(t => (
                    <button key={t} onClick={() => setCfRentalType(t)} className={`flex-1 py-2 text-sm rounded-lg border transition-all ${cfRentalType === t ? 'bg-emerald-50 border-emerald-400 text-emerald-700 font-medium' : 'border-gray-200 text-gray-500'}`}>
                      {t === 'monthly' ? '月租' : '年租'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">开始日期</label><input type="date" value={cfStartDate} onChange={e => setCfStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">结束日期</label><input type="date" value={cfEndDate} onChange={e => setCfEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">合同费用（元）</label><input type="number" value={cfFee} onChange={e => setCfFee(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" /></div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowNewContract(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleCreateContract} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium">确认创建</button>
            </div>
          </div>
        </div>
      )}

      {/* ======== 钥匙弹窗 ======== */}
      {showKeyDialog && selectedLocker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{keyAction === 'issue' ? '发放钥匙/手环' : '回收钥匙'}</h2>
              <button onClick={() => setShowKeyDialog(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="text-sm text-gray-600">更衣柜：<span className="font-semibold text-gray-900">{selectedLocker.lockerNo}</span></div>
              {keyAction === 'issue' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">类型</label>
                    <select value={keyType} onChange={e => setKeyType(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value="physical_key">实体钥匙</option>
                      <option value="wristband">RFID手环</option>
                      <option value="card">门禁卡</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">编号</label>
                    <input value={keyNo} onChange={e => setKeyNo(e.target.value)} placeholder="如：K-A101" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">
                  当前钥匙：{selectedLocker.keyInfo?.keyNo || '无'}
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowKeyDialog(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={keyAction === 'issue' ? handleIssueKey : handleReturnKey}
                className="flex-1 px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 font-medium">
                {keyAction === 'issue' ? '确认发放' : '确认回收'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
