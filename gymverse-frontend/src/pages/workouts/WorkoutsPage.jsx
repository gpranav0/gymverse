import { useState, useEffect, useCallback } from 'react';
import { getWorkoutPlans, createWorkoutPlan, assignWorkoutPlan, logWorkoutSession } from '../../services/workoutService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Clock, Activity, BarChart2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import WorkoutPlanForm from '../../components/forms/WorkoutPlanForm';
import AssignWorkoutForm from '../../components/forms/AssignWorkoutForm';
import ViewExercisesModal from '../../components/forms/ViewExercisesModal';
import WorkoutSessionForm from '../../components/forms/WorkoutSessionForm';
import { GlassPanel, Pill } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, SuccessNote, EmptyState, LoadingCards } from '../../components/ui/States';

const GLOWS = [
  'radial-gradient(circle, rgb(167 139 250 / .75), transparent 68%)',
  'radial-gradient(circle, rgb(77 141 255 / .8), transparent 68%)',
  'radial-gradient(circle, rgb(52 211 153 / .75), transparent 68%)',
  'radial-gradient(circle, rgb(251 191 36 / .7), transparent 68%)',
];

const LEVEL_PILL = { beginner: 'active', intermediate: 'pending', advanced: 'failed' };

export default function WorkoutsPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningPlan, setAssigningPlan] = useState(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState(null);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingPlanId, setViewingPlanId] = useState(null);

  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const [notice, setNotice] = useState(null);

  const handleLogSession = async (data) => {
    try {
      setSessionLoading(true);
      setSessionError(null);
      await logWorkoutSession(data);
      setIsSessionModalOpen(false);
      setNotice(`Workout session logged (${data.duration_minutes} minutes).`);
    } catch (err) {
      setSessionError(getErrorMessage(err, 'Failed to log the session.'));
    } finally {
      setSessionLoading(false);
    }
  };

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getWorkoutPlans();
      setPlans(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch workout plans.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleCreatePlan = async (formData) => {
    try {
      setCreateLoading(true);
      setCreateError(null);
      await createWorkoutPlan(formData);
      setIsCreateModalOpen(false);
      setNotice(`${formData.plan_name} created.`);
      fetchPlans();
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Failed to create plan.'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAssignPlan = async (formData) => {
    try {
      setAssignLoading(true);
      setAssignError(null);
      await assignWorkoutPlan(formData);
      setIsAssignModalOpen(false);
      setNotice(`${assigningPlan.plan_name} assigned.`);
    } catch (err) {
      setAssignError(getErrorMessage(err, 'Failed to assign plan.'));
    } finally {
      setAssignLoading(false);
    }
  };

  const openAssignModal = (plan) => {
    setAssigningPlan(plan);
    setAssignError(null);
    setIsAssignModalOpen(true);
  };

  const openViewModal = (planId) => {
    setViewingPlanId(planId);
    setIsViewModalOpen(true);
  };

  const canManage = ['admin', 'trainer'].includes(user.role);
  const canLogSession = ['member', 'trainer'].includes(user.role);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Workout plans" subtitle="Programmes authored by the coaching team">
        {canLogSession && (
          <button onClick={() => { setSessionError(null); setIsSessionModalOpen(true); }} className="btn-ghost text-[13.5px]">
            Log session
          </button>
        )}
        {canManage && (
          <button onClick={() => { setCreateError(null); setIsCreateModalOpen(true); }} className="btn-primary text-[13.5px]">
            + New plan
          </button>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote onDismiss={() => setNotice(null)}>{notice}</SuccessNote>}

      {loading ? (
        <LoadingCards count={6} />
      ) : plans.length === 0 ? (
        <EmptyState>No workout plans available.</EmptyState>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(272px,1fr))]">
          {plans.map((plan, i) => (
            <GlassPanel
              key={plan.workout_plan_id}
              delay={i * 70}
              hover
              className="relative flex flex-col gap-3.5 overflow-hidden p-5"
            >
              <div
                className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-40 blur-[30px]"
                style={{ background: GLOWS[i % 4] }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display text-[16px] font-semibold tracking-[-.2px]">{plan.plan_name}</div>
                  <div className="text-[12.5px] text-ink-muted">{plan.goal_type || 'General fitness'}</div>
                </div>
                <Pill status={LEVEL_PILL[plan.difficulty_level] || 'neutral'}>
                  {plan.difficulty_level?.toUpperCase() || 'STANDARD'}
                </Pill>
              </div>

              {plan.description && (
                <p className="relative m-0 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">{plan.description}</p>
              )}

              <div className="relative flex flex-col gap-2">
                {[
                  [Activity, 'Goal', plan.goal_type || 'General fitness'],
                  [Clock, 'Duration', `${plan.duration_weeks} weeks`],
                  [BarChart2, 'Status', plan.status],
                ].map(([Icon, label, value]) => (
                  <div key={label} className="flex items-center gap-2.5 text-[13px] text-ink-soft">
                    <Icon size={14} className="shrink-0" style={{ color: 'var(--gv-accent)' }} />
                    <span className="min-w-0 flex-1">{label}</span>
                    <span className="truncate font-mono text-[12.5px] text-ink capitalize">{value}</span>
                  </div>
                ))}
              </div>

              <div className="relative mt-auto flex gap-2">
                <button onClick={() => openViewModal(plan.workout_plan_id)} className="btn-ghost flex-1 text-[13px]">
                  View exercises
                </button>
                {canManage && (
                  <button onClick={() => openAssignModal(plan)} className="btn-primary flex-1 text-[13px]">
                    Assign
                  </button>
                )}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => !createLoading && setIsCreateModalOpen(false)}
        title="Create new workout plan"
      >
        {createError && <ErrorNote>{createError}</ErrorNote>}
        <WorkoutPlanForm
          onSubmit={handleCreatePlan}
          onCancel={() => setIsCreateModalOpen(false)}
          loading={createLoading}
        />
      </Modal>

      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => !assignLoading && setIsAssignModalOpen(false)}
        title="Assign workout plan"
      >
        {assignError && <ErrorNote>{assignError}</ErrorNote>}
        {assigningPlan && (
          <AssignWorkoutForm
            plan={assigningPlan}
            onSubmit={handleAssignPlan}
            onCancel={() => setIsAssignModalOpen(false)}
            loading={assignLoading}
          />
        )}
      </Modal>

      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Workout plan exercises">
        {viewingPlanId && <ViewExercisesModal planId={viewingPlanId} onCancel={() => setIsViewModalOpen(false)} />}
      </Modal>

      <Modal isOpen={isSessionModalOpen} onClose={() => !sessionLoading && setIsSessionModalOpen(false)} title="Log a workout session">
        {sessionError && <ErrorNote>{sessionError}</ErrorNote>}
        {isSessionModalOpen && (
          <WorkoutSessionForm
            plans={plans}
            onSubmit={handleLogSession}
            onCancel={() => setIsSessionModalOpen(false)}
            loading={sessionLoading}
          />
        )}
      </Modal>
    </div>
  );
}
