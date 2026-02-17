/**
 * 球员管理页面
 *
 * 功能：
 *   - 球员列表：搜索（姓名/手机/playerNo/消费卡号）、分页
 *   - 新增球员：填写基础信息 + 球场档案（会员等级、消费卡号）
 *   - 球员详情抽屉：基础信息 + 球场档案 + 消费二维码 + 车辆 + 充值
 *   - 账户充值弹窗：金额 + 支付方式
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Search, Plus, X, ChevronRight,
  User, Phone, CreditCard, Car, RefreshCw, Wallet, QrCode,
  Crown, Star, Gift, Clock, Award
} from 'lucide-react'
import { api as _api } from '@/utils/api'

const api: any = _api

// ─── 类型 ─────────────────────────────────────────────────────────────────────

interface Player {
  _id:         string
  playerNo:    string
  name:        string
  phoneNumber: string
  gender:      string
  nationality: string
  vehicles:    { plateNo: string; brand?: string; color?: string; isPrimary?: boolean }[]
  isDeleted:   boolean
  createTime:  any
  profile?: {
    memberLevel:   string
    memberLevelLabel: string
    consumeCardNo: string
    qrCode:        { code: string; updatedAt: any }
    account:       { balance: number }
  }
}

const MEMBER_LEVELS = [
  { value: 'regular',    label: '普通会员' },
  { value: 'silver',     label: '银卡会员' },
  { value: 'gold',       label: '金卡会员' },
  { value: 'platinum',   label: '铂金会员' },
  { value: 'diamond',    label: '钻石会员' },
  { value: 'vip',        label: 'VIP会员'  },
]

const LEVEL_BADGE: Record<string, string> = {
  regular:  'bg-gray-100 text-gray-600',
  silver:   'bg-slate-100 text-slate-600',
  gold:     'bg-yellow-100 text-yellow-700',
  platinum: 'bg-purple-100 text-purple-700',
  diamond:  'bg-sky-100 text-sky-700',
  vip:      'bg-rose-100 text-rose-700',
}

const PAY_METHODS = [
  { value: 'cash',     label: '现金'   },
  { value: 'wechat',   label: '微信'   },
  { value: 'alipay',   label: '支付宝' },
  { value: 'card',     label: '银行卡' },
  { value: 'transfer', label: '转账'   },
]

// ─── 工具 ─────────────────────────────────────────────────────────────────────

function toDateStr(v: any): string {
  if (!v) return ''
  try {
    if (v instanceof Date) return v.toLocaleDateString('zh-CN')
    if (typeof v === 'object' && v.$date) return new Date(v.$date).toLocaleDateString('zh-CN')
    if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().toLocaleDateString('zh-CN')
    return new Date(v).toLocaleDateString('zh-CN')
  } catch { return '' }
}

// ─── 新增球员弹窗 ─────────────────────────────────────────────────────────────

interface AddPlayerDialogProps {
  onClose:   () => void
  onSuccess: (player: Player) => void
}

function AddPlayerDialog({ onClose, onSuccess }: AddPlayerDialogProps) {
  const [form, setForm] = useState({
    name: '', phoneNumber: '', gender: 'male', nationality: 'CN',
    clubId: 'default', memberLevel: 'regular', consumeCardNo: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('请填写球员姓名'); return }
    setSaving(true)
    try {
      const res: any = await api.players.create(form)
      toast.success('球员创建成功')
      onSuccess(res.data)
      onClose()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-900">新增球员</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 基础信息 */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">基础信息</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">姓名 <span className="text-red-400">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="真实姓名"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">手机号</label>
            <input value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)}
              placeholder="11位手机号"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">性别</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white">
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">国籍</label>
              <select value={form.nationality} onChange={e => set('nationality', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white">
                <option value="CN">中国</option>
                <option value="US">美国</option>
                <option value="UK">英国</option>
                <option value="KR">韩国</option>
                <option value="JP">日本</option>
                <option value="OTHER">其他</option>
              </select>
            </div>
          </div>

          {/* 球场档案 */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">球场档案</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">会员等级</label>
            <select value={form.memberLevel} onChange={e => set('memberLevel', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white">
              {MEMBER_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">消费卡号（可留空，系统自动生成）</label>
            <input value={form.consumeCardNo} onChange={e => set('consumeCardNo', e.target.value)}
              placeholder="如：MC260001"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
            取消
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
            {saving ? '创建中...' : '创建球员'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 充值弹窗 ─────────────────────────────────────────────────────────────────

interface RechargeDialogProps {
  player:    Player
  onClose:   () => void
  onSuccess: () => void
}

function RechargeDialog({ player, onClose, onSuccess }: RechargeDialogProps) {
  const [amount,    setAmount]    = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [note,      setNote]      = useState('')
  const [saving,    setSaving]    = useState(false)

  const handleConfirm = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { toast.error('请输入有效金额'); return }
    setSaving(true)
    try {
      await api.players.recharge(player._id, {
        clubId: 'default', amount: amt, payMethod, note
      })
      toast.success(`充值 ¥${amt} 成功`)
      onSuccess()
      onClose()
    } catch {
    } finally {
      setSaving(false)
    }
  }

  const balance = player.profile?.account?.balance ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">账户充值</h2>
            <p className="text-xs text-gray-400 mt-0.5">{player.name} · 当前余额 ¥{balance.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">充值金额（元）</label>
            <input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-2xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 text-right" />
          </div>
          {/* 快捷金额 */}
          <div className="flex gap-2">
            {[100, 200, 500, 1000].map(v => (
              <button key={v} onClick={() => setAmount(String(v))}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  amount === String(v)
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                ¥{v}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">支付方式</label>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.value} onClick={() => setPayMethod(m.value)}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                    payMethod === m.value
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">备注</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="充值原因（可选）"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
            取消
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
            {saving ? '充值中...' : `确认充值 ¥${amount || 0}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 球员详情抽屉 ─────────────────────────────────────────────────────────────

interface DetailDrawerProps {
  playerId:  string
  onClose:   () => void
  onRefresh: () => void
}

function DetailDrawer({ playerId, onClose, onRefresh }: DetailDrawerProps) {
  const [player,   setPlayer]   = useState<Player | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [showRecharge, setShowRecharge] = useState(false)
  const [refreshingQr, setRefreshingQr] = useState(false)
  const [membershipInfo, setMembershipInfo] = useState<any>(null)
  const [pointsBalance, setPointsBalance] = useState<number>(0)

  const load = () => {
    setLoading(true)
    api.players.getDetail(playerId, { clubId: 'default' })
      .then((res: any) => setPlayer(res.data || null))
      .catch(() => toast.error('加载球员信息失败'))
      .finally(() => setLoading(false))

    // Load membership & points
    api.memberships.getByPlayer(playerId)
      .then((res: any) => setMembershipInfo(res.data?.active || null))
      .catch(() => {})
    api.points.getBalance(playerId)
      .then((res: any) => setPointsBalance(res.data?.balance || 0))
      .catch(() => {})
  }

  useEffect(() => { load() }, [playerId])

  const handleRefreshQr = async () => {
    if (!player) return
    setRefreshingQr(true)
    try {
      await api.players.refreshQrcode(player._id)
      toast.success('二维码已更新')
      load()
    } catch {
    } finally {
      setRefreshingQr(false)
    }
  }

  const profile = player?.profile
  const balance = profile?.account?.balance ?? 0

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">球员档案</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
          ) : !player ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">未找到球员信息</div>
          ) : (
            <div className="px-6 py-5 space-y-6">
              {/* 头部：姓名 + playerNo */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl font-bold flex-shrink-0">
                  {player.name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl font-bold text-gray-900">{player.name}</span>
                    {profile?.memberLevel && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_BADGE[profile.memberLevel] || LEVEL_BADGE.regular}`}>
                        {MEMBER_LEVELS.find(l => l.value === profile.memberLevel)?.label || profile.memberLevel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs"># {player.playerNo}</span>
                    {player.phoneNumber && <span>{player.phoneNumber}</span>}
                  </div>
                </div>
              </div>

              {/* 账户余额 */}
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white">
                <p className="text-sm text-emerald-100">会员卡余额</p>
                <p className="text-3xl font-bold mt-1">¥ {balance.toFixed(2)}</p>
                {profile?.consumeCardNo && (
                  <p className="text-xs text-emerald-200 mt-2 font-mono">消费卡号：{profile.consumeCardNo}</p>
                )}
                <button onClick={() => setShowRecharge(true)}
                  className="mt-3 px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors font-medium">
                  + 充值
                </button>
              </div>

              {/* 会籍信息 */}
              {membershipInfo ? (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">当前会籍</p>
                  <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-5 text-white">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown size={18} className="text-amber-200" />
                      <span className="font-bold text-lg">{membershipInfo.planName}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                        membershipInfo.status === 'active' ? 'bg-white/20' :
                        membershipInfo.status === 'expiring' ? 'bg-red-400/30' : 'bg-white/10'
                      }`}>
                        {membershipInfo.status === 'active' ? '生效中' :
                         membershipInfo.status === 'expiring' ? '即将到期' : membershipInfo.status}
                      </span>
                    </div>
                    <p className="text-xs text-amber-100 font-mono mb-3">{membershipInfo.membershipNo}</p>

                    {/* 权益使用进度 */}
                    {membershipInfo.benefits?.freeRounds > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-amber-100 mb-1">
                          <span>免费轮次</span>
                          <span>{membershipInfo.usage?.roundsUsed || 0} / {membershipInfo.benefits.freeRounds}</span>
                        </div>
                        <div className="bg-white/20 rounded-full h-2">
                          <div className="bg-white h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((membershipInfo.usage?.roundsUsed || 0) / membershipInfo.benefits.freeRounds) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                    {membershipInfo.benefits?.guestQuota > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-amber-100 mb-1">
                          <span>带客名额</span>
                          <span>{membershipInfo.usage?.guestBrought || 0} / {membershipInfo.benefits.guestQuota}</span>
                        </div>
                        <div className="bg-white/20 rounded-full h-2">
                          <div className="bg-white h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((membershipInfo.usage?.guestBrought || 0) / membershipInfo.benefits.guestQuota) * 100)}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
                      {membershipInfo.benefits?.discountRate < 1 && <span className="bg-white/15 px-2 py-0.5 rounded">{membershipInfo.benefits.discountRate * 10}折续打</span>}
                      {membershipInfo.benefits?.priorityBooking && <span className="bg-white/15 px-2 py-0.5 rounded">优先预订</span>}
                      {membershipInfo.benefits?.freeCart && <span className="bg-white/15 px-2 py-0.5 rounded">免球车</span>}
                      {membershipInfo.benefits?.freeLocker && <span className="bg-white/15 px-2 py-0.5 rounded">免更衣柜</span>}
                    </div>

                    <p className="text-xs text-amber-200 mt-3">
                      <Clock size={10} className="inline mr-1" />
                      {membershipInfo.startDate?.slice(0, 10)} ~ {membershipInfo.endDate?.slice(0, 10) || '永久'}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">当前会籍</p>
                  <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-400 text-sm">
                    <Crown size={24} className="mx-auto mb-2 text-gray-300" />
                    暂无有效会籍
                  </div>
                </div>
              )}

              {/* 积分余额 */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">积分账户</p>
                <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Star size={20} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">可用积分</p>
                    <p className="text-2xl font-bold text-amber-600">{pointsBalance.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* 消费二维码 */}
              {profile?.qrCode?.code && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">消费二维码</p>
                    <button onClick={handleRefreshQr} disabled={refreshingQr}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50">
                      <RefreshCw size={12} className={refreshingQr ? 'animate-spin' : ''} />
                      刷新
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                      <QrCode size={24} className="text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-gray-700 break-all">{profile.qrCode.code}</p>
                      <p className="text-xs text-gray-400 mt-0.5">扫码识别消费身份</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 基础信息 */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">基础信息</p>
                <div className="space-y-2">
                  {[
                    { label: '性别',     value: player.gender === 'male' ? '男' : player.gender === 'female' ? '女' : '其他' },
                    { label: '国籍',     value: player.nationality },
                    { label: '加入时间', value: toDateStr(player.createTime) },
                  ].filter(r => r.value).map(r => (
                    <div key={r.label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{r.label}</span>
                      <span className="text-gray-800 font-medium">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 车辆信息 */}
              {player.vehicles && player.vehicles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">登记车辆</p>
                  <div className="space-y-2">
                    {player.vehicles.map((v, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                        <Car size={16} className="text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800">{v.plateNo}</span>
                          {(v.brand || v.color) && (
                            <span className="text-xs text-gray-400 ml-2">{[v.brand, v.color].filter(Boolean).join(' · ')}</span>
                          )}
                        </div>
                        {v.isPrimary && (
                          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">常用</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 充值弹窗 */}
      {showRecharge && player && (
        <RechargeDialog
          player={player}
          onClose={() => setShowRecharge(false)}
          onSuccess={() => { load(); onRefresh() }}
        />
      )}
    </>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function Players() {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [players,  setPlayers]  = useState<Player[]>([])
  const [loading,  setLoading]  = useState(false)
  const [page,     setPage]     = useState(1)
  const [hasMore,  setHasMore]  = useState(false)
  const [total,    setTotal]    = useState(0)
  const [showAdd,  setShowAdd]  = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const PAGE_SIZE = 20

  const load = (pg = 1, q = searchText) => {
    setLoading(true)
    const params: any = { page: pg, pageSize: PAGE_SIZE, clubId: 'default' }
    if (q) params.q = q

    const fetcher = q
      ? api.players.search({ q, clubId: 'default' })
      : api.players.getList(params)

    fetcher
      .then((res: any) => {
        const data = res.data || []
        if (pg === 1) {
          setPlayers(data)
        } else {
          setPlayers(prev => [...prev, ...data])
        }
        setTotal(res.total || data.length)
        setHasMore(data.length === PAGE_SIZE)
        setPage(pg)
      })
      .catch(() => toast.error('加载球员列表失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [])

  const handleSearch = (val: string) => {
    setSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchText(val)
      load(1, val)
    }, 400)
  }

  const handleLoadMore = () => { if (!loading && hasMore) load(page + 1) }

  const handleAddSuccess = (player: Player) => {
    setPlayers(prev => [player, ...prev])
    setTotal(t => t + 1)
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 h-[60px] flex items-center gap-4 shadow-sm flex-shrink-0">
        <button onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft size={16} /> 返回
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <h1 className="text-base font-semibold text-gray-900">球员管理</h1>
        <span className="text-sm text-gray-400 ml-1">{total > 0 ? `共 ${total} 人` : ''}</span>
      </header>

      <div className="flex-1 flex flex-col px-6 py-6 gap-4">
        {/* 搜索 + 新增 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={searchInput}
              onChange={e => handleSearch(e.target.value)}
              placeholder="搜索姓名 / 手机号 / 球员号 / 消费卡号"
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm"
            />
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm rounded-xl hover:bg-emerald-700 transition-colors shadow-sm font-medium flex-shrink-0">
            <Plus size={15} /> 新增球员
          </button>
        </div>

        {/* 球员列表 */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading && players.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
          ) : players.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <User size={48} className="mb-3" />
              <p className="text-sm">
                {searchText ? '未找到匹配的球员' : '暂无球员'}
              </p>
              {!searchText && (
                <button onClick={() => setShowAdd(true)}
                  className="mt-4 px-5 py-2 bg-emerald-600 text-white text-sm rounded-full hover:bg-emerald-700 transition-colors">
                  新增第一位球员
                </button>
              )}
            </div>
          ) : (
            <div>
              {/* 表头 */}
              <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500">
                <span>球员</span>
                <span>球员号</span>
                <span>会员等级</span>
                <span>余额</span>
                <span></span>
              </div>

              <div className="divide-y divide-gray-50">
                {players.map(player => {
                  const profile = player.profile
                  const balance = profile?.account?.balance ?? 0
                  const level   = profile?.memberLevel || 'regular'
                  const levelLabel = MEMBER_LEVELS.find(l => l.value === level)?.label || level

                  return (
                    <div key={player._id}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setDetailId(player._id)}>
                      {/* 头像 + 名字 */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                          {player.name?.[0] || '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{player.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                            {player.phoneNumber && (
                              <span className="flex items-center gap-0.5">
                                <Phone size={10} /> {player.phoneNumber}
                              </span>
                            )}
                            {profile?.consumeCardNo && (
                              <span className="flex items-center gap-0.5">
                                <CreditCard size={10} /> {profile.consumeCardNo}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 球员号 */}
                      <div className="hidden sm:block w-20 flex-shrink-0">
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {player.playerNo}
                        </span>
                      </div>

                      {/* 会员等级 */}
                      <div className="hidden sm:block w-24 flex-shrink-0">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${LEVEL_BADGE[level]}`}>
                          {levelLabel}
                        </span>
                      </div>

                      {/* 余额 */}
                      <div className="hidden sm:block w-20 flex-shrink-0 text-right">
                        <span className={`text-sm font-semibold ${balance > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                          ¥{balance.toFixed(2)}
                        </span>
                      </div>

                      {/* 箭头 */}
                      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                    </div>
                  )
                })}
              </div>

              {/* 加载更多 */}
              {hasMore && (
                <div className="flex justify-center py-4 border-t border-gray-50">
                  <button onClick={handleLoadMore} disabled={loading}
                    className="px-6 py-2 text-sm text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors">
                    {loading ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 新增弹窗 */}
      {showAdd && (
        <AddPlayerDialog
          onClose={() => setShowAdd(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {/* 详情抽屉 */}
      {detailId && (
        <DetailDrawer
          playerId={detailId}
          onClose={() => setDetailId(null)}
          onRefresh={() => load(1)}
        />
      )}
    </div>
  )
}
