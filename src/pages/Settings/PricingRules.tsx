import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/utils/api'

interface TimeSlot { start: string; end: string; rate: number }

interface PricingRulesData {
  clubId?: string
  memberDiscount: { level1: number; level2: number; level3: number; level4: number }
  dynamicPricing: boolean
  holidayPolicy: { enabled: boolean; surchargeRate: number }
  timeSlotPricing: { morning: TimeSlot; afternoon: TimeSlot }
  additionalFees: { caddyFee: number; cartFee: number; lockerFee: number; insuranceFee: number }
}

const DEFAULTS: PricingRulesData = {
  memberDiscount: { level1: 0.7, level2: 0.6, level3: 0.5, level4: 0.4 },
  dynamicPricing: false,
  holidayPolicy: { enabled: true, surchargeRate: 1.5 },
  timeSlotPricing: {
    morning: { start: '06:00', end: '12:00', rate: 1.0 },
    afternoon: { start: '12:00', end: '18:00', rate: 0.8 },
  },
  additionalFees: { caddyFee: 200, cartFee: 150, lockerFee: 0, insuranceFee: 10 },
}

// 数字输入框
function NumberInput({
  label, value, onChange, min = 0, max, step = 1, unit, hint
}: {
  label: string; value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; unit?: string; hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number" value={value} min={min} max={max} step={step}
          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }}
          className="w-28 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

// 时间输入框
function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <input
        type="time" value={value} onChange={e => onChange(e.target.value)}
        className="w-32 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
      />
    </div>
  )
}

// Toggle 开关
function Toggle({ label, checked, onChange, description }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; description?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
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

export default function PricingRules() {
  const [form, setForm] = useState<PricingRulesData>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.settings.getPricingRules().then((res: any) => {
      setForm({ ...DEFAULTS, ...res.data })
    }).catch(() => {
      toast.error('加载价格规则失败')
    }).finally(() => setLoading(false))
  }, [])

  const setNested = <K extends keyof PricingRulesData>(key: K, subKey: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: { ...(prev[key] as object), [subKey]: value } }))
  }

  const setTimeSlot = (slot: 'morning' | 'afternoon', subKey: keyof TimeSlot, value: unknown) => {
    setForm(prev => ({
      ...prev,
      timeSlotPricing: {
        ...prev.timeSlotPricing,
        [slot]: { ...prev.timeSlotPricing[slot], [subKey]: value }
      }
    }))
  }

  const handleSave = async () => {
    const { level1, level2, level3, level4 } = form.memberDiscount
    if ([level1, level2, level3, level4].some(v => v < 0 || v > 1)) {
      toast.error('会员折扣系数必须在 0~1 之间')
      return
    }
    setSaving(true)
    try {
      await api.settings.updatePricingRules(form)
      toast.success('价格规则保存成功')
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
      {/* 会员折扣 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">会员折扣</h3>
        <p className="text-xs text-muted-foreground mb-4">系数范围 0~1，例 0.7 表示七折。等级越高折扣越大。</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(['level1', 'level2', 'level3', 'level4'] as const).map((lv, i) => (
            <NumberInput
              key={lv}
              label={`${i + 1} 级会员`}
              value={form.memberDiscount[lv]}
              min={0} max={1} step={0.05}
              hint={`即 ${Math.round(form.memberDiscount[lv] * 10)} 折`}
              onChange={v => setNested('memberDiscount', lv, v)}
            />
          ))}
        </div>
      </section>

      {/* 时段定价 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">时段定价</h3>
        <p className="text-xs text-muted-foreground mb-4">价格系数基于基础价格计算，1.0 表示原价。</p>
        <div className="space-y-4">
          {(['morning', 'afternoon'] as const).map(slot => (
            <div key={slot} className="p-4 bg-secondary/50 rounded-xl">
              <div className="text-sm font-medium text-foreground mb-3">{slot === 'morning' ? '上午时段' : '下午时段'}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <TimeInput
                  label="开始时间"
                  value={form.timeSlotPricing[slot].start}
                  onChange={v => setTimeSlot(slot, 'start', v)}
                />
                <TimeInput
                  label="结束时间"
                  value={form.timeSlotPricing[slot].end}
                  onChange={v => setTimeSlot(slot, 'end', v)}
                />
                <NumberInput
                  label="价格系数"
                  value={form.timeSlotPricing[slot].rate}
                  min={0.1} max={3} step={0.05}
                  hint={`基础价 × ${form.timeSlotPricing[slot].rate}`}
                  onChange={v => setTimeSlot(slot, 'rate', v)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 节假日政策 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">节假日政策</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-end pb-1">
            <Toggle
              label="启用节假日加价"
              checked={form.holidayPolicy.enabled}
              onChange={v => setNested('holidayPolicy', 'enabled', v)}
              description="开启后节假日按加价系数收费"
            />
          </div>
          <NumberInput
            label="节假日加价系数"
            value={form.holidayPolicy.surchargeRate}
            min={1} max={5} step={0.1}
            hint={`基础价 × ${form.holidayPolicy.surchargeRate}`}
            onChange={v => setNested('holidayPolicy', 'surchargeRate', v)}
          />
        </div>
      </section>

      {/* 附加费用 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">附加费用（元）</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <NumberInput
            label="球童费" value={form.additionalFees.caddyFee} min={0} unit="元"
            onChange={v => setNested('additionalFees', 'caddyFee', v)}
          />
          <NumberInput
            label="球车费" value={form.additionalFees.cartFee} min={0} unit="元"
            onChange={v => setNested('additionalFees', 'cartFee', v)}
          />
          <NumberInput
            label="储物柜费" value={form.additionalFees.lockerFee} min={0} unit="元"
            onChange={v => setNested('additionalFees', 'lockerFee', v)}
          />
          <NumberInput
            label="保险费" value={form.additionalFees.insuranceFee} min={0} unit="元"
            onChange={v => setNested('additionalFees', 'insuranceFee', v)}
          />
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
