/**
 * 通知中心页面
 *
 * 功能：
 *   - 全部通知列表（分页 + 分类筛选 + 已读/未读过滤）
 *   - 通知统计概览
 *   - 批量操作（全部已读、归档、删除）
 *   - 发送系统公告
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Bell, CheckCheck, Search, Filter, Trash2, Archive,
  Send, RefreshCw, Calendar, Crown, Trophy, Star,
  FileText, Lock, LogIn, Megaphone, AlertTriangle,
  XCircle, Flag, Gift, ChevronLeft, ChevronRight,
  BarChart3, Eye, EyeOff, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../utils/api';

/* ─── 图标映射 ───────────────────────────────────────────────────── */
const ICON_MAP: Record<string, any> = {
  'calendar-check': Calendar, 'calendar-x': Calendar,
  crown: Crown, trophy: Trophy, star: Star,
  'file-text': FileText, lock: Lock, 'log-in': LogIn,
  megaphone: Megaphone, 'alert-triangle': AlertTriangle,
  'x-circle': XCircle, 'refresh-cw': RefreshCw, flag: Flag,
  gift: Gift, bell: Bell, award: Trophy, play: Flag,
  'bar-chart': FileText, grid: Calendar, 'check-circle': CheckCheck,
  'log-out': LogIn, 'file-bar-chart': FileText,
};

const COLOR_MAP: Record<string, string> = {
  emerald: 'text-success bg-success/10 border-success/20',
  red: 'text-red-600 bg-red-50 border-red-200',
  blue: 'text-blue-600 bg-blue-50 border-blue-200',
  amber: 'text-amber-600 bg-amber-50 border-amber-200',
  orange: 'text-orange-600 bg-orange-50 border-orange-200',
  green: 'text-green-600 bg-green-50 border-green-200',
  purple: 'text-purple-600 bg-purple-50 border-purple-200',
  indigo: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  yellow: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  cyan: 'text-cyan-600 bg-cyan-50 border-cyan-200',
  gray: 'text-muted-foreground bg-secondary/50 border-border',
};

const CATEGORY_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  booking:    { label: '预订',   icon: Calendar,       color: 'emerald' },
  membership: { label: '会籍',   icon: Crown,          color: 'amber' },
  tournament: { label: '赛事',   icon: Trophy,         color: 'purple' },
  points:     { label: '积分',   icon: Star,           color: 'yellow' },
  folio:      { label: '账单',   icon: FileText,       color: 'blue' },
  locker:     { label: '更衣柜', icon: Lock,           color: 'orange' },
  room:       { label: '客房',   icon: LogIn,          color: 'indigo' },
  system:     { label: '系统',   icon: Megaphone,      color: 'gray' },
};

interface Notification {
  _id: string;
  type: string;
  typeLabel: string;
  title: string;
  content: string;
  icon: string;
  color: string;
  category: string;
  priority: string;
  read: boolean;
  readAt: string | null;
  archived: boolean;
  sourceType?: string;
  sourceId?: string;
  channels: string[];
  createdAt: string;
}

interface Stats {
  total: number;
  unread: number;
  todayCount: number;
  byCategory: Record<string, { total: number; unread: number }>;
  byPriority: Record<string, number>;
}

export default function Notifications() {
  // 主Tab
  const [activeTab, setActiveTab] = useState<'all' | 'send' | 'stats'>('all');

  // 通知列表
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(false);

  // 筛选
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRead, setFilterRead] = useState<'' | 'true' | 'false'>('');
  const [filterArchived, setFilterArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 统计
  const [stats, setStats] = useState<Stats | null>(null);

  // 发送公告
  const [sendForm, setSendForm] = useState({
    title: '',
    content: '',
    recipientRole: 'all',
    priority: 'normal',
  });

  /* ─── 加载通知列表 ──────────────────────────────────────────── */
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page, pageSize,
        recipientRole: 'admin',
        archived: filterArchived ? 'true' : 'false',
      };
      if (filterCategory) params.category = filterCategory;
      if (filterRead) params.read = filterRead;

      const res: any = await api.notifications.getList(params);
      if (res.success) {
        setNotifications(res.data || []);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.error('加载通知失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterCategory, filterRead, filterArchived]);

  /* ─── 加载统计 ─────────────────────────────────────────────── */
  const fetchStats = useCallback(async () => {
    try {
      const res: any = await api.notifications.getStats();
      if (res.success) setStats(res.data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (activeTab === 'stats') fetchStats();
  }, [activeTab, fetchStats]);

  /* ─── 操作方法 ─────────────────────────────────────────────── */
  const markRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      toast.success('已标记已读');
    } catch { toast.error('操作失败'); }
  };

  const markAllRead = async () => {
    try {
      await api.notifications.markReadBatch({ markAll: true, recipientId: 'admin' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('已全部标记已读');
    } catch { toast.error('操作失败'); }
  };

  const archiveNotification = async (id: string) => {
    try {
      await api.notifications.archive(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      toast.success('已归档');
    } catch { toast.error('归档失败'); }
  };

  const deleteNotification = async (id: string) => {
    try {
      await api.notifications.delete(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      toast.success('已删除');
    } catch { toast.error('删除失败'); }
  };

  const batchMarkRead = async () => {
    if (selectedIds.size === 0) return;
    try {
      await api.notifications.markReadBatch({ ids: Array.from(selectedIds) });
      setNotifications(prev => prev.map(n => selectedIds.has(n._id) ? { ...n, read: true } : n));
      setSelectedIds(new Set());
      toast.success(`已标记 ${selectedIds.size} 条已读`);
    } catch { toast.error('操作失败'); }
  };

  const sendAnnouncement = async () => {
    if (!sendForm.title.trim()) { toast.error('请填写标题'); return; }
    try {
      const res: any = await api.notifications.send({
        type: 'system_announcement',
        ...sendForm,
      });
      if (res.success) {
        toast.success('公告已发送');
        setSendForm({ title: '', content: '', recipientRole: 'all', priority: 'normal' });
      }
    } catch { toast.error('发送失败'); }
  };

  /* ─── 时间格式化 ───────────────────────────────────────────── */
  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}小时前`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}天前`;
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderIcon = (icon: string, color: string) => {
    const Icon = ICON_MAP[icon] || Bell;
    const cls = COLOR_MAP[color] || 'text-muted-foreground bg-secondary/50 border-border';
    return (
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${cls}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalPages = Math.ceil(total / pageSize);
  const unreadCount = notifications.filter(n => !n.read).length;

  /* ═══════════════════════════════════ Tabs ═══════════════════════════════════ */
  const tabs = [
    { id: 'all' as const,   label: '全部通知', icon: Inbox },
    { id: 'send' as const,  label: '发送公告', icon: Send },
    { id: 'stats' as const, label: '通知统计', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/50 to-blue-50/30">
      {/* ── 顶部 ─────────────────────────────────────────────────────── */}
      <div className="bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">通知中心</h1>
                <p className="text-sm text-muted-foreground">管理所有系统通知与消息</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm transition-colors">
                  <CheckCheck className="w-4 h-4" />
                  全部已读
                </button>
              )}
              <button onClick={fetchNotifications} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab 栏 ────────────────────────────────────────────────────── */}
      <div className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* ═══════════════ Tab: 全部通知 ═══════════════ */}
        {activeTab === 'all' && (
          <div className="space-y-4">
            {/* 筛选栏 */}
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="w-4 h-4" />
                  筛选:
                </div>
                <select
                  value={filterCategory}
                  onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
                  className="text-sm border rounded-lg px-3 py-1.5 bg-card"
                >
                  <option value="">全部分类</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <select
                  value={filterRead}
                  onChange={e => { setFilterRead(e.target.value as any); setPage(1); }}
                  className="text-sm border rounded-lg px-3 py-1.5 bg-card"
                >
                  <option value="">全部状态</option>
                  <option value="false">未读</option>
                  <option value="true">已读</option>
                </select>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterArchived}
                    onChange={e => { setFilterArchived(e.target.checked); setPage(1); }}
                    className="rounded"
                  />
                  已归档
                </label>

                <div className="flex-1" />

                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">已选 {selectedIds.size} 条</span>
                    <button onClick={batchMarkRead} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100">
                      批量已读
                    </button>
                  </div>
                )}

                <span className="text-sm text-muted-foreground">共 {total} 条</span>
              </div>
            </div>

            {/* 通知列表 */}
            <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
              {loading && notifications.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
                  加载中...
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-20 text-center">
                  <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">暂无通知</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {notifications.map(n => (
                    <div
                      key={n._id}
                      className={`flex items-start gap-4 px-5 py-4 hover:bg-secondary/50/50 transition-colors ${
                        !n.read ? 'bg-blue-50/20' : ''
                      }`}
                    >
                      {/* 选择框 */}
                      <input
                        type="checkbox"
                        checked={selectedIds.has(n._id)}
                        onChange={() => toggleSelect(n._id)}
                        className="mt-2 rounded"
                      />

                      {/* 图标 */}
                      {renderIcon(n.icon, n.color)}

                      {/* 内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {n.title}
                          </span>
                          {n.priority === 'urgent' && (
                            <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded font-medium">紧急</span>
                          )}
                          {n.priority === 'important' && (
                            <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-medium">重要</span>
                          )}
                          {!n.read && (
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                          )}
                        </div>
                        {n.content && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.content}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                            COLOR_MAP[CATEGORY_LABELS[n.category]?.color || 'gray'] || 'bg-secondary/50 text-muted-foreground'
                          }`}>
                            {CATEGORY_LABELS[n.category]?.label || n.category}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{n.typeLabel}</span>
                          <span className="text-[11px] text-muted-foreground">{formatTime(n.createdAt)}</span>
                        </div>
                      </div>

                      {/* 操作 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!n.read && (
                          <button
                            onClick={() => markRead(n._id)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-muted-foreground hover:text-blue-500 transition-colors"
                            title="标记已读"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => archiveNotification(n._id)}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-muted-foreground hover:text-amber-500 transition-colors"
                          title="归档"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteNotification(n._id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t bg-secondary/50/50">
                  <span className="text-sm text-muted-foreground">
                    第 {page}/{totalPages} 页，共 {total} 条
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 rounded hover:bg-secondary disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 rounded hover:bg-secondary disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════ Tab: 发送公告 ═══════════════ */}
        {activeTab === 'send' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-card rounded-xl shadow-sm border p-6 space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <Megaphone className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-foreground">发送系统公告</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">公告标题 *</label>
                <input
                  type="text"
                  value={sendForm.title}
                  onChange={e => setSendForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="输入公告标题"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">公告内容</label>
                <textarea
                  value={sendForm.content}
                  onChange={e => setSendForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="输入公告内容..."
                  rows={5}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">接收角色</label>
                  <select
                    value={sendForm.recipientRole}
                    onChange={e => setSendForm(prev => ({ ...prev, recipientRole: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="all">全体用户</option>
                    <option value="admin">管理员</option>
                    <option value="frontdesk">前台</option>
                    <option value="caddy_master">球童管理</option>
                    <option value="proshop">专卖店</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">优先级</label>
                  <select
                    value={sendForm.priority}
                    onChange={e => setSendForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="normal">普通</option>
                    <option value="important">重要</option>
                    <option value="urgent">紧急</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setSendForm({ title: '', content: '', recipientRole: 'all', priority: 'normal' })}
                  className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                >
                  重置
                </button>
                <button
                  onClick={sendAnnouncement}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-sm transition-all"
                >
                  <Send className="w-4 h-4" />
                  发送公告
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ Tab: 通知统计 ═══════════════ */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: '总通知数', value: stats?.total || 0, icon: Bell, color: 'blue' },
                { label: '未读通知', value: stats?.unread || 0, icon: EyeOff, color: 'red' },
                { label: '今日新增', value: stats?.todayCount || 0, icon: Calendar, color: 'emerald' },
                {
                  label: '已读率',
                  value: stats?.total ? `${Math.round(((stats.total - (stats.unread || 0)) / stats.total) * 100)}%` : '0%',
                  icon: Eye,
                  color: 'purple',
                },
              ].map((card, i) => (
                <div key={i} className="bg-card rounded-xl shadow-sm border p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{card.label}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${COLOR_MAP[card.color] || 'bg-secondary/50'}`}>
                      <card.icon className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 按分类统计 */}
            <div className="bg-card rounded-xl shadow-sm border p-6">
              <h3 className="text-base font-bold text-foreground mb-4">按分类统计</h3>
              <div className="grid grid-cols-4 gap-4">
                {Object.entries(CATEGORY_LABELS).map(([key, info]) => {
                  const catStats = stats?.byCategory?.[key];
                  return (
                    <div key={key} className={`rounded-lg border p-4 ${COLOR_MAP[info.color] || 'bg-secondary/50'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <info.icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{info.label}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-bold">{catStats?.total || 0}</span>
                        {(catStats?.unread || 0) > 0 && (
                          <span className="text-xs opacity-70">({catStats?.unread} 未读)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 按优先级统计 */}
            <div className="bg-card rounded-xl shadow-sm border p-6">
              <h3 className="text-base font-bold text-foreground mb-4">按优先级统计</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { key: 'normal', label: '普通', color: 'bg-secondary text-muted-foreground' },
                  { key: 'important', label: '重要', color: 'bg-amber-100 text-amber-700' },
                  { key: 'urgent', label: '紧急', color: 'bg-red-100 text-red-700' },
                ].map(p => (
                  <div key={p.key} className={`rounded-lg p-4 ${p.color}`}>
                    <p className="text-sm font-medium mb-1">{p.label}</p>
                    <p className="text-2xl font-bold">{stats?.byPriority?.[p.key] || 0}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
