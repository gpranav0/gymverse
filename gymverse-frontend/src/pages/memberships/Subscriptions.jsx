import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../services/api';
import { fmtDate } from '../../utils/dates';
import GlassTable, { IdentityCell } from '../../components/ui/GlassTable';
import { Pill } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, EmptyState, LoadingTable } from '../../components/ui/States';

export default function Subscriptions() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/subscriptions', { params: { limit: 200 } });
      setSubscriptions(res.data.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch subscriptions.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const statusOf = (s) => {
    const v = s.subscription_status;
    return v === 'active' ? 'active' : v === 'expired' ? 'expired' : 'expiring';
  };

  const columns = [
    {
      key: 'member',
      label: 'Member',
      width: 'minmax(0,2.2fr)',
      render: (s, i) => (
        <IdentityCell
          title={s.member_name || `Member ${s.member_id}`}
          subtitle={`#${s.subscription_id}`}
          index={i}
        />
      ),
    },
    { key: 'plan', label: 'Plan', width: 'minmax(0,1.3fr)', render: (s) => s.plan_name || `Plan ${s.plan_id}` },
    { key: 'start', label: 'Start', mono: true, render: (s) => fmtDate(s.start_date) },
    { key: 'end', label: 'Ends', mono: true, render: (s) => fmtDate(s.end_date) },
    {
      key: 'status',
      label: 'Status',
      width: 'minmax(0,.9fr)',
      render: (s) => <Pill status={statusOf(s)}>{(s.subscription_status || 'unknown').toUpperCase()}</Pill>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Subscriptions" subtitle={`${subscriptions.length} on record`}>
        {['admin', 'receptionist'].includes(user.role) && (
          <Link to="/plans" className="btn-primary text-[13.5px] no-underline" style={{ color: '#04070f' }}>
            Create subscription
          </Link>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <LoadingTable />
      ) : subscriptions.length === 0 ? (
        <EmptyState>No subscriptions found.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <GlassTable columns={columns} rows={subscriptions} rowKey={(s) => s.subscription_id} />
        </div>
      )}
    </div>
  );
}
