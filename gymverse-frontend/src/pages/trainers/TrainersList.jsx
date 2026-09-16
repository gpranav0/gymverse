import { useState, useEffect, useCallback } from 'react';
import { getTrainers, deleteTrainer, createTrainer, updateTrainer } from '../../services/trainerService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Trash2, Edit } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import TrainerForm from '../../components/forms/TrainerForm';
import { GlassPanel, Pill, Monogram } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, EmptyState, LoadingCards } from '../../components/ui/States';

const GLOWS = [
  'radial-gradient(circle, rgb(77 141 255 / .8), transparent 68%)',
  'radial-gradient(circle, rgb(52 211 153 / .75), transparent 68%)',
  'radial-gradient(circle, rgb(167 139 250 / .75), transparent 68%)',
  'radial-gradient(circle, rgb(251 191 36 / .7), transparent 68%)',
];

export default function TrainersList() {
  const { user } = useAuth();
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchTrainers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // This page renders every trainer with no pager, so ask for more than the API's
      // default page of 20.
      const res = await getTrainers({ limit: 200 });
      setTrainers(res.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch trainers.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrainers();
  }, [fetchTrainers]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this trainer?')) return;
    try {
      await deleteTrainer(id);
      fetchTrainers();
    } catch (err) {
      setError(getErrorMessage(err, 'Cannot delete trainer.'));
    }
  };

  const openCreateModal = () => {
    setEditingTrainer(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (trainer) => {
    setEditingTrainer(trainer);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (formData) => {
    try {
      setModalLoading(true);
      setFormError(null);
      if (editingTrainer) {
        await updateTrainer(editingTrainer.trainer_id, formData);
      } else {
        await createTrainer(formData);
      }
      setIsModalOpen(false);
      fetchTrainers();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to save trainer.'));
    } finally {
      setModalLoading(false);
    }
  };

  const isAdmin = user.role === 'admin';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Trainers" subtitle="Coaching staff, availability and client load">
        {isAdmin && (
          <button onClick={openCreateModal} className="btn-primary text-[13.5px]">
            + New trainer
          </button>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <LoadingCards count={6} />
      ) : trainers.length === 0 ? (
        <EmptyState>No trainers found.</EmptyState>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(272px,1fr))]">
          {trainers.map((trainer, i) => (
            <GlassPanel
              key={trainer.trainer_id}
              delay={i * 70}
              hover
              className="relative flex flex-col gap-3.5 overflow-hidden p-5"
            >
              <div
                className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-40 blur-[30px]"
                style={{ background: GLOWS[i % 4] }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {trainer.profile_photo_url ? (
                    <img
                      src={trainer.profile_photo_url}
                      alt={trainer.trainer_name}
                      className="h-11 w-11 shrink-0 rounded-[14px] border border-white/16 object-cover"
                    />
                  ) : (
                    <Monogram name={trainer.trainer_name} index={i} size={44} radius={14} />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-display text-[16px] font-semibold tracking-[-.2px]">
                      {trainer.trainer_name}
                    </div>
                    <div className="truncate text-[12.5px] text-ink-muted">
                      {trainer.specialization || 'General fitness'}
                    </div>
                  </div>
                </div>
                <Pill status={trainer.status === 'active' ? 'available' : 'expired'}>
                  {(trainer.status || 'unknown').toUpperCase()}
                </Pill>
              </div>

              <div className="relative flex flex-col gap-2">
                {[
                  ['Experience', `${trainer.experience_years || 0} yrs`],
                  ['Phone', trainer.phone || '—'],
                  ['Qualification', trainer.qualification || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center gap-2.5 text-[13px] text-ink-soft">
                    <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: 'var(--gv-accent)' }} />
                    <span className="min-w-0 flex-1">{label}</span>
                    <span className="truncate font-mono text-[12.5px] text-ink">{value}</span>
                  </div>
                ))}
              </div>

              <div className="relative mt-auto flex gap-2">
                <Link
                  to={`/trainers/${trainer.trainer_id}`}
                  className="btn-primary flex-1 text-center text-[13px] no-underline"
                  style={{ color: '#04070f' }}
                >
                  View profile
                </Link>
                {isAdmin && (
                  <>
                    <button onClick={() => openEditModal(trainer)} className="btn-ghost" style={{ color: '#ffdf9e' }} title="Edit">
                      <Edit size={16} />
                    </button>
                    <button onClick={() => handleDelete(trainer.trainer_id)} className="btn-ghost" style={{ color: '#ffc2cc' }} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => !modalLoading && setIsModalOpen(false)}
        title={editingTrainer ? 'Edit trainer' : 'Create new trainer'}
      >
        {formError && <ErrorNote>{formError}</ErrorNote>}
        <TrainerForm
          initialData={editingTrainer}
          onSubmit={handleSave}
          onCancel={() => setIsModalOpen(false)}
          loading={modalLoading}
        />
      </Modal>
    </div>
  );
}
