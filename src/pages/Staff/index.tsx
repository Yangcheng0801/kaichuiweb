/**
 * 员工排班与考勤管理页面
 *
 * Tabs: 员工档案 | 部门管理 | 班次模板 | 排班表 | 考勤管理 | 请假审批 | 工时统计
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Building2, Clock, CalendarDays, ClipboardCheck,
  FileText, BarChart3, Plus, Search, RefreshCw, Edit2,
  Trash2, ChevronLeft, ChevronRight, Check, X, UserPlus,
  Calendar, AlertTriangle, Zap, ArrowRightLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../utils/api';

export default function Staff() {
  const [activeTab, setActiveTab] = useState<'employees' | 'departments' | 'shifts' | 'schedule' | 'attendance' | 'leaves' | 'stats'>('employees');

  const tabs = [
    { id: 'employees' as const,   label: '员工档案', icon: Users },
    { id: 'departments' as const, label: '部门管理', icon: Building2 },
    { id: 'shifts' as const,      label: '班次模板', icon: Clock },
    { id: 'schedule' as const,    label: '排班表',   icon: CalendarDays },
    { id: 'attendance' as const,  label: '考勤管理', icon: ClipboardCheck },
    { id: 'leaves' as const,      label: '请假审批', icon: FileText },
    { id: 'stats' as const,       label: '工时统计', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/50 to-violet-50/30">
      <div className="bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center text-primary-foreground">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">员工排班与考勤</h1>
              <p className="text-sm text-muted-foreground">档案、排班、打卡、请假、工时一站式管理</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id ? 'border-violet-600 text-violet-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                <tab.icon className="w-4 h-4" />{tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'employees' && <EmployeesTab />}
        {activeTab === 'departments' && <DepartmentsTab />}
        {activeTab === 'shifts' && <ShiftsTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'attendance' && <AttendanceTab />}
        {activeTab === 'leaves' && <LeavesTab />}
        {activeTab === 'stats' && <StatsTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════ 员工档案 ═══════════════════════ */
function EmployeesTab() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({
    name: '', caddyNo: '', phone: '', gender: '', departmentId: '', departmentName: '',
    position: '', contractType: 'fulltime', hireDate: '',
    hourlyRate: '', baseSalary: '', outingFee: '', skills: '',
    emergencyContact: '', emergencyPhone: '', address: '', notes: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, dRes]: any[] = await Promise.all([
        api.staff.getEmployees({ keyword, departmentId: filterDept || undefined, pageSize: 100 }),
        api.staff.getDepartments(),
      ]);
      if (eRes.success) setEmployees(eRes.data || []);
      if (dRes.success) setDepartments(dRes.data || []);
    } catch {} finally { setLoading(false); }
  }, [keyword, filterDept]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('姓名必填'); return; }
    try {
      const data = {
        ...form,
        hourlyRate: Number(form.hourlyRate) || 0,
        baseSalary: Number(form.baseSalary) || 0,
        outingFee: Number(form.outingFee) || 0,
        skills: form.skills ? form.skills.split(',').map(s => s.trim()) : [],
      };
      if (editItem) { await api.staff.updateEmployee(editItem._id, data); toast.success('更新成功'); }
      else { await api.staff.createEmployee(data); toast.success('员工创建成功'); }
      setShowForm(false); setEditItem(null); resetForm(); fetchData();
    } catch { toast.error('操作失败'); }
  };

  const resetForm = () => setForm({ name: '', caddyNo: '', phone: '', gender: '', departmentId: '', departmentName: '', position: '', contractType: 'fulltime', hireDate: '', hourlyRate: '', baseSalary: '', outingFee: '', skills: '', emergencyContact: '', emergencyPhone: '', address: '', notes: '' });

  const handleEdit = (e: any) => {
    setEditItem(e);
    setForm({
      name: e.name || '', caddyNo: (e.caddyNo || '').toString(), phone: e.phone || '', gender: e.gender || '',
      departmentId: e.departmentId || '', departmentName: e.departmentName || '',
      position: e.position || '', contractType: e.contractType || 'fulltime',
      hireDate: e.hireDate || '', hourlyRate: String(e.hourlyRate || ''),
      baseSalary: String(e.baseSalary || ''), outingFee: String(e.outingFee || ''),
      skills: (e.skills || []).join(', '),
      emergencyContact: e.emergencyContact || '', emergencyPhone: e.emergencyPhone || '',
      address: e.address || '', notes: e.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认将该员工标记为离职？')) return;
    try { await api.staff.deleteEmployee(id); toast.success('已处理'); fetchData(); } catch { toast.error('失败'); }
  };

  const contractLabels: Record<string, string> = { fulltime: '全职', parttime: '兼职', temp: '临时', intern: '实习' };
  const statusColors: Record<string, string> = { active: 'bg-green-50 text-green-600', resigned: 'bg-secondary text-muted-foreground', suspended: 'bg-red-50 text-red-600' };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索姓名/球童号/电话..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
          </div>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="text-sm border rounded-lg px-3 py-2">
            <option value="">全部部门</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <div className="flex-1" />
          <button onClick={() => { setEditItem(null); resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700 shadow-sm">
            <UserPlus className="w-4 h-4" /> 新增员工
          </button>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-secondary">
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl shadow-sm border p-6">
          <h3 className="font-bold text-foreground mb-4">{editItem ? '编辑员工' : '新增员工'}</h3>
            <div className="grid grid-cols-4 gap-4">
            <div><label className="block text-xs text-muted-foreground mb-1">姓名 *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">球童号</label>
              <input value={form.caddyNo} onChange={e => setForm(f => ({ ...f, caddyNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如: 18" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">电话</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">性别</label>
              <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">-</option><option value="male">男</option><option value="female">女</option>
              </select></div>
            <div><label className="block text-xs text-muted-foreground mb-1">部门</label>
              <select value={form.departmentId} onChange={e => {
                const d = departments.find(dd => dd._id === e.target.value);
                setForm(f => ({ ...f, departmentId: e.target.value, departmentName: d?.name || '' }));
              }} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">选择部门</option>
                {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select></div>
            <div><label className="block text-xs text-muted-foreground mb-1">岗位</label>
              <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如: 球童A级" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">合同类型</label>
              <select value={form.contractType} onChange={e => setForm(f => ({ ...f, contractType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="fulltime">全职</option><option value="parttime">兼职</option><option value="temp">临时工</option><option value="intern">实习</option>
              </select></div>
            <div><label className="block text-xs text-muted-foreground mb-1">入职日期</label>
              <input type="date" value={form.hireDate} onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">技能标签</label>
              <input value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="逗号分隔" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">基本月薪 (¥)</label>
              <input type="number" value={form.baseSalary} onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">时薪 (¥/h)</label>
              <input type="number" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">出场费 (¥/次)</label>
              <input type="number" value={form.outingFee} onChange={e => setForm(f => ({ ...f, outingFee: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="球童专用" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">紧急联系人</label>
              <input value={form.emergencyContact} onChange={e => setForm(f => ({ ...f, emergencyContact: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
            <button onClick={handleSubmit} className="px-5 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700">{editItem ? '保存' : '创建'}</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        {employees.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground"><Users className="w-10 h-10 text-muted-foreground mx-auto mb-2" />暂无员工</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">球童号</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">姓名</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">部门</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">岗位</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">合同</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">电话</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">工时(h)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">迟到</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">状态</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {employees.map(e => (
                <tr key={e._id} className="hover:bg-secondary/50/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.caddyNo || '-'}</td>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.departmentName || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.position || '-'}</td>
                  <td className="px-4 py-3 text-center text-xs">{contractLabels[e.contractType] || e.contractType}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.phone || '-'}</td>
                  <td className="px-4 py-3 text-right">{e.totalWorkHours || 0}</td>
                  <td className="px-4 py-3 text-right">{e.lateCount || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[e.status] || 'bg-secondary'}`}>
                      {e.status === 'active' ? '在职' : e.status === 'resigned' ? '离职' : e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(e)} className="p-1.5 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(e._id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ 部门管理 ═══════════════════════ */
function DepartmentsTab() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: '', headName: '', headPhone: '', description: '' });

  const fetch = useCallback(async () => {
    try { const r: any = await api.staff.getDepartments(); if (r.success) setDepartments(r.data || []); } catch {}
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('部门名称必填'); return; }
    try {
      if (editItem) { await api.staff.updateDepartment(editItem._id, form); toast.success('更新成功'); }
      else { await api.staff.createDepartment(form); toast.success('创建成功'); }
      setShowForm(false); setEditItem(null); setForm({ name: '', headName: '', headPhone: '', description: '' }); fetch();
    } catch { toast.error('失败'); }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => { setEditItem(null); setForm({ name: '', headName: '', headPhone: '', description: '' }); setShowForm(true); }}
        className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700 shadow-sm">
        <Plus className="w-4 h-4" /> 新增部门
      </button>
      {showForm && (
        <div className="bg-card rounded-xl shadow-sm border p-6">
          <h3 className="font-bold mb-4">{editItem ? '编辑部门' : '新增部门'}</h3>
          <div className="grid grid-cols-4 gap-4">
            <div><label className="block text-xs text-muted-foreground mb-1">名称 *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">负责人</label><input value={form.headName} onChange={e => setForm(f => ({ ...f, headName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">电话</label><input value={form.headPhone} onChange={e => setForm(f => ({ ...f, headPhone: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">描述</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
            <button onClick={handleSubmit} className="px-5 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700">{editItem ? '保存' : '创建'}</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        {departments.map(d => (
          <div key={d._id} className="bg-card rounded-xl shadow-sm border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-violet-500" /><h3 className="font-bold text-foreground">{d.name}</h3></div>
              <div className="flex gap-1">
                <button onClick={() => { setEditItem(d); setForm({ name: d.name, headName: d.headName || '', headPhone: d.headPhone || '', description: d.description || '' }); setShowForm(true); }} className="p-1 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-500"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={async () => { if (confirm('删除？')) { await api.staff.deleteDepartment(d._id); fetch(); } }} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>负责人: {d.headName || '-'}</p>
              <p>员工数: {d.employeeCount || 0} 人</p>
              {d.description && <p className="text-xs text-muted-foreground mt-1">{d.description}</p>}
            </div>
          </div>
        ))}
        {departments.length === 0 && <div className="col-span-3 py-12 text-center text-muted-foreground">暂无部门</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════ 班次模板 ═══════════════════════ */
function ShiftsTab() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', startTime: '', endTime: '', breakMinutes: '30', color: '#3B82F6', minStaff: '1', maxStaff: '10', notes: '' });

  const fetch = useCallback(async () => {
    try { const r: any = await api.staff.getShifts(); if (r.success) setShifts(r.data || []); } catch {}
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  const handleSubmit = async () => {
    if (!form.name || !form.startTime || !form.endTime) { toast.error('名称和时间必填'); return; }
    try {
      await api.staff.createShift({ ...form, breakMinutes: Number(form.breakMinutes), minStaff: Number(form.minStaff), maxStaff: Number(form.maxStaff) });
      toast.success('班次创建成功'); setShowForm(false);
      setForm({ name: '', startTime: '', endTime: '', breakMinutes: '30', color: '#3B82F6', minStaff: '1', maxStaff: '10', notes: '' }); fetch();
    } catch { toast.error('失败'); }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(true)}
        className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700 shadow-sm">
        <Plus className="w-4 h-4" /> 新增班次
      </button>
      {showForm && (
        <div className="bg-card rounded-xl shadow-sm border p-6">
          <h3 className="font-bold mb-4">新增班次模板</h3>
          <div className="grid grid-cols-4 gap-4">
            <div><label className="block text-xs text-muted-foreground mb-1">名称 *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如: 早班A" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">开始时间 *</label><input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">结束时间 *</label><input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">休息(分钟)</label><input type="number" value={form.breakMinutes} onChange={e => setForm(f => ({ ...f, breakMinutes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">颜色</label><input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-full border rounded-lg px-1 py-1 h-[38px]" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">最少人数</label><input type="number" value={form.minStaff} onChange={e => setForm(f => ({ ...f, minStaff: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">最多人数</label><input type="number" value={form.maxStaff} onChange={e => setForm(f => ({ ...f, maxStaff: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">备注</label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
            <button onClick={handleSubmit} className="px-5 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700">创建</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        {shifts.map(s => (
          <div key={s._id} className="bg-card rounded-xl shadow-sm border p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || '#3B82F6' }} />
              <h3 className="font-bold text-foreground">{s.name}</h3>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="text-lg font-bold text-foreground">{s.startTime} — {s.endTime}</p>
              <p>工时: {s.workHours}h (休息 {s.breakMinutes}分钟)</p>
              <p>人数: {s.minStaff}~{s.maxStaff}人</p>
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={async () => { if (confirm('删除？')) { await api.staff.deleteShift(s._id); fetch(); } }} className="text-xs text-red-500 hover:text-red-700">删除</button>
            </div>
          </div>
        ))}
        {shifts.length === 0 && <div className="col-span-3 py-12 text-center text-muted-foreground">暂无班次模板</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════ 排班表 ═══════════════════════ */
function ScheduleTab() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().slice(0, 10);
  });

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
  const weekEnd = weekDates[6];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, eRes, shRes]: any[] = await Promise.all([
        api.staff.getSchedules({ startDate: weekStart, endDate: weekEnd }),
        api.staff.getEmployees({ pageSize: 200 }),
        api.staff.getShifts(),
      ]);
      if (sRes.success) setSchedules(sRes.data || []);
      if (eRes.success) setEmployees((eRes.data || []).filter((e: any) => e.status === 'active'));
      if (shRes.success) setShifts(shRes.data || []);
    } catch {} finally { setLoading(false); }
  }, [weekStart, weekEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d.toISOString().slice(0, 10)); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d.toISOString().slice(0, 10)); };

  const autoSchedule = async () => {
    if (!confirm(`确定对 ${weekStart} ~ ${weekEnd} 执行自动排班？`)) return;
    try {
      const res: any = await api.staff.autoSchedule({ startDate: weekStart, endDate: weekEnd });
      if (res.success) { toast.success(res.message); fetchData(); }
    } catch { toast.error('自动排班失败'); }
  };

  const publishSchedules = async () => {
    try {
      const res: any = await api.staff.publishSchedules({ startDate: weekStart, endDate: weekEnd });
      if (res.success) { toast.success(res.message); fetchData(); }
    } catch { toast.error('发布失败'); }
  };

  const deleteSchedule = async (id: string) => {
    try { await api.staff.deleteSchedule(id); fetchData(); } catch {}
  };

  const getCell = (empId: string, date: string) => schedules.filter(s => s.employeeId === empId && s.date === date);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <span className="font-bold text-foreground">{weekStart} ~ {weekEnd}</span>
        <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-secondary"><ChevronRight className="w-4 h-4" /></button>
        <div className="flex-1" />
        <button onClick={autoSchedule} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700 shadow-sm">
          <Zap className="w-4 h-4" /> 自动排班
        </button>
        <button onClick={publishSchedules} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-primary-foreground text-sm rounded-lg hover:bg-green-700 shadow-sm">
          <Check className="w-4 h-4" /> 发布
        </button>
        <button onClick={fetchData} className="p-2 rounded-lg hover:bg-secondary"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      <div className="bg-card rounded-xl shadow-sm border overflow-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-secondary/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-28 sticky left-0 bg-secondary/50 z-10">员工</th>
              {weekDates.map((d, i) => (
                <th key={d} className="text-center px-2 py-2.5 font-medium text-muted-foreground">
                  <div className="text-xs">{d.slice(5)}</div>
                  <div className="text-[10px] text-muted-foreground">周{dayNames[i]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {employees.map(emp => (
              <tr key={emp._id} className="hover:bg-secondary/50/30">
                <td className="px-3 py-2 sticky left-0 bg-card z-10 border-r">
                  <div className="text-sm font-medium">{emp.name}</div>
                  <div className="text-[10px] text-muted-foreground">{emp.position || emp.departmentName}</div>
                </td>
                {weekDates.map(date => {
                  const cells = getCell(emp._id, date);
                  return (
                    <td key={date} className="px-1 py-1 text-center">
                      {cells.length > 0 ? cells.map(c => (
                        <div key={c._id} className="group relative">
                          <div className={`text-[11px] rounded px-1.5 py-1 ${c.status === 'published' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                            {c.shiftName}
                            <div className="text-[9px] opacity-70">{c.startTime}-{c.endTime}</div>
                          </div>
                          <button onClick={() => deleteSchedule(c._id)} className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-primary-foreground rounded-full text-[10px] hidden group-hover:flex items-center justify-center">×</button>
                        </div>
                      )) : (
                        <div className="text-muted-foreground text-xs">-</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">暂无员工数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ 考勤管理 ═══════════════════════ */
function AttendanceTab() {
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, eRes]: any[] = await Promise.all([
        api.staff.getAttendance({ date: dateFilter }),
        api.staff.getEmployees({ pageSize: 200 }),
      ]);
      if (aRes.success) setRecords(aRes.data || []);
      if (eRes.success) setEmployees((eRes.data || []).filter((e: any) => e.status === 'active'));
    } catch {} finally { setLoading(false); }
  }, [dateFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const clockIn = async (emp: any) => {
    try {
      const res: any = await api.staff.recordAttendance({ employeeId: emp._id, employeeName: emp.name, date: dateFilter, action: 'clockIn', operatorName: '管理员' });
      if (res.success) { toast.success(res.message); fetchData(); }
    } catch (e: any) { toast.error(e?.response?.data?.message || '签到失败'); }
  };

  const clockOut = async (emp: any) => {
    try {
      const res: any = await api.staff.recordAttendance({ employeeId: emp._id, employeeName: emp.name, date: dateFilter, action: 'clockOut', operatorName: '管理员' });
      if (res.success) { toast.success(res.message); fetchData(); }
    } catch (e: any) { toast.error(e?.response?.data?.message || '签退失败'); }
  };

  const markStatus = async (emp: any, status: string) => {
    try {
      const res: any = await api.staff.recordAttendance({ employeeId: emp._id, employeeName: emp.name, date: dateFilter, action: 'mark', status, operatorName: '管理员' });
      if (res.success) { toast.success(res.message); fetchData(); }
    } catch (e: any) { toast.error(e?.response?.data?.message || '操作失败'); }
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    normal: { label: '正常', color: 'bg-green-50 text-green-600' },
    late: { label: '迟到', color: 'bg-amber-50 text-amber-600' },
    early: { label: '早退', color: 'bg-orange-50 text-orange-600' },
    late_early: { label: '迟到+早退', color: 'bg-red-50 text-red-600' },
    absent: { label: '旷工', color: 'bg-red-50 text-red-600' },
    leave: { label: '请假', color: 'bg-blue-50 text-blue-600' },
  };

  const getRecord = (empId: string) => records.find(r => r.employeeId === empId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        <button onClick={fetchData} className="p-2 rounded-lg hover:bg-secondary"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        <span className="text-sm text-muted-foreground">已签到: {records.filter(r => r.clockIn).length}/{employees.length}</span>
      </div>

      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">员工</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">班次</th>
              <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">签到</th>
              <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">签退</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">工时</th>
              <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">状态</th>
              <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {employees.map(emp => {
              const rec = getRecord(emp._id);
              const st = statusLabels[rec?.status || ''] || { label: '-', color: 'bg-secondary/50 text-muted-foreground' };
              return (
                <tr key={emp._id} className="hover:bg-secondary/50/50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{emp.name}</div>
                    <div className="text-[11px] text-muted-foreground">{emp.departmentName} · {emp.position}</div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{rec?.shiftName || '-'} {rec?.scheduledStart && `(${rec.scheduledStart}-${rec.scheduledEnd})`}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{rec?.clockInTime || '-'}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{rec?.clockOutTime || '-'}</td>
                  <td className="px-4 py-2.5 text-right">{rec?.workHours ? `${rec.workHours}h` : '-'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {rec?.status && <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {!rec?.clockIn && <button onClick={() => clockIn(emp)} className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100">签到</button>}
                      {rec?.clockIn && !rec?.clockOut && <button onClick={() => clockOut(emp)} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">签退</button>}
                      <button onClick={() => markStatus(emp, 'absent')} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">旷工</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ 请假审批 ═══════════════════════ */
function LeavesTab() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: '', leaveType: 'annual', startDate: '', endDate: '', days: '1', reason: '' });

  const fetch = useCallback(async () => {
    try {
      const [lRes, eRes]: any[] = await Promise.all([api.staff.getLeaves(), api.staff.getEmployees({ pageSize: 200 })]);
      if (lRes.success) setLeaves(lRes.data || []);
      if (eRes.success) setEmployees((eRes.data || []).filter((e: any) => e.status === 'active'));
    } catch {}
  }, []);
  useEffect(() => { fetch(); }, [fetch]);

  const handleSubmit = async () => {
    if (!form.employeeId || !form.startDate || !form.endDate) { toast.error('参数不完整'); return; }
    const emp = employees.find(e => e._id === form.employeeId);
    try {
      await api.staff.createLeave({ ...form, days: Number(form.days), employeeName: emp?.name });
      toast.success('请假申请已提交'); setShowForm(false);
      setForm({ employeeId: '', leaveType: 'annual', startDate: '', endDate: '', days: '1', reason: '' }); fetch();
    } catch (e: any) { toast.error(e?.response?.data?.message || '提交失败'); }
  };

  const handleApprove = async (id: string, approved: boolean) => {
    try {
      const res: any = await api.staff.approveLeave(id, { approved, approvedBy: '管理员' });
      if (res.success) { toast.success(res.message); fetch(); }
    } catch { toast.error('操作失败'); }
  };

  const typeLabels: Record<string, string> = { annual: '年假', sick: '病假', personal: '事假', compensatory: '调休', other: '其他' };
  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '待审批', color: 'bg-amber-50 text-amber-600' },
    approved: { label: '已批准', color: 'bg-green-50 text-green-600' },
    rejected: { label: '已拒绝', color: 'bg-red-50 text-red-600' },
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(true)}
        className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700 shadow-sm">
        <Plus className="w-4 h-4" /> 提交请假
      </button>
      {showForm && (
        <div className="bg-card rounded-xl shadow-sm border p-6">
          <h3 className="font-bold mb-4">提交请假申请</h3>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-xs text-muted-foreground mb-1">员工 *</label>
              <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">选择员工</option>{employees.map(e => <option key={e._id} value={e._id}>{e.name}{e.caddyNo ? ` (${e.caddyNo}号)` : ''}</option>)}
              </select></div>
            <div><label className="block text-xs text-muted-foreground mb-1">假期类型</label>
              <select value={form.leaveType} onChange={e => setForm(f => ({ ...f, leaveType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="annual">年假</option><option value="sick">病假</option><option value="personal">事假</option><option value="compensatory">调休</option><option value="other">其他</option>
              </select></div>
            <div><label className="block text-xs text-muted-foreground mb-1">天数</label>
              <input type="number" value={form.days} onChange={e => setForm(f => ({ ...f, days: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">开始日期</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">结束日期</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">原因</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-secondary rounded-lg">取消</button>
            <button onClick={handleSubmit} className="px-5 py-2 bg-violet-600 text-primary-foreground text-sm rounded-lg hover:bg-violet-700">提交</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        {leaves.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">暂无请假记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">员工</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">类型</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">日期</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">天数</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">原因</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">状态</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {leaves.map(l => {
                const st = statusLabels[l.status] || statusLabels.pending;
                return (
                  <tr key={l._id} className="hover:bg-secondary/50/50">
                    <td className="px-4 py-2.5 font-medium">{l.employeeName}</td>
                    <td className="px-4 py-2.5 text-center text-xs">{typeLabels[l.leaveType] || l.leaveType}</td>
                    <td className="px-4 py-2.5 text-xs">{l.startDate} ~ {l.endDate}</td>
                    <td className="px-4 py-2.5 text-right">{l.days}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs truncate max-w-[160px]">{l.reason || '-'}</td>
                    <td className="px-4 py-2.5 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span></td>
                    <td className="px-4 py-2.5 text-center">
                      {l.status === 'pending' && (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleApprove(l._id, true)} className="p-1.5 rounded hover:bg-green-50 text-green-500"><Check className="w-4 h-4" /></button>
                          <button onClick={() => handleApprove(l._id, false)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ 工时统计 ═══════════════════════ */
function StatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const res: any = await api.staff.getStats({ month }); if (res.success) setStats(res.data); }
      catch {} finally { setLoading(false); }
    })();
  }, [month]);

  if (loading || !stats) return <div className="py-20 text-center text-muted-foreground"><RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />加载中...</div>;

  const s = stats.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '在职员工', value: s.totalEmployees, color: 'violet' },
          { label: '出勤率', value: `${s.overallAttendanceRate}%`, color: 'green' },
          { label: '迟到次数', value: s.totalLateCount, color: 'amber' },
          { label: '旷工次数', value: s.totalAbsentCount, color: 'red' },
        ].map((c, i) => (
          <div key={i} className="bg-card rounded-xl shadow-sm border p-5">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className={`text-2xl font-bold text-${c.color}-600 mt-1`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl shadow-sm border p-5">
        <h3 className="font-bold text-foreground mb-4">按部门统计</h3>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(stats.byDepartment || {}).map(([dept, d]: [string, any]) => (
            <div key={dept} className="bg-violet-50 rounded-lg p-4 border border-violet-200">
              <p className="text-sm font-medium text-violet-700">{dept}</p>
              <p className="text-xl font-bold text-violet-800 mt-1">{d.count} <span className="text-xs font-normal">人</span></p>
              <p className="text-xs text-violet-500 mt-1">总工时: {d.totalHours}h · 出勤率: {d.avgAttendance}%</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 border-b bg-secondary/50/50 font-semibold text-foreground">员工月度明细</div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">球童号</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">姓名</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">部门</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">排班天</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">正常</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">迟到</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">旷工</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">请假</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">工时(h)</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">加班(h)</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">出勤率</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">预估薪资</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {(stats.employeeStats || []).map((e: any) => (
              <tr key={e.employeeId} className="hover:bg-secondary/50/50">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{e.caddyNo || '-'}</td>
                <td className="px-4 py-2 font-medium">{e.name}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{e.department || '-'}</td>
                <td className="px-4 py-2 text-right">{e.scheduledDays}</td>
                <td className="px-4 py-2 text-right text-green-600">{e.normalDays}</td>
                <td className="px-4 py-2 text-right text-amber-600">{e.lateDays}</td>
                <td className="px-4 py-2 text-right text-red-600">{e.absentDays}</td>
                <td className="px-4 py-2 text-right text-blue-600">{e.leaveDays}</td>
                <td className="px-4 py-2 text-right font-medium">{e.totalHours}</td>
                <td className="px-4 py-2 text-right">{e.totalOvertime}</td>
                <td className="px-4 py-2 text-right">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${e.attendanceRate >= 90 ? 'bg-green-50 text-green-600' : e.attendanceRate >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                    {e.attendanceRate}%
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-medium">¥{(e.estimatedPay || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
