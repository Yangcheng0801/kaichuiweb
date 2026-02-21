import { useState } from 'react'
import { Building2, CalendarClock, BadgeDollarSign, Grid3X3, Calendar, Users, UserCheck, Shield } from 'lucide-react'
import Layout from '@/components/Layout'
import ClubInfo from './ClubInfo'
import BookingRules from './BookingRules'
import PricingRules from './PricingRules'
import RateSheets from './RateSheets'
import SpecialDates from './SpecialDates'
import TeamPricing from './TeamPricing'
import IdentityTypes from './IdentityTypes'
import RolesManager from './RolesManager'
import { cn } from '@/lib/utils'

type TabKey = 'club' | 'booking' | 'pricing' | 'identity-types' | 'rate-sheets' | 'special-dates' | 'team-pricing' | 'roles'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'club',           label: '球会信息', icon: <Building2 size={16} /> },
  { key: 'booking',        label: '预订规则', icon: <CalendarClock size={16} /> },
  { key: 'pricing',        label: '价格规则', icon: <BadgeDollarSign size={16} /> },
  { key: 'identity-types', label: '身份类型', icon: <UserCheck size={16} /> },
  { key: 'rate-sheets',    label: '价格矩阵', icon: <Grid3X3 size={16} /> },
  { key: 'special-dates',  label: '日历管理', icon: <Calendar size={16} /> },
  { key: 'team-pricing',   label: '团队定价', icon: <Users size={16} /> },
  { key: 'roles',          label: '权限管理', icon: <Shield size={16} /> },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabKey>('club')

  const renderContent = () => {
    switch (activeTab) {
      case 'club':           return <ClubInfo />
      case 'booking':        return <BookingRules />
      case 'pricing':        return <PricingRules />
      case 'identity-types': return <IdentityTypes />
      case 'rate-sheets':    return <RateSheets />
      case 'special-dates':  return <SpecialDates />
      case 'team-pricing':   return <TeamPricing />
      case 'roles':          return <RolesManager />
      default:               return <ClubInfo />
    }
  }

  return (
    <Layout title="系统设置">
      <div className="p-4 sm:p-6 flex flex-col gap-6 min-h-full">
        {/* 标题 */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">系统设置</h1>
          <p className="text-sm text-foreground-muted mt-1">管理球场配置和系统参数</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-background-elevated rounded-xl p-1 border border-border overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground-muted hover:text-foreground hover:bg-background-hover'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 bg-background-card rounded-xl border border-border p-6 sm:p-8">
          {renderContent()}
        </div>
      </div>
    </Layout>
  )
}
