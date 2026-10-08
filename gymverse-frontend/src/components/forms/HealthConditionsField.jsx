import { useId } from 'react';

export default function HealthConditionsField({ value, onChange, disabled = false }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label-caps">Health conditions or limitations (optional)</label>
      <textarea id={id} name="health_conditions" value={value || ''} onChange={onChange}
        disabled={disabled} maxLength={1000} rows={3} className="field text-sm"
        placeholder="For example: knee injury, asthma, or activities your doctor has asked you to avoid."
        aria-describedby={`${id}-help`} />
      <p id={`${id}-help`} className="m-0 text-xs leading-relaxed text-ink-muted">
        Share only what you’re comfortable recording. Gym staff can view this, and Coach shares it
        with our AI provider to tailor fitness suggestions. You can update or clear it later.
      </p>
      <span className="text-xs text-ink-muted">{(value || '').length}/1000 characters</span>
    </div>
  );
}
