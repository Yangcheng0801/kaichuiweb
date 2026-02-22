/**
 * 通知中心组件 — 铃铛 + 下拉面板 + 未读计数
 *
 * 放置在顶部导航栏，提供快速查看最新通知 & 跳转通知中心页面的入口。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, Calendar, Crown, Trophy, Star,
  FileText, Lock, LogIn, Megaphone, ChevronRight, X,
  AlertTriangle, XCircle, RefreshCw, Flag, Gift,
} from 'lucide-react';
import { api } from '../utils/api';

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
  emerald: 'text-success bg-success/10',
  red: 'text-red-500 bg-red-50',
  blue: 'text-blue-500 bg-blue-50',
  amber: 'text-amber-500 bg-amber-50',
  orange: 'text-orange-500 bg-orange-50',
  green: 'text-green-500 bg-green-50',
  purple: 'text-purple-500 bg-purple-50',
  indigo: 'text-indigo-500 bg-indigo-50',
  yellow: 'text-yellow-500 bg-yellow-50',
  cyan: 'text-cyan-500 bg-cyan-50',
  gray: 'text-muted-foreground bg-secondary/50',
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
  sourceType?: string;
  sourceId?: string;
  extra?: Record<string, any>;
  createdAt: string;
}

interface NotificationCenterProps {
  recipientId?: string;
  recipientRole?: string;
  pollInterval?: number;
}

export default function NotificationCenter({
  recipientId,
  recipientRole = 'admin',
  pollInterval = 30000,
}: NotificationCenterProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ─── 获取未读计数 ────────────────────────────────────────────── */
  const fetchUnreadCount = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (recipientId) params.recipientId = recipientId;
      else if (recipientRole) params.recipientRole = recipientRole;

      const res: any = await api.notifications.getUnreadCount(params);
      if (res.success) {
        setUnreadCount(res.data?.total || 0);
      }
    } catch {
      // silent
    }
  }, [recipientId, recipientRole]);

  /* ─── 获取最新通知列表 ────────────────────────────────────────── */
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: 1, pageSize: 10 };
      if (recipientId) params.recipientId = recipientId;
      else if (recipientRole) params.recipientRole = recipientRole;

      const res: any = await api.notifications.getList(params);
      if (res.success) {
        setNotifications(res.data || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [recipientId, recipientRole]);

  /* ─── 轮询 ─────────────────────────────────────────────────── */
  useEffect(() => {
    fetchUnreadCount();
    const timer = setInterval(fetchUnreadCount, pollInterval);
    return () => clearInterval(timer);
  }, [fetchUnreadCount, pollInterval]);

  /* ─── 展开时加载列表 ─────────────────────────────────────────── */
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  /* ─── 点击外部关闭 ──────────────────────────────────────────── */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  /* ─── 标记单条已读 ──────────────────────────────────────────── */
  const markRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  /* ─── 全部标记已读 ──────────────────────────────────────────── */
  const markAllRead = async () => {
    try {
      const params: Record<string, any> = { markAll: true };
      if (recipientId) params.recipientId = recipientId;
      await api.notifications.markReadBatch(params);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  /* ─── 点击通知：跳转 ───────────────────────────────────────── */
  const handleClick = (n: Notification) => {
    if (!n.read) markRead(n._id);

    const routes: Record<string, string> = {
      booking: '/bookings',
      membership: '/memberships',
      tournament: '/tournaments',
      folio: '/bookings',
      points: '/memberships',
      locker: '/lockers',
      room: '/rooms',
    };
    const route = routes[n.sourceType || n.category] || '/notifications';
    setOpen(false);
    navigate(route);
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
    return d.toLocaleDateString('zh-CN');
  };

  /* ─── 渲染图标 ──────────────────────────────────────────────── */
  const renderIcon = (icon: string, color: string) => {
    const Icon = ICON_MAP[icon] || Bell;
    const colors = COLOR_MAP[color] || 'text-muted-foreground bg-secondary/50';
    return (
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colors}`}>
        <Icon className="w-4 h-4" />
      </div>
    );
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* 铃铛按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
        title="通知中心"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-card rounded-xl shadow-2xl border border-border z-50 overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-secondary/50/50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-foreground">通知中心</span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5 inline mr-1" />
                  全部已读
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* 列表 */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">加载中...</div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">暂无通知</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n._id}
                  onClick={() => handleClick(n)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                    !n.read ? 'bg-blue-50/30' : ''
                  }`}
                >
                  {renderIcon(n.icon, n.color)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {n.title}
                      </span>
                      {n.priority === 'urgent' && (
                        <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 rounded">紧急</span>
                      )}
                      {n.priority === 'important' && (
                        <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 rounded">重要</span>
                      )}
                    </div>
                    {n.content && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.content}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">{n.typeLabel}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{formatTime(n.createdAt)}</span>
                    </div>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* 底部 */}
          <div className="border-t px-4 py-2.5 bg-secondary/50/50">
            <button
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              className="w-full flex items-center justify-center gap-1 text-sm text-blue-600 hover:text-blue-800 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              查看全部通知
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
