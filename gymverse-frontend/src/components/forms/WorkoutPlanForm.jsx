import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getTrainers } from '../../services/trainerService';
import { getErrorMessage } from '../../services/api';

export default function WorkoutPlanForm({ onSubmit, onCancel, loading }) {
  const { user } = useAuth();
  // A trainer always authors as themselves. An admin creates plans on a trainer's behalf,
  // and the API requires them to say which trainer — without this picker every admin
  // submission was rejected with "trainer_id is required".
  const needsTrainer = user?.role === 'admin';

  const [formData, setFormData] = useState({
    plan_name: '',
    description: '',
    goal_type: 'General Fitness',
    difficulty_level: 'beginner',
    duration_weeks: 4,
    trainer_id: ''
  });
  const [trainers, setTrainers] = useState([]);
  const [trainerError, setTrainerError] = useState(null);

  useEffect(() => {
    if (!needsTrainer) return undefined;
    let active = true;
    getTrainers({ limit: 200 })
      .then((res) => { if (active) setTrainers((res.data || []).filter((t) => t.status === 'active')); })
      .catch((err) => { if (active) setTrainerError(getErrorMessage(err, 'Failed to load trainers.')); });
    return () => { active = false; };
  }, [needsTrainer]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { trainer_id, ...rest } = formData;
    onSubmit({
      ...rest,
      duration_weeks: parseInt(formData.duration_weeks, 10),
      ...(needsTrainer ? { trainer_id: parseInt(trainer_id, 10) } : {})
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Plan Name *</span>
        <input required type="text" name="plan_name" value={formData.plan_name} onChange={handleChange} className="field text-sm" />
      </label>

      {needsTrainer && (
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Authoring trainer *</span>
          <select required name="trainer_id" value={formData.trainer_id} onChange={handleChange} className="field text-sm">
            <option value="" disabled>-- Select a trainer --</option>
            {trainers.map((t) => (
              <option key={t.trainer_id} value={t.trainer_id}>
                {t.trainer_name}{t.specialization ? ` — ${t.specialization}` : ''}
              </option>
            ))}
          </select>
          {trainerError && <span className="text-xs text-[#ffc2cc]">{trainerError}</span>}
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Description</span>
        <textarea required name="description" value={formData.description} onChange={handleChange} rows="3" className="field text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Goal type</span>
          <input required type="text" name="goal_type" value={formData.goal_type} onChange={handleChange} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Difficulty level</span>
          <select name="difficulty_level" value={formData.difficulty_level} onChange={handleChange} className="field text-sm">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Duration (weeks)</span>
        <input required type="number" min="1" max="52" name="duration_weeks" value={formData.duration_weeks} onChange={handleChange} className="field text-sm" />
      </label>

      <p className="m-0 border-t border-white/10 pt-3 text-xs text-ink-muted italic">
        You can add specific exercises to this plan from the backend administration directly, or in a future update.
      </p>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={loading || (needsTrainer && !formData.trainer_id)} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Creating…' : 'Create workout plan'}
        </button>
      </div>
    </form>
  );
}
