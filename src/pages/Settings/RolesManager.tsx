import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Shield, Plus, Trash2, Edit3, Check, X, RefreshCw,
  Lock, Eye, FilePlus, Pencil, ChevronDown, ChevronRight,
  Zap, ScrollText, Search
} from 'lucide-react'
import { api } from '@/utils/api'

/* ========== 模块中文名 ========== */
const MODULE_LABELS: Record<string, string> = {
  bookings: '预订管理', players: '球员管理', resources: '资源管理',
  carts: '球车管理', folios: '账单管理', dining: '餐饮管理',
  rooms: '客房管理', lockers: '更衣柜管理', reports: '报表分析',
  daily_close: '日结/夜审', settings: '系统设置', roles: '权限管理',
}

const ACTION_LABELS: Record<string, { label: string; icon: any }> = {
  view:   { label: '查看', icon: Eye },
  create: { label: '创建', icon: FilePlus },
  edit:   { label: '编辑', icon: Pencil },
  delete: { label: '删除', icon: Trash2 },
}

const ACTIONS = ['view', 'create', 'edit', 'delete']
const MODULES = Object.keys(MODULE_LABELS)

interface Role {
  _id: string
  code: string
  name: string
  description: string
  isSystem: boolean
  permissions: Record<string, Record<string, boolean>>
  status: string
}

export default function RolesManager() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newRole, setNewRole] = useState({ code: '', name: '', description: '' })
  const [activeTab, setActiveTab] = useState<'roles' | 'audit'>('roles')
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditFilter, setAuditFilter] = useState({ module: '', startDate: '' })

  const loadRoles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.roles.getList()
      setRoles(res.data || [])
    } catch (e: any) {
      console.error('加载角色失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true)
    try {
      const params: any = { pageSize: 100 }
      if (auditFilter.module) params.module = auditFilter.module
      if (auditFilter.startDate) params.startDate = auditFilter.startDate
      const res = await api.auditLogs.getList(params)
      setAuditLogs(res.data?.list || [])
    } catch (e: any) {
      console.error('加载审计日志失败:', e)
    } finally {
      setAuditLoading(false)
    }
  }, [auditFilter])

  useEffect(() => { loadRoles() }, [loadRoles])
  useEffect(() => { if (activeTab === 'audit') loadAuditLogs() }, [activeTab, loadAuditLogs])

  /* ========== 初始化 ========== */
  const handleSeed = async () => {
    try {
      const res: any = await api.roles.seed()
      toast.success(res.message || '初始化完成')
      loadRoles()
    } catch (e: any) {
      toast.error('初始化失败')
    }
  }

  /* ========== 创建角色 ========== */
  const handleCreate = async () => {
    if (!newRole.code || !newRole.name) { toast.error('编码和名称必填'); return }
    try {
      await api.roles.create({ ...newRole, permissions: {} })
      toast.success('创建成功')
      setShowCreate(false)
      setNewRole({ code: '', name: '', description: '' })
      loadRoles()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '创建失败')
    }
  }

  /* ========== 删除角色 ========== */
  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此角色？')) return
    try {
      await api.roles.remove(id)
      toast.success('删除成功')
      loadRoles()
      if (editingRole?._id === id) setEditingRole(null)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '删除失败')
    }
  }

  /* ========== 保存权限 ========== */
  const handleSavePermissions = async () => {
    if (!editingRole) return
    try {
      await api.roles.update(editingRole._id, { permissions: editingRole.permissions })
      toast.success('权限保存成功')
      loadRoles()
    } catch {
      toast.error('保存失败')
    }
  }

  /* ========== 切换权限 ========== */
  const togglePerm = (module: string, action: string) => {
    if (!editingRole) return
    setEditingRole(prev => {
      if (!prev) return prev
      const newPerms = { ...prev.permissions }
      if (!newPerms[module]) newPerms[module] = {}
      newPerms[module] = { ...newPerms[module], [action]: !newPerms[module][action] }
      return { ...prev, permissions: newPerms }
    })
  }

  /* ========== 全选/全不选模块 ========== */
  const toggleModule = (module: string) => {
    if (!editingRole) return
    const allOn = ACTIONS.every(a => editingRole.permissions[module]?.[a])
    setEditingRole(prev => {
      if (!prev) return prev
      const newPerms = { ...prev.permissions }
      newPerms[module] = Object.fromEntries(ACTIONS.map(a => [a, !allOn]))
      return { ...prev, permissions: newPerms }
    })
  }

  return (
    <div className="space-y-6">
      {/* 子 Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
          <button onClick={() => setActiveTab('roles')}
            className={`px-3 py-1.5 text-xs rounded-md ${activeTab === 'roles' ? 'bg-card shadow text-indigo-600 font-medium' : 'text-muted-foreground'}`}>
            <Shield size={14} className="inline mr-1" /> 角色管理
          </button>
          <button onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 text-xs rounded-md ${activeTab === 'audit' ? 'bg-card shadow text-indigo-600 font-medium' : 'text-muted-foreground'}`}>
            <ScrollText size={14} className="inline mr-1" /> 审计日志
          </button>
        </div>
        {activeTab === 'roles' && (
          <div className="flex gap-2">
            {roles.length === 0 && (
              <button onClick={handleSeed} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700">
                <Zap size={14} /> 一键初始化默认角色
              </button>
            )}
            <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-white rounded-lg text-xs hover:bg-success/90">
              <Plus size={14} /> 新增角色
            </button>
          </div>
        )}
      </div>

      {/* ================ 角色管理 ================ */}
      {activeTab === 'roles' && (
        <div className="flex gap-6">
          {/* 左侧：角色列表 */}
          <div className="w-64 shrink-0 space-y-2">
            {loading && <div className="text-center py-10 text-muted-foreground text-sm">加载中...</div>}

            {/* 创建表单 */}
            {showCreate && (
              <div className="bg-indigo-50 rounded-xl p-3 space-y-2 border border-indigo-200">
                <input value={newRole.code} onChange={e => setNewRole(p => ({ ...p, code: e.target.value }))}
                  placeholder="角色编码 (英文)" className="w-full border rounded px-2 py-1 text-xs" />
                <input value={newRole.name} onChange={e => setNewRole(p => ({ ...p, name: e.target.value }))}
                  placeholder="角色名称" className="w-full border rounded px-2 py-1 text-xs" />
                <input value={newRole.description} onChange={e => setNewRole(p => ({ ...p, description: e.target.value }))}
                  placeholder="描述（可选）" className="w-full border rounded px-2 py-1 text-xs" />
                <div className="flex gap-2">
                  <button onClick={handleCreate} className="flex-1 bg-indigo-600 text-white rounded text-xs py-1 hover:bg-indigo-700">创建</button>
                  <button onClick={() => setShowCreate(false)} className="px-3 bg-secondary rounded text-xs py-1">取消</button>
                </div>
              </div>
            )}

            {roles.map(role => (
              <div key={role._id}
                onClick={() => setEditingRole({ ...role })}
                className={`rounded-xl p-3 cursor-pointer transition-all ${editingRole?._id === role._id ? 'bg-indigo-50 border-indigo-300 border shadow-sm' : 'bg-card border border-border hover:border-border'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {role.isSystem && <Lock size={12} className="text-muted-foreground" />}
                    <span className="text-sm font-medium text-foreground">{role.name}</span>
                  </div>
                  {!role.isSystem && (
                    <button onClick={e => { e.stopPropagation(); handleDelete(role._id) }}
                      className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{role.description}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{role.code}</div>
              </div>
            ))}
          </div>

          {/* 右侧：权限矩阵编辑器 */}
          <div className="flex-1 min-w-0">
            {!editingRole ? (
              <div className="bg-secondary/50 rounded-xl p-10 text-center text-muted-foreground">
                <Shield size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">选择左侧角色以编辑权限</p>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="bg-secondary/50 px-4 py-3 flex items-center justify-between border-b">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {editingRole.name} - 权限矩阵
                    </h3>
                    <p className="text-xs text-muted-foreground">{editingRole.description}</p>
                  </div>
                  <button onClick={handleSavePermissions}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700">
                    <Check size={14} /> 保存权限
                  </button>
                </div>

                {/* 权限表格 */}
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-secondary/50">
                        <th className="text-left px-4 py-2 text-muted-foreground font-medium w-40">模块</th>
                        {ACTIONS.map(a => {
                          const info = ACTION_LABELS[a]
                          return (
                            <th key={a} className="text-center px-2 py-2 text-muted-foreground font-medium w-20">
                              <div className="flex flex-col items-center gap-0.5">
                                <info.icon size={14} />
                                <span className="text-[10px]">{info.label}</span>
                              </div>
                            </th>
                          )
                        })}
                        <th className="text-center px-2 py-2 text-muted-foreground font-medium w-16">全选</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map(mod => {
                        const allOn = ACTIONS.every(a => editingRole.permissions[mod]?.[a])
                        const someOn = ACTIONS.some(a => editingRole.permissions[mod]?.[a])
                        return (
                          <tr key={mod} className="border-b border-border/50 hover:bg-secondary/50">
                            <td className="px-4 py-2.5 text-foreground font-medium">{MODULE_LABELS[mod]}</td>
                            {ACTIONS.map(a => {
                              const on = editingRole.permissions[mod]?.[a]
                              return (
                                <td key={a} className="text-center px-2 py-2.5">
                                  <button onClick={() => togglePerm(mod, a)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${on ? 'bg-indigo-100 text-indigo-600' : 'bg-secondary text-muted-foreground hover:bg-secondary'}`}>
                                    {on ? <Check size={14} /> : <X size={12} />}
                                  </button>
                                </td>
                              )
                            })}
                            <td className="text-center px-2 py-2.5">
                              <button onClick={() => toggleModule(mod)}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${allOn ? 'bg-green-100 text-green-600' : someOn ? 'bg-yellow-100 text-yellow-600' : 'bg-secondary text-muted-foreground hover:bg-secondary'}`}>
                                <Check size={14} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================ 审计日志 ================ */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* 过滤器 */}
          <div className="flex items-center gap-3 flex-wrap">
            <select value={auditFilter.module} onChange={e => setAuditFilter(p => ({ ...p, module: e.target.value }))}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">全部模块</option>
              {MODULES.map(m => <option key={m} value={m}>{MODULE_LABELS[m]}</option>)}
            </select>
            <input type="date" value={auditFilter.startDate} onChange={e => setAuditFilter(p => ({ ...p, startDate: e.target.value }))}
              className="border rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={loadAuditLogs} className="p-2 hover:bg-secondary rounded-lg">
              <RefreshCw size={14} className={auditLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* 日志列表 */}
          {auditLoading && <div className="text-center py-10 text-muted-foreground text-sm">加载中...</div>}
          {!auditLoading && auditLogs.length === 0 && <div className="text-center py-10 text-muted-foreground text-sm">暂无审计日志</div>}

          <div className="space-y-2">
            {auditLogs.map((log: any) => (
              <div key={log._id} className="bg-card rounded-xl p-3 border border-border flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                  <ScrollText size={14} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-foreground font-medium truncate">{log.description}</div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString('zh-CN') : '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="bg-secondary px-1.5 py-0.5 rounded">{MODULE_LABELS[log.module] || log.module}</span>
                    <span>{log.action}</span>
                    <span>{log.operatorName || '系统'}</span>
                    {log.ip && <span className="font-mono">{log.ip}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
