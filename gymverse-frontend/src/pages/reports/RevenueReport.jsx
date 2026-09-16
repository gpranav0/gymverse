import { useState, useEffect } from 'react';
import { getRevenueReport } from '../../services/reportService';
import { fmtDate, toLocalDay, todayLocal } from '../../utils/dates';
import { DollarSign, Download, Filter } from 'lucide-react';
import GlassTable, { IdentityCell } from '../../components/ui/GlassTable';
import { GlassPanel, useCountUp } from '../../components/ui/Glass';
import { PageHeader, ErrorNote, EmptyState, LoadingTable } from '../../components/ui/States';

// Quotes inside a value must be doubled or the row splits, and a leading = + - @ makes a
// spreadsheet run the cell as a formula. Member names are user-supplied, so both matter.
const csvCell = (value) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export default function RevenueReport() {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const res = await getRevenueReport({ limit: 1000 });
        setReportData(res.data || []);
      } catch (err) {
        if (err.response?.status === 403) {
          setError('You do not have permission to view revenue analytics.');
        } else {
          setError('Failed to fetch revenue report.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  // Compared as local calendar days. `new Date(endDate)` is midnight UTC at the start of the
  // end day, so payments taken later that day used to fall outside the range.
  const filteredData = reportData.filter((row) => {
    const day = toLocalDay(row.payment_date);
    return (!startDate || day >= startDate) && (!endDate || day <= endDate);
  });

  const totalRevenue = filteredData.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);

  const handleExportCSV = () => {
    if (filteredData.length === 0) return;
    const header = 'Member Name,Plan,Amount,Payment Method,Date';
    const rows = filteredData.map((row) =>
      [csvCell(row.member_name), csvCell(row.plan_name), row.amount, csvCell(row.payment_method), csvCell(fmtDate(row.payment_date))].join(','),
    );
    // A Blob rather than a data: URI, which cut the file short at the first '#' in a name.
    const url = URL.createObjectURL(new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `revenue_report_${todayLocal()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Revenue report" />
        <ErrorNote>{error}</ErrorNote>
      </div>
    );
  }

  const columns = [
    {
      key: 'member',
      label: 'Member',
      width: 'minmax(0,2.2fr)',
      render: (r, i) => <IdentityCell title={r.member_name} subtitle={r.plan_name} index={i} />,
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (r) => (
        <span className="font-display text-[15px] font-bold tracking-[-.3px] text-ink">
          ${parseFloat(r.amount).toFixed(2)}
        </span>
      ),
    },
    { key: 'method', label: 'Method', render: (r) => <span className="capitalize">{r.payment_method || '—'}</span> },
    { key: 'date', label: 'Date', mono: true, render: (r) => fmtDate(r.payment_date) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Revenue report" subtitle="Collected payments, filterable by date">
        <div className="flex items-center gap-2 rounded-xl border border-white/13 bg-white/5 px-3.5 py-2.5 font-mono text-[12.5px] text-ink-soft">
          <Filter size={15} className="text-ink-muted" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border-none bg-transparent text-ink outline-none"
            title="Start date"
          />
          <span className="text-ink-muted">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border-none bg-transparent text-ink outline-none"
            title="End date"
          />
        </div>
        <button onClick={handleExportCSV} className="btn-primary flex items-center gap-2 text-[13.5px]">
          <Download size={16} />
          Export CSV
        </button>
      </PageHeader>

      <TotalCard total={totalRevenue} count={filteredData.length} />

      {loading ? (
        <LoadingTable />
      ) : reportData.length === 0 ? (
        <EmptyState>No payment records found.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <GlassTable
            columns={columns}
            rows={filteredData}
            rowKey={(r, i) => `${r.member_name}-${r.payment_date}-${i}`}
            emptyNote="No payments in this date range."
            footer={`${filteredData.length} of ${reportData.length} payments shown`}
          />
        </div>
      )}
    </div>
  );
}

function TotalCard({ total, count }) {
  const animated = useCountUp(Math.round(total));
  return (
    <GlassPanel className="relative flex items-center justify-between gap-4 overflow-hidden px-6 py-5">
      <div
        className="absolute -top-12 -right-8 h-40 w-40 rounded-full opacity-40 blur-[34px]"
        style={{ background: 'radial-gradient(circle, rgb(52 211 153 / .8), transparent 68%)' }}
      />
      <div className="relative">
        <div className="label-caps">Gross collected revenue</div>
        <div className="mt-2 font-display text-[34px] leading-none font-bold tracking-[-1.2px]">
          ${animated.toLocaleString('en-US')}
        </div>
        <div className="mt-2 text-[12.5px] text-ink-soft">across {count} payments</div>
      </div>
      <div
        className="relative grid h-14 w-14 place-items-center rounded-2xl border border-white/15"
        style={{ background: 'rgb(52 211 153 / .14)', color: '#8ff0cd' }}
      >
        <DollarSign size={26} />
      </div>
    </GlassPanel>
  );
}
