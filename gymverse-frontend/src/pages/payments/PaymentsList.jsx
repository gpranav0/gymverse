import { useState, useEffect, useCallback } from 'react';
import { getPayments, updatePaymentStatus } from '../../services/paymentService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtDate } from '../../utils/dates';
import { Search, Edit } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import PaymentActionModal from '../../components/forms/PaymentActionModal';
import GlassTable from '../../components/ui/GlassTable';
import { Pill } from '../../components/ui/Glass';
import { PageHeader, SearchField, ErrorNote, EmptyState, LoadingTable } from '../../components/ui/States';

const PAGE_SIZE = 20;

const PILL_STATUS = {
  completed: 'paid',
  pending: 'pending',
  refunded: 'refunded',
  partially_refunded: 'refunded',
  failed: 'failed',
};

export default function PaymentsList() {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getPayments({ page, limit: PAGE_SIZE });
      setPayments(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch payments.'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleUpdateStatus = async (formData) => {
    try {
      setModalLoading(true);
      setFormError(null);
      await updatePaymentStatus(selectedPayment.payment_id, formData);
      setIsModalOpen(false);
      fetchPayments();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to update payment status.'));
    } finally {
      setModalLoading(false);
    }
  };

  const openModal = (payment) => {
    setSelectedPayment(payment);
    setFormError(null);
    setIsModalOpen(true);
  };

  // The API paginates, so this filters the current page rather than the whole table.
  const term = filter.trim().toLowerCase();
  const visible = term
    ? payments.filter((p) =>
        String(p.payment_id).includes(term) ||
        (p.transaction_reference || '').toLowerCase().includes(term) ||
        (p.receipt_number || '').toLowerCase().includes(term))
    : payments;

  const canManage = ['admin', 'receptionist'].includes(user.role);

  const columns = [
    {
      key: 'id',
      label: 'Payment',
      width: 'minmax(0,1.4fr)',
      render: (p) => (
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-medium text-ink">#{p.payment_id}</div>
          <div className="truncate text-xs text-ink-muted">
            {p.transaction_reference || p.receipt_number || 'No reference'}
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (p) => (
        <span className="font-display text-[15px] font-bold tracking-[-.3px] text-ink">
          ${parseFloat(p.amount).toFixed(2)}
        </span>
      ),
    },
    { key: 'date', label: 'Date', mono: true, render: (p) => fmtDate(p.payment_date) },
    { key: 'method', label: 'Method', render: (p) => <span className="capitalize">{p.payment_method || '—'}</span> },
    {
      key: 'status',
      label: 'Status',
      width: 'minmax(0,1fr)',
      render: (p) => (
        <Pill status={PILL_STATUS[p.payment_status] || 'neutral'}>
          {(p.payment_status || 'unknown').replace('_', ' ').toUpperCase()}
        </Pill>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 'auto',
      align: 'end',
      render: (p) =>
        canManage ? (
          <button onClick={() => openModal(p)} className="btn-ghost" title="Update status">
            <Edit size={16} />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Payments" subtitle={meta ? `${meta.total} invoices` : 'Collections and receipts'}>
        <SearchField
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter this page by ID or reference…"
          icon={Search}
          width={290}
        />
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <LoadingTable />
      ) : payments.length === 0 ? (
        <EmptyState>No payments found.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <GlassTable
            columns={columns}
            rows={visible}
            rowKey={(p) => p.payment_id}
            emptyNote={`No payments on this page match “${filter}”.`}
            footer={<Pagination meta={meta} onPageChange={setPage} disabled={loading} />}
          />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => !modalLoading && setIsModalOpen(false)} title="Payment details">
        {formError && <ErrorNote>{formError}</ErrorNote>}
        <PaymentActionModal
          payment={selectedPayment}
          onSubmit={handleUpdateStatus}
          onCancel={() => setIsModalOpen(false)}
          loading={modalLoading}
        />
      </Modal>
    </div>
  );
}
