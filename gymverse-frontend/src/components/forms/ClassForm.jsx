import { useState } from 'react';
import Select from '../ui/Select';

const blank = { class_name: '', description: '', difficulty_level: '', duration_minutes: 45, status: 'active' };

export default function ClassForm({ initialData, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(() => (initialData ? {
    class_name: initialData.class_name || '',
    description: initialData.description || '',
    difficulty_level: initialData.difficulty_level || '',
    duration_minutes: initialData.duration_minutes ?? '',
    status: initialData.status || 'active',
  } : blank));

  const setField = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      class_name: form.class_name.trim(),
      description: form.description.trim() || undefined,
      difficulty_level: form.difficulty_level || undefined,
      duration_minutes: form.duration_minutes === '' ? undefined : parseInt(form.duration_minutes, 10),
      status: form.status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Class name</span>
        <input required type="text" name="class_name" value={form.class_name} onChange={setField} className="field text-sm" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Description</span>
        <textarea name="description" rows="2" value={form.description} onChange={setField} className="field text-sm" />
      </label>
      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Difficulty</span>
          <Select name="difficulty_level" value={form.difficulty_level} onChange={setField} className="text-sm">
            <option value="">Any level</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Minutes</span>
          <input type="number" min="1" max="1440" name="duration_minutes" value={form.duration_minutes} onChange={setField} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Status</span>
          <Select name="status" value={form.status} onChange={setField} className="text-sm">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </label>
      </div>
      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Saving…' : initialData ? 'Update class' : 'Create class'}
        </button>
      </div>
    </form>
  );
}
