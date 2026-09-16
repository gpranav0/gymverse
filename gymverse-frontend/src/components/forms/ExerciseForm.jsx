import { useState } from 'react';
import Select from '../ui/Select';

const FIELDS = ['exercise_name', 'muscle_group', 'secondary_muscle_group', 'equipment_required', 'difficulty_level', 'description', 'instructions'];

export default function ExerciseForm({ initialData, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f, initialData?.[f] ?? (f === 'difficulty_level' ? 'beginner' : '')])));

  const setField = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    // PUT replaces the whole record, so every field is sent; blanks clear the column.
    onSubmit(Object.fromEntries(FIELDS.map((f) => [f, typeof form[f] === 'string' ? form[f].trim() : form[f]])));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Exercise name</span>
        <input required type="text" name="exercise_name" value={form.exercise_name} onChange={setField} className="field text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Main muscle group</span>
          <input type="text" name="muscle_group" value={form.muscle_group} onChange={setField} className="field text-sm" placeholder="Legs" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Secondary muscle group</span>
          <input type="text" name="secondary_muscle_group" value={form.secondary_muscle_group} onChange={setField} className="field text-sm" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Equipment</span>
          <input type="text" name="equipment_required" value={form.equipment_required} onChange={setField} className="field text-sm" placeholder="Barbell" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Difficulty</span>
          <Select name="difficulty_level" value={form.difficulty_level} onChange={setField} className="text-sm">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Description</span>
        <textarea name="description" rows="2" value={form.description} onChange={setField} className="field text-sm" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Instructions</span>
        <textarea name="instructions" rows="3" value={form.instructions} onChange={setField} className="field text-sm" placeholder="Step-by-step cues" />
      </label>
      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Saving…' : initialData ? 'Update exercise' : 'Create exercise'}
        </button>
      </div>
    </form>
  );
}
