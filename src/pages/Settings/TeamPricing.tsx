/**
 * 团队定价设置页面 (Team Pricing)
 *
 * 功能：
 *   - 阶梯折扣表编辑（人数区间 + 折扣率 + 标签）
 *   - 底价保护设置
 *   - 启用/禁用开关
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Users, Plus, Trash2, Save, Shield } from 'lucide-react'
import { api } from '@/utils/api'

interface Tier {
  minPlayers: number
  maxPlayers: number
  discountRate: number
  label: string
}

interface TeamPricingData {
  enabled: boolean
  tiers: Tier[]
  floorPriceRate: number
  clubId?: string
  _id?: string
}

export default function TeamPricing() {
  const [data, setData] = useState<TeamPricingData>({
    enabled: true,
    tiers: [
      { minPlayers: 8,  maxPlayers: 15,  discountRate: 0.9,  label: '小型团队9折' },
      { minPlayers: 16, maxPlayers: 23,  discountRate: 0.85, label: '中型团队85折' },
      { minPlayers: 24, maxPlayers: 35,  discountRate: 0.8,  label: '大型团队8折' },
      { minPlayers: 36, maxPlayers: 999, discountRate: 0.75, label: '赛事级75折' },
    ],
    floorPriceRate: 0.6,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await api.settings.getTeamPricing()
      if (res.data) setData(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleSave = async () => {
    // Validate tiers
    for (let i = 0; i < data.tiers.length; i++) {
      const t = data.tiers[i]
      if (t.minPlayers >= t.maxPlayers) {
        toast.error(`第${i + 1}行：最小人数必须小于最大人数`); return
      }
      if (t.discountRate <= 0 || t.discountRate > 1) {
        toast.error(`第${i + 1}行：折扣率需在 0~1 之间`); return
      }
    }

    setSaving(true)
    try {
      await api.settings.updateTeamPricing(data)
      toast.success('团队定价规则保存成功')
    } catch {} finally {
      setSaving(false)
    }
  }

  const addTier = () => {
    const last = data.tiers[data.tiers.length - 1]
    setData(p => ({
      ...p,
      tiers: [
        ...p.tiers,
        {
          minPlayers: last ? last.maxPlayers + 1 : 8,
          maxPlayers: last ? last.maxPlayers + 10 : 15,
          discountRate: 0.85,
          label: '',
        },
      ],
    }))
  }

  const removeTier = (idx: number) => {
    if (data.tiers.length <= 1) { toast.error('至少保留一个阶梯'); return }
    setData(p => ({ ...p, tiers: p.tiers.filter((_, i) => i !== idx) }))
  }

  const updateTier = (idx: number, key: keyof Tier, val: string | number) => {
    setData(p => {
      const next = [...p.tiers]
      next[idx] = { ...next[idx], [key]: val }
      return { ...p, tiers: next }
    })
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users size={20} className="text-success" />
            团队定价规则
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">配置团队预订的人数阶梯折扣</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 text-sm bg-success text-white rounded-lg hover:bg-success/90 font-medium disabled:opacity-50">
          <Save size={14} />
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* 启用开关 */}
      <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-xl">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setData(p => ({ ...p, enabled: !p.enabled }))}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${data.enabled ? 'bg-success/100' : 'bg-secondary'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${data.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm font-medium text-foreground">{data.enabled ? '已启用团队折扣' : '团队折扣已关闭'}</span>
        </label>
      </div>

      {/* 阶梯表 */}
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-secondary/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">最少人数</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">最多人数</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">折扣率</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">折后比例</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">标签</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {data.tiers.map((tier, idx) => (
              <tr key={idx} className="border-t border-border hover:bg-secondary/50/50">
                <td className="px-4 py-3">
                  <input type="number" value={tier.minPlayers} min={2} onChange={e => updateTier(idx, 'minPlayers', Number(e.target.value))} className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </td>
                <td className="px-4 py-3">
                  <input type="number" value={tier.maxPlayers} min={2} onChange={e => updateTier(idx, 'maxPlayers', Number(e.target.value))} className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </td>
                <td className="px-4 py-3">
                  <input type="number" value={tier.discountRate} step={0.05} min={0.1} max={1} onChange={e => updateTier(idx, 'discountRate', Number(e.target.value))} className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-semibold ${tier.discountRate < 0.85 ? 'text-red-600' : 'text-success'}`}>
                    {Math.round(tier.discountRate * 100)}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <input value={tier.label} onChange={e => updateTier(idx, 'label', e.target.value)} placeholder="如：小型团队9折" className="w-full px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => removeTier(idx)} className="p-1 text-muted-foreground hover:text-red-500"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 bg-secondary/50 border-t border-border">
          <button onClick={addTier} className="flex items-center gap-1.5 text-sm text-success hover:text-success font-medium">
            <Plus size={14} /> 添加阶梯
          </button>
        </div>
      </div>

      {/* 底价保护 */}
      <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={16} className="text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">底价保护</span>
        </div>
        <p className="text-xs text-amber-700 mb-3">
          团队折扣后的价格不会低于散客价的指定比例，防止过度折扣。
        </p>
        <div className="flex items-center gap-3">
          <label className="text-sm text-foreground">最低价格比例：</label>
          <input
            type="number"
            value={data.floorPriceRate}
            min={0.1}
            max={1}
            step={0.05}
            onChange={e => setData(p => ({ ...p, floorPriceRate: Number(e.target.value) }))}
            className="w-20 px-2 py-1.5 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
          <span className="text-sm text-amber-700 font-medium">
            即不低于散客价的 {Math.round(data.floorPriceRate * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}
