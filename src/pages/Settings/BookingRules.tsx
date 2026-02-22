import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/utils/api'

interface BookingRulesData {
  clubId?: string
  teeTimeInterval: number
  openTime: string
  closeTime: string
  advanceBookingDays: { member: number; guest: number; walkin: number }
  minPlayers: number
  maxPlayers: number
  cancellationPolicy: { freeBeforeHours: number; penaltyRate: number; noShowPenalty: number }
  guestPolicy: { maxGuestsPerMember: number; requireMemberPresent: boolean }
}

const DEFAULTS: BookingRulesData = {
  teeTimeInterval: 10,
  openTime: '06:00',
  closeTime: '18:00',
  advanceBookingDays: { member: 14, guest: 7, walkin: 1 },
  minPlayers: 1,
  maxPlayers: 4,
  cancellationPolicy: { freeBeforeHours: 24, penaltyRate: 0.5, noShowPenalty: 1.0 },
  guestPolicy: { maxGuestsPerMember: 3, requireMemberPresent: true },
}

// 数字输入框封装
function NumberInput({
  label, value, onChange, min = 0, max, step = 1, unit, hint
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onChange(v)
          }}
          className="w-28 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

// 时间输入框封装
function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-32 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
      />
    </div>
  )
}

// Toggle 开关封装
function Toggle({ label, checked, onChange, description }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; description?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors ${checked ? 'bg-success/100' : 'bg-secondary'}`}
      >
        <span className={`absolute top-1 left-1 w-4 h-4 bg-card rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
    </div>
  )
}

export default function BookingRules() {
  const [form, setForm] = useState<BookingRulesData>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.settings.getBookingRules().then((res: any) => {
      setForm({ ...DEFAULTS, ...res.data })
    }).catch(() => {
      toast.error('加载预订规则失败')
    }).finally(() => setLoading(false))
  }, [])

  const setNested = <K extends keyof BookingRulesData>(
    key: K,
    subKey: string,
    value: unknown
  ) => {
    setForm(prev => ({
      ...prev,
      [key]: { ...(prev[key] as object), [subKey]: value }
    }))
  }

  const handleSave = async () => {
    if (form.openTime >= form.closeTime) {
      toast.error('关闭时间必须晚于开放时间')
      return
    }
    if (form.minPlayers > form.maxPlayers) {
      toast.error('最少球员数不能大于最多球员数')
      return
    }
    setSaving(true)
    try {
      await api.settings.updateBookingRules(form)
      toast.success('预订规则保存成功')
    } catch {
      // 错误已由 api.ts 拦截器处理
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">加载中...</div>
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* 基础时间设置 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">基础时间设置</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <TimeInput label="开放时间" value={form.openTime} onChange={v => setForm(p => ({ ...p, openTime: v }))} />
          <TimeInput label="关闭时间" value={form.closeTime} onChange={v => setForm(p => ({ ...p, closeTime: v }))} />
          <NumberInput
            label="发球间隔" value={form.teeTimeInterval} min={5} max={60} step={5} unit="分钟"
            onChange={v => setForm(p => ({ ...p, teeTimeInterval: v }))}
          />
          <NumberInput
            label="最少球员数" value={form.minPlayers} min={1} max={4}
            onChange={v => setForm(p => ({ ...p, minPlayers: v }))}
            unit="人"
          />
          <NumberInput
            label="最多球员数" value={form.maxPlayers} min={1} max={4}
            onChange={v => setForm(p => ({ ...p, maxPlayers: v }))}
            unit="人"
          />
        </div>
      </section>

      {/* 提前预订天数 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">提前预订天数</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <NumberInput
            label="会员" value={form.advanceBookingDays.member} min={1} unit="天"
            onChange={v => setNested('advanceBookingDays', 'member', v)}
          />
          <NumberInput
            label="嘉宾" value={form.advanceBookingDays.guest} min={1} unit="天"
            onChange={v => setNested('advanceBookingDays', 'guest', v)}
          />
          <NumberInput
            label="散客" value={form.advanceBookingDays.walkin} min={1} unit="天"
            onChange={v => setNested('advanceBookingDays', 'walkin', v)}
          />
        </div>
      </section>

      {/* 取消政策 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">取消政策</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <NumberInput
            label="免费取消截止" value={form.cancellationPolicy.freeBeforeHours} min={0} unit="小时前"
            hint="提前此时间取消不收费"
            onChange={v => setNested('cancellationPolicy', 'freeBeforeHours', v)}
          />
          <NumberInput
            label="取消手续费比例" value={form.cancellationPolicy.penaltyRate} min={0} max={1} step={0.1}
            hint="0~1，例 0.5 即收 50%"
            onChange={v => setNested('cancellationPolicy', 'penaltyRate', v)}
          />
          <NumberInput
            label="未到场扣除比例" value={form.cancellationPolicy.noShowPenalty} min={0} max={1} step={0.1}
            hint="0~1，默认 1.0 全额扣除"
            onChange={v => setNested('cancellationPolicy', 'noShowPenalty', v)}
          />
        </div>
      </section>

      {/* 嘉宾政策 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">嘉宾政策</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput
            label="每会员最多携嘉宾数" value={form.guestPolicy.maxGuestsPerMember} min={0} max={10} unit="人"
            onChange={v => setNested('guestPolicy', 'maxGuestsPerMember', v)}
          />
          <div className="flex items-end pb-1">
            <Toggle
              label="要求会员本人到场"
              checked={form.guestPolicy.requireMemberPresent}
              onChange={v => setNested('guestPolicy', 'requireMemberPresent', v)}
              description="开启后嘉宾预订时会员须同行"
            />
          </div>
        </div>
      </section>

      {/* 保存按钮 */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-success text-white rounded-lg text-sm font-medium hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
