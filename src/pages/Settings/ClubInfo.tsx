import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/utils/api'

interface ClubInfoData {
  clubId?: string
  name: string
  shortName: string
  address: string
  phone: string
  email: string
  website: string
  description: string
  timezone: string
  currency: string
  logo: string
}

const TIMEZONES = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai（北京时间 UTC+8）' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo（东京 UTC+9）' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore（新加坡 UTC+8）' },
  { value: 'UTC', label: 'UTC（协调世界时）' },
]

const CURRENCIES = [
  { value: 'CNY', label: 'CNY — 人民币' },
  { value: 'USD', label: 'USD — 美元' },
  { value: 'HKD', label: 'HKD — 港币' },
  { value: 'SGD', label: 'SGD — 新加坡元' },
]

const DEFAULTS: ClubInfoData = {
  name: '', shortName: '', address: '', phone: '',
  email: '', website: '', description: '',
  timezone: 'Asia/Shanghai', currency: 'CNY', logo: ''
}

export default function ClubInfo() {
  const [form, setForm] = useState<ClubInfoData>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.settings.getClubInfo().then((res: any) => {
      setForm({ ...DEFAULTS, ...res.data })
    }).catch(() => {
      toast.error('加载球会信息失败')
    }).finally(() => setLoading(false))
  }, [])

  const set = (key: keyof ClubInfoData, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('球会名称不能为空')
      return
    }
    setSaving(true)
    try {
      await api.settings.updateClubInfo(form)
      toast.success('球会信息保存成功')
    } catch {
      // 错误已由 api.ts 拦截器处理
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        加载中...
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* 基础信息 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">基础信息</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              球会名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="例：开锤高尔夫球会"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">球会简称</label>
            <input
              type="text"
              value={form.shortName}
              onChange={e => set('shortName', e.target.value)}
              placeholder="例：开锤"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">联系电话</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="例：010-12345678"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">电子邮箱</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="例：admin@example.com"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1">详细地址</label>
            <input
              type="text"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="例：北京市朝阳区某某路1号"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1">官网地址</label>
            <input
              type="url"
              value={form.website}
              onChange={e => set('website', e.target.value)}
              placeholder="例：https://www.example.com"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1">球会简介</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="简要介绍球会特色、服务等..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
            />
          </div>
        </div>
      </section>

      {/* 区域与货币 */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">区域与货币</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">时区</label>
            <select
              value={form.timezone}
              onChange={e => set('timezone', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-card"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">货币</label>
            <select
              value={form.currency}
              onChange={e => set('currency', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-card"
            >
              {CURRENCIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 保存按钮 */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-success text-primary-foreground rounded-lg text-sm font-medium hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
