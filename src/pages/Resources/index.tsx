import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Flag, UserCheck, Car } from 'lucide-react'
import Courses from './Courses'
import Caddies from './Caddies'
import Carts from './Carts'

type TabKey = 'courses' | 'caddies' | 'carts'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'courses', label: '球场管理', icon: <Flag size={16} /> },
  { key: 'caddies', label: '球童管理', icon: <UserCheck size={16} /> },
  { key: 'carts',   label: '球车管理', icon: <Car size={16} /> },
]

export default function Resources() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('courses')

  const renderContent = () => {
    if (activeTab === 'courses') return <Courses />
    if (activeTab === 'caddies') return <Caddies />
    return <Carts />
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 h-[60px] flex items-center gap-4 shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <h1 className="text-base font-semibold text-gray-900">资源管理</h1>
      </header>

      <div className="flex-1 flex flex-col px-6 py-6 gap-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区：撐满剩余高度 */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
