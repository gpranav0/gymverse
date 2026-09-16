import { useState, useEffect } from 'react';
import { getWorkoutPlanById } from '../../services/workoutService';
import { getErrorMessage } from '../../services/api';

export default function ViewExercisesModal({ planId, onCancel }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await getWorkoutPlanById(planId);
        setExercises(res.data.exercises || []);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load exercises for this plan.'));
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [planId]);

  if (loading) return <p className="p-4 text-center text-sm text-ink-muted">Loading exercises…</p>;
  if (error) return <p className="p-4 text-center text-sm text-[#ffc2cc]">{error}</p>;

  return (
    <div className="flex flex-col gap-4">
      {exercises.length === 0 ? (
        <div className="glass-inset px-6 py-8 text-center text-sm text-ink-muted">
          No exercises have been added to this plan yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-white/10">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/4">
                <th className="label-caps px-3 py-2.5 font-semibold">Day</th>
                <th className="label-caps px-3 py-2.5 font-semibold">Exercise</th>
                <th className="label-caps px-3 py-2.5 font-semibold">Sets × reps</th>
                <th className="label-caps px-3 py-2.5 font-semibold">Duration</th>
                <th className="label-caps px-3 py-2.5 font-semibold">Rest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {exercises.map((ex, idx) => (
                <tr key={idx} className="transition-colors hover:bg-white/5">
                  <td className="px-3 py-2.5 text-ink-soft">Day {ex.day_number}</td>
                  <td className="px-3 py-2.5 font-semibold text-ink">{ex.exercise_name}</td>
                  <td className="px-3 py-2.5 font-mono text-ink-soft">{ex.sets} × {ex.repetitions}</td>
                  <td className="px-3 py-2.5 font-mono text-ink-soft">{ex.duration_seconds ? `${ex.duration_seconds}s` : '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-ink-soft">{ex.rest_seconds ? `${ex.rest_seconds}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onCancel} className="btn-ghost text-sm">
          Close
        </button>
      </div>
    </div>
  );
}
