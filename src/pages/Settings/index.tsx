import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2, CalendarClock, BadgeDollarSign, Grid3X3, Calendar, Users, UserCheck, Shield } from 'lucide-react'
import ClubInfo from './ClubInfo'
import BookingRules from './BookingRules'
import PricingRules from './PricingRules'
import RateSheets from './RateSheets'
import SpecialDates from './SpecialDates'
import TeamPricing from './TeamPricing'
import IdentityTypes from './IdentityTypes'
import RolesManager from './RolesManager'

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
  const navigate = useNavigate()
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
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 bg-white border-b border-border px-6 h-[60px] flex items-center gap-4 shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="h-4 w-px bg-secondary" />
        <h1 className="text-base font-semibold text-foreground">系统设置</h1>
      </header>

      <div className="flex-1 flex flex-col px-6 py-6 gap-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-border w-fit">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-success text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区：撐满剩余高度 */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-border p-6 sm:p-8">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
