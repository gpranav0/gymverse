import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { changePassword, resendVerification } from '../../services/accountService';
import { getErrorMessage } from '../../services/api';
import { passwordProblem } from '../../utils/passwordPolicy';
import { GlassPanel, Pill } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, SuccessNote } from '../../components/ui/States';

const EMPTY = { current_password: '', new_password: '', confirm_password: '' };

function PanelTitle({ icon: Icon, children }) {
  return (
    <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
      <Icon size={18} style={{ color: 'var(--gv-accent)' }} />
      <h2 className="m-0 font-display text-[16.5px] font-semibold tracking-[-.2px]">{children}</h2>
    </div>
  );
}

export default function AccountSettings() {
  const { user, logout, replaceToken } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwDone, setPwDone] = useState(null);

  const [resend, setResend] = useState({ busy: false, message: null, error: null });
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const setField = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwDone(null);
    if (form.new_password !== form.confirm_password) return setPwError('New passwords do not match');
    const problem = passwordProblem(form.new_password);
    if (problem) return setPwError(problem);

    setPwBusy(true);
    try {
      const res = await changePassword(form.current_password, form.new_password);
      if (res.data?.token) replaceToken(res.data.token);
      setForm(EMPTY);
      setPwDone(res.message || 'Password changed.');
    } catch (err) {
      setPwError(getErrorMessage(err, 'Could not change your password.'));
    } finally {
      setPwBusy(false);
    }
  };

  const handleResend = async () => {
    setResend({ busy: true, message: null, error: null });
    try {
      await resendVerification(user.email);
      setResend({ busy: false, message: `A confirmation link has been sent to ${user.email}.`, error: null });
    } catch (err) {
      setResend({ busy: false, message: null, error: getErrorMessage(err, 'Could not send the link.') });
    }
  };

  const handleSignOutEverywhere = async () => {
    setSigningOut(true);
    await logout({ everywhere: true });
    navigate('/login', { replace: true });
  };

  if (!user) return null;
  const verified = user.email_verified !== false;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Account" subtitle="Your sign-in details and security settings" />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <GlassPanel className="px-[22px] py-5">
          <PanelTitle icon={ShieldCheck}>Profile</PanelTitle>
          <dl className="m-0 flex flex-col gap-2.5">
            {[
              ['Email', user.email],
              ['Username', user.username],
              ['Role', user.role],
            ].map(([label, value]) => (
              <div key={label} className="glass-inset flex items-center justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-[12.5px] text-ink-muted">{label}</dt>
                <dd className="m-0 truncate font-mono text-[12.5px] text-ink capitalize">{value}</dd>
              </div>
            ))}
            <div className="glass-inset flex items-center justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-[12.5px] text-ink-muted">Email confirmation</dt>
              <dd className="m-0"><Pill status={verified ? 'active' : 'pending'}>{verified ? 'CONFIRMED' : 'NOT CONFIRMED'}</Pill></dd>
            </div>
          </dl>
          {!verified && (
            <div className="mt-4 flex flex-col gap-2.5">
              {resend.message && <SuccessNote>{resend.message}</SuccessNote>}
              {resend.error && <ErrorNote>{resend.error}</ErrorNote>}
              <button type="button" onClick={handleResend} disabled={resend.busy} className="btn-ghost w-fit text-[13px] disabled:opacity-50">
                {resend.busy ? 'Sending…' : 'Resend confirmation email'}
              </button>
            </div>
          )}
        </GlassPanel>

        <GlassPanel delay={80} className="px-[22px] py-5">
          <PanelTitle icon={KeyRound}>Change password</PanelTitle>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3.5">
            {pwError && <ErrorNote>{pwError}</ErrorNote>}
            {pwDone && <SuccessNote>{pwDone}</SuccessNote>}
            <label className="flex flex-col gap-1.5">
              <span className="label-caps">Current password</span>
              <input type="password" name="current_password" required value={form.current_password} onChange={setField} className="field text-sm" autoComplete="current-password" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label-caps">New password</span>
              <input type="password" name="new_password" required value={form.new_password} onChange={setField} className="field text-sm" autoComplete="new-password" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label-caps">Confirm new password</span>
              <input type="password" name="confirm_password" required value={form.confirm_password} onChange={setField} className="field text-sm" autoComplete="new-password" />
            </label>
            <p className="m-0 text-xs text-ink-muted">At least 8 characters, with a letter and a number. Other devices will be signed out.</p>
            <button type="submit" disabled={pwBusy} className="btn-primary w-fit text-sm disabled:opacity-50">
              {pwBusy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </GlassPanel>

        <GlassPanel delay={160} className="px-[22px] py-5">
          <PanelTitle icon={LogOut}>Sessions</PanelTitle>
          <p className="m-0 mb-4 text-[13px] leading-relaxed text-ink-soft">
            Signing out here ends only this browser. Use this if you signed in on a shared computer or
            lost a device: it ends every session of your account, including this one.
          </p>
          {confirmEverywhere ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] text-[#ffdf9e]">Sign out of every device?</span>
              <button type="button" onClick={handleSignOutEverywhere} disabled={signingOut} className="btn-primary text-[13px] disabled:opacity-50">
                {signingOut ? 'Signing out…' : 'Yes, sign out everywhere'}
              </button>
              <button type="button" onClick={() => setConfirmEverywhere(false)} disabled={signingOut} className="btn-ghost text-[13px]">
                Keep me signed in
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmEverywhere(true)} className="btn-ghost text-[13px]" style={{ color: '#ffc2cc' }}>
              Sign out of all devices
            </button>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
