import { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGlassTheme } from '../components/ui/Glass';
import { LayoutDashboard, Users, Dumbbell, CalendarCheck, FileText, LogOut, Menu, X, UserCircle, CreditCard, ClipboardList, ShieldCheck, Clock, UserPlus, ListChecks, UserCheck, Settings2, Settings, PanelLeftClose, PanelLeftOpen, Search, ArrowUpRight } from 'lucide-react';

const GROUPS = [
  { label: 'Overview', items: [{ name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'receptionist', 'trainer', 'member'] }] },
  { label: 'People', items: [
    { name: 'Members', path: '/members', icon: Users, roles: ['admin', 'receptionist'] },
    { name: 'Trainers', path: '/trainers', icon: UserCircle, roles: ['admin', 'receptionist', 'trainer', 'member'] },
    { name: 'Trainer rosters', path: '/trainer-assignments', icon: UserCheck, roles: ['admin', 'receptionist'] },
  ] },
  { label: 'Training', items: [
    { name: 'Workouts', path: '/workouts', icon: Dumbbell, roles: ['admin', 'trainer', 'member'] },
    { name: 'Exercises', path: '/exercises', icon: ListChecks, roles: ['admin', 'trainer', 'member'] },
    { name: 'Classes', path: '/classes', icon: CalendarCheck, roles: ['admin', 'receptionist', 'trainer', 'member'] },
    { name: 'Manage classes', path: '/class-management', icon: Settings2, roles: ['admin'] },
  ] },
  { label: 'Operations', items: [
    { name: 'Attendance', path: '/attendance', icon: Clock, roles: ['admin', 'receptionist'] },
    { name: 'Subscriptions', path: '/subscriptions', icon: ShieldCheck, roles: ['admin', 'receptionist'] },
    { name: 'Plans', path: '/plans', icon: ClipboardList, roles: ['admin', 'receptionist', 'member'] },
    { name: 'Payments', path: '/payments', icon: CreditCard, roles: ['admin', 'receptionist'] },
  ] },
  { label: 'Insights', items: [{ name: 'Reports', path: '/reports', icon: FileText, roles: ['admin'] }] },
  { label: 'Administration', items: [
    { name: 'Pending approvals', path: '/admin/approvals', icon: UserPlus, roles: ['admin'] },
    { name: 'Account', path: '/account', icon: Settings, roles: ['admin', 'receptionist', 'trainer', 'member'] },
  ] },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  useGlassTheme({ accent: '#c7ff35', blur: 12 });
  const groups = GROUPS.map(group => ({ ...group, items: group.items.filter(item => item.roles.includes(user?.role)) })).filter(group => group.items.length);
  const active = groups.flatMap(group => group.items).find(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  const staff = ['admin', 'receptionist'].includes(user?.role);
  const closeMobile = () => setMobileOpen(false);
  const handleLogout = () => { void logout(); navigate('/login'); };
  const handleSearch = event => { event.preventDefault(); if (staff && search.trim()) { navigate(`/members?search=${encodeURIComponent(search.trim())}`); setSearch(''); } };

  return <div className={`app-shell ${collapsed ? 'app-shell-collapsed' : ''}`}>
    {mobileOpen && <button type="button" className="app-sidebar-scrim" onClick={closeMobile} aria-label="Close navigation" />}
    <aside className={`app-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Application navigation">
      <div className="app-sidebar-top"><Link to="/dashboard" className="app-logo" onClick={closeMobile}><span className="app-logo-symbol"><Dumbbell size={21} /></span>{(!collapsed || mobileOpen) && <span>GYMVERSE<span>.</span></span>}</Link><button type="button" className="app-sidebar-close" onClick={closeMobile} aria-label="Close navigation"><X size={20} /></button></div>
      <nav className="app-nav">{groups.map(group => <div className="app-nav-group" key={group.label}>{(!collapsed || mobileOpen) && <p>{group.label}</p>}{group.items.map(item => <Link key={item.path} to={item.path} onClick={closeMobile} title={collapsed ? item.name : undefined} aria-current={active?.path === item.path ? 'page' : undefined} className={`app-nav-link ${active?.path === item.path ? 'is-active' : ''}`}><item.icon size={18} strokeWidth={1.9} /><span>{item.name}</span></Link>)}</div>)}</nav>
      <div className="app-sidebar-bottom">{(!collapsed || mobileOpen) && <div className="app-sidebar-promo"><span>KEEP MOVING FORWARD</span><strong>Your next session starts here.</strong><Link to="/classes" onClick={closeMobile}>Explore classes <ArrowUpRight size={15} /></Link></div>}<button type="button" onClick={handleLogout} className="app-nav-link app-logout"><LogOut size={18} /><span>Sign out</span></button></div>
    </aside>
    <div className="app-content"><header className="app-topbar"><button type="button" className="app-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={23} /></button><button type="button" className="app-collapse-button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button><div className="app-breadcrumb"><span>GYMVERSE / {user?.role?.toUpperCase()}</span><strong>{active?.name || 'Overview'}</strong></div>{staff && <form className="app-search" role="search" onSubmit={handleSearch}><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search members" aria-label="Search members" /></form>}<Link to="/account" className="app-user" aria-label="Account settings"><span className="app-user-copy"><strong>{user?.email}</strong><small>{user?.role}</small></span><span className="app-avatar">{(user?.email || '?').charAt(0).toUpperCase()}</span></Link></header><main key={location.pathname + location.search} className="app-main"><Outlet /></main></div>
  </div>;
}
