import { useState, useEffect, useCallback } from 'react';
import { getMembershipPlans, createMembershipPlan, updateMembershipPlan, createSubscription } from '../../services/membershipService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Check, Edit, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import PlanForm from '../../components/forms/PlanForm';
import AssignSubscriptionForm from '../../components/forms/AssignSubscriptionForm';
import { GlassPanel, Pill } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, SuccessNote, EmptyState, LoadingCards } from '../../components/ui/States';

const GLOWS = [
  'radial-gradient(circle, rgb(77 141 255 / .8), transparent 68%)',
  'radial-gradient(circle, rgb(167 139 250 / .75), transparent 68%)',
  'radial-gradient(circle, rgb(52 211 153 / .75), transparent 68%)',
  'radial-gradient(circle, rgb(251 191 36 / .7), transparent 68%)',
];

export default function MembershipPlans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningPlan, setAssigningPlan] = useState(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState(null);
  const [notice, setNotice] = useState(null);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMembershipPlans();
      setPlans(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch membership plans.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (plan) => {
    setEditingPlan(plan);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (formData) => {
    try {
      setModalLoading(true);
      setFormError(null);
      if (editingPlan) {
        await updateMembershipPlan(editingPlan.plan_id, formData);
      } else {
        await createMembershipPlan(formData);
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to save plan.'));
    } finally {
      setModalLoading(false);
    }
  };

  const openAssignModal = (plan) => {
    setAssigningPlan(plan);
    setAssignError(null);
    setIsAssignModalOpen(true);
  };

  const handleAssign = async (subscriptionData) => {
    try {
      setAssignLoading(true);
      setAssignError(null);
      await createSubscription(subscriptionData);
      setIsAssignModalOpen(false);
      setNotice(`${assigningPlan.plan_name} assigned. The first payment has been recorded.`);
    } catch (err) {
      setAssignError(getErrorMessage(err, 'Failed to assign plan.'));
    } finally {
      setAssignLoading(false);
    }
  };

  const isAdmin = user.role === 'admin';
  const canAssign = ['admin', 'receptionist'].includes(user.role);

  const feature = (on, label) => (
    <div className="flex items-center gap-2.5 text-[13px]" style={{ color: on ? 'var(--color-ink-soft)' : '#7c879b' }}>
      {on ? <Check size={15} style={{ color: '#8ff0cd' }} /> : <X size={15} style={{ color: '#7c879b' }} />}
      <span style={{ textDecoration: on ? 'none' : 'line-through' }}>{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Membership plans" subtitle="Pricing, access level and included personal training">
        {isAdmin && (
          <button onClick={openCreateModal} className="btn-primary text-[13.5px]">
            + New plan
          </button>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote onDismiss={() => setNotice(null)}>{notice}</SuccessNote>}

      {loading ? (
        <LoadingCards count={4} height={340} />
      ) : plans.length === 0 ? (
        <EmptyState>No membership plans found.</EmptyState>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(272px,1fr))]">
          {plans.map((plan, i) => (
            <GlassPanel key={plan.plan_id} delay={i * 70} hover className="relative flex flex-col gap-4 overflow-hidden p-5">
              <div
                className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-40 blur-[30px]"
                style={{ background: GLOWS[i % 4] }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display text-[16px] font-semibold tracking-[-.2px]">{plan.plan_name}</div>
                  <div className="text-[12.5px] text-ink-muted">{plan.duration_months} month term</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {plan.status === 'inactive'
                    ? <Pill status="expired">INACTIVE</Pill>
                    : <Pill status="active">{plan.access_level || 'Standard'}</Pill>}
                  {isAdmin && (
                    <button onClick={() => openEditModal(plan)} className="text-ink-muted transition-colors hover:text-ink" title="Edit plan">
                      <Edit size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className="relative flex items-baseline gap-1.5">
                <span className="font-display text-[32px] font-bold tracking-[-1.2px]">
                  ${parseFloat(plan.price).toFixed(2)}
                </span>
                <span className="text-[13px] text-ink-muted">/ {plan.duration_months} mo</span>
              </div>

              {plan.description && (
                <p className="relative m-0 text-[13px] leading-relaxed text-ink-soft">{plan.description}</p>
              )}

              <div className="relative flex flex-col gap-2">
                {feature(true, `Access level: ${plan.access_level || 'Standard'}`)}
                {feature(!!plan.class_access, 'Group classes')}
                {feature(
                  plan.personal_training_sessions > 0,
                  plan.personal_training_sessions > 0
                    ? `${plan.personal_training_sessions} PT sessions`
                    : 'Personal training',
                )}
                {feature(!!plan.diet_consultation, 'Diet consultation')}
              </div>

              <div className="relative mt-auto">
                {/* Staff see retired plans too; the API refuses to sell them, so don't offer to. */}
                {canAssign && plan.status === 'inactive' ? (
                  <div className="glass-inset px-3 py-2.5 text-center text-[12.5px] text-ink-muted">
                    Retired — not available for new subscriptions
                  </div>
                ) : canAssign ? (
                  <button onClick={() => openAssignModal(plan)} className="btn-primary w-full text-[13px]">
                    Assign to member
                  </button>
                ) : (
                  <div className="glass-inset px-3 py-2.5 text-center text-[12.5px] text-ink-muted">
                    Contact the front desk to subscribe
                  </div>
                )}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => !modalLoading && setIsModalOpen(false)}
        title={editingPlan ? 'Edit plan' : 'Create new plan'}
      >
        {formError && <ErrorNote>{formError}</ErrorNote>}
        <PlanForm
          initialData={editingPlan}
          onSubmit={handleSave}
          onCancel={() => setIsModalOpen(false)}
          loading={modalLoading}
        />
      </Modal>

      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => !assignLoading && setIsAssignModalOpen(false)}
        title="Assign plan to member"
      >
        {assignError && <ErrorNote>{assignError}</ErrorNote>}
        {assigningPlan && (
          <AssignSubscriptionForm
            plan={assigningPlan}
            onSubmit={handleAssign}
            onCancel={() => setIsAssignModalOpen(false)}
            loading={assignLoading}
          />
        )}
      </Modal>
    </div>
  );
}
