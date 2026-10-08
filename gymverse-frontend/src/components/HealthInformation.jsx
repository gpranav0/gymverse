import { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { getMemberById, patchMember } from '../services/memberService';
import { getErrorMessage } from '../services/api';
import { GlassPanel } from './ui/Glass';
import { ErrorNote, SuccessNote } from './ui/States';
import HealthConditionsField from './forms/HealthConditionsField';

export default function HealthInformation({ memberId }) {
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    getMemberById(memberId).then(res => {
      if (active) { setValue(res.data.health_conditions || ''); setLoaded(true); }
    }).catch(err => {
      if (active) setError(getErrorMessage(err, 'Could not load your health information.'));
    });
    return () => { active = false; };
  }, [memberId, reload]);

  const save = async event => {
    event.preventDefault();
    if (!loaded || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const res = await patchMember(memberId, { health_conditions: value.trim() || null });
      setValue(res.data.health_conditions || '');
      setMessage('Health information saved. Coach will use your updated information on your next message.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save your health information.'));
    } finally { setBusy(false); }
  };

  return (
    <GlassPanel className="px-[22px] py-5">
      <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
        <HeartPulse size={18} style={{ color: 'var(--gv-accent)' }} />
        <h2 className="m-0 font-display text-[16.5px] font-semibold">Health information</h2>
      </div>
      <form onSubmit={save} className="flex flex-col gap-3.5">
        {error && <ErrorNote>{error}</ErrorNote>}
        {message && <SuccessNote>{message}</SuccessNote>}
        {!loaded && !error && <p className="m-0 text-xs text-ink-muted">Loading health information…</p>}
        <HealthConditionsField value={value} onChange={event => { setValue(event.target.value); setMessage(null); }} disabled={!loaded || busy} />
        {!loaded && error
          ? <button type="button" className="btn-ghost w-fit text-sm" onClick={() => { setError(null); setReload(n => n + 1); }}>Try again</button>
          : <button type="submit" className="btn-primary w-fit text-sm disabled:opacity-50" disabled={!loaded || busy}>
            {busy ? 'Saving…' : 'Save health information'}
          </button>}
      </form>
    </GlassPanel>
  );
}
