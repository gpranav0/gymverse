import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppBackdrop from '../components/ui/AppBackdrop';
import { useGlassTheme } from '../components/ui/Glass';
import {
  LayoutDashboard, Users, Dumbbell, CalendarCheck, FileText, LogOut,
  UserCircle, CreditCard, ClipboardList, ShieldCheck, Clock, UserPlus,
  ListChecks, UserCheck, Settings2, Settings,
} from 'lucide-react';

// Paths must not be prefixes of one another: the active item is found with startsWith.
const NAV = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'receptionist', 'trainer', 'member'] },
  { name: 'Members', path: '/members', icon: Users, roles: ['admin', 'receptionist'] },
  { name: 'Trainers', path: '/trainers', icon: UserCircle, roles: ['admin', 'receptionist', 'member'] },
  { name: 'Trainer rosters', path: '/trainer-assignments', icon: UserCheck, roles: ['admin', 'receptionist'] },
  { name: 'Attendance', path: '/attendance', icon: Clock, roles: ['admin', 'receptionist'] },
  { name: 'Subscriptions', path: '/subscriptions', icon: ShieldCheck, roles: ['admin', 'receptionist'] },
  { name: 'Plans', path: '/plans', icon: ClipboardList, roles: ['admin', 'receptionist', 'member'] },
  { name: 'Payments', path: '/payments', icon: CreditCard, roles: ['admin', 'receptionist'] },
  { name: 'Workouts', path: '/workouts', icon: Dumbbell, roles: ['admin', 'trainer', 'member'] },
  { name: 'Exercises', path: '/exercises', icon: ListChecks, roles: ['admin', 'trainer', 'member'] },
  { name: 'Classes', path: '/classes', icon: CalendarCheck, roles: ['admin', 'receptionist', 'trainer', 'member'] },
  { name: 'Manage classes', path: '/class-management', icon: Settings2, roles: ['admin'] },
  { name: 'Reports', path: '/reports', icon: FileText, roles: ['admin'] },
  { name: 'Pending Approvals', path: '/admin/approvals', icon: UserPlus, roles: ['admin'] },
  { name: 'Account', path: '/account', icon: Settings, roles: ['admin', 'receptionist', 'trainer', 'member'] },
];

const TITLES = {
  '/dashboard': 'Dashboard overview',
  '/members': 'Members directory',
  '/trainers': 'Trainers',
  '/trainer-assignments': 'Trainer rosters',
  '/attendance': 'Attendance — today',
  '/subscriptions': 'Subscriptions',
  '/plans': 'Membership plans',
  '/payments': 'Payments',
  '/workouts': 'Workout plans',
  '/exercises': 'Exercise library',
  '/classes': 'Class schedule',
  '/class-management': 'Manage classes',
  '/reports': 'Revenue report',
  '/admin/approvals': 'Pending approvals',
  '/account': 'Account settings',
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useGlassTheme({ accent: '#4d8dff', blur: 18 });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const items = NAV.filter((i) => i.roles.includes(user?.role));
  const active = items.find((i) => location.pathname.startsWith(i.path));
  const initials = (user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="relative flex min-h-screen text-ink">
      <AppBackdrop />

      <aside
        className="sticky top-0 flex h-screen w-[262px] shrink-0 flex-col gap-5 border-r border-white/9 px-4 py-5"
        style={{
          background: 'linear-gradient(180deg, rgb(255 255 255 / .075), rgb(255 255 255 / .022))',
          backdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
          WebkitBackdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-white/8 px-2 pt-1.5 pb-4">
          <div
            className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
            style={{
              background: 'linear-gradient(150deg, var(--gv-accent), #7c5cff)',
              boxShadow: '0 8px 22px -8px var(--gv-accent)',
              animation: 'floatY 6s ease-in-out infinite',
            }}
          >
            <Dumbbell size={19} color="#fff" />
          </div>
          <div>
            <div className="font-display text-[17px] font-bold tracking-[-.2px]">GymVerse</div>
            <div className="text-[11px] text-ink-muted">Riverside Branch</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-auto">
          {items.map((item, i) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all hover:translate-x-[3px] hover:bg-white/9 hover:text-white"
                style={{
                  animation: 'var(--animate-rise-in)',
                  animationDelay: `${i * 40}ms`,
                  background: isActive ? 'color-mix(in oklab, var(--gv-accent) 26%, transparent)' : 'transparent',
                  borderColor: isActive ? 'color-mix(in oklab, var(--gv-accent) 45%, transparent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--color-ink-soft)',
                }}
              >
                <item.icon size={18} className="shrink-0" />
                <span className="flex-1">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-xl border border-white/9 bg-white/3 px-3 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-danger/40 hover:bg-danger/16 hover:text-[#ffd5db]"
        >
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-20 flex items-center gap-4 border-b border-white/9 px-[26px] py-3.5"
          style={{
            background: 'linear-gradient(180deg, rgb(255 255 255 / .075), rgb(255 255 255 / .03))',
            backdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
            WebkitBackdropFilter: 'blur(var(--gv-blur)) saturate(150%)',
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold tracking-[.13em] uppercase" style={{ color: 'var(--gv-accent)' }}>
              {user?.role} portal
            </div>
            <div className="truncate font-display text-[17px] font-semibold tracking-[-.2px]">
              {TITLES[active?.path] || 'GymVerse'}
            </div>
          </div>
          <div className="flex items-center gap-3 border-l border-white/10 pl-4">
            <div className="text-right">
              <div className="text-[13.5px] font-semibold">{user?.email}</div>
              <div className="text-[11.5px] text-ink-muted capitalize">{user?.role}</div>
            </div>
            <div
              className="grid h-[38px] w-[38px] place-items-center rounded-xl font-display text-sm font-bold text-[#04070f]"
              style={{
                background: 'linear-gradient(150deg, var(--gv-accent), #8ab6ff)',
                boxShadow: '0 10px 24px -10px var(--gv-accent)',
              }}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* key on pathname replays the entrance animation per route */}
        <main key={location.pathname} className="flex-1 px-[26px] pt-6 pb-10" style={{ animation: 'var(--animate-screen-in)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
