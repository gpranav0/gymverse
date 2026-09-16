import { useState } from 'react';
import { todayLocal } from '../../utils/dates';
import Select from '../ui/Select';

/** Create a new session of a class. `classes` and `trainers` should already be active-only. */
export default function ScheduleForm({ classes, trainers, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({ class_id: '', trainer_id: '', class_date: todayLocal(), start_time: '07:00', end_time: '08:00', capacity: 20, room: '' });
  const [error, setError] = useState(null);

  const setField = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (form.end_time <= form.start_time) {
      setError('End time must be after the start time');
      return;
    }
    setError(null);
    onSubmit({
      class_id: parseInt(form.class_id, 10),
      trainer_id: parseInt(form.trainer_id, 10),
      class_date: form.class_date,
      start_time: form.start_time,
      end_time: form.end_time,
      capacity: parseInt(form.capacity, 10),
      room: form.room.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p role="alert" className="m-0 text-sm text-[#ffc2cc]">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Class</span>
          <Select required name="class_id" value={form.class_id} onChange={setField} className="text-sm">
            <option value="" disabled>-- Select a class --</option>
            {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Trainer</span>
          <Select required name="trainer_id" value={form.trainer_id} onChange={setField} className="text-sm">
            <option value="" disabled>-- Select a trainer --</option>
            {trainers.map((t) => <option key={t.trainer_id} value={t.trainer_id}>{t.trainer_name}</option>)}
          </Select>
        </label>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Date</span>
          <input required type="date" name="class_date" min={todayLocal()} value={form.class_date} onChange={setField} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Starts</span>
          <input required type="time" name="start_time" value={form.start_time} onChange={setField} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Ends</span>
          <input required type="time" name="end_time" value={form.end_time} onChange={setField} className="field text-sm" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Capacity</span>
          <input required type="number" min="1" max="1000" name="capacity" value={form.capacity} onChange={setField} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Room</span>
          <input type="text" name="room" value={form.room} onChange={setField} className="field text-sm" placeholder="Studio A" />
        </label>
      </div>
      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={loading || !form.class_id || !form.trainer_id} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Saving…' : 'Schedule session'}
        </button>
      </div>
    </form>
  );
}

/** Change the capacity or room of an existing session. */
export function ScheduleEditForm({ schedule, onSubmit, onCancel, loading }) {
  const [capacity, setCapacity] = useState(schedule.capacity ?? '');
  const [room, setRoom] = useState(schedule.room || '');
  const booked = parseInt(schedule.enrolled_count, 10) || 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ capacity: parseInt(capacity, 10), room: room.trim() || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Capacity</span>
          <input required type="number" min={Math.max(1, booked)} max="1000" name="capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Room</span>
          <input type="text" name="room" value={room} onChange={(e) => setRoom(e.target.value)} className="field text-sm" />
        </label>
      </div>
      <p className="m-0 text-xs text-ink-muted">{booked} seat{booked === 1 ? '' : 's'} already booked; capacity cannot go below that.</p>
      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-50">{loading ? 'Saving…' : 'Update session'}</button>
      </div>
    </form>
  );
}
