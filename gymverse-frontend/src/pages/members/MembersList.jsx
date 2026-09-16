import { useState, useEffect, useCallback } from 'react';
import { getMembers, getMemberById, deleteMember, createMember, updateMember } from '../../services/memberService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Trash2, Edit, Eye, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import MemberForm from '../../components/forms/MemberForm';
import GlassTable, { IdentityCell } from '../../components/ui/GlassTable';
import { Pill } from '../../components/ui/Glass';
import { PageHeader, SearchField, ErrorNote, EmptyState, LoadingTable } from '../../components/ui/States';

const PAGE_SIZE = 20;

export default function MembersList() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMembers({ page, limit: PAGE_SIZE, search: search || undefined });
      setMembers(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch members.'));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Debounce the search box so we are not issuing a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this member? This also removes their subscriptions, payments and attendance history.')) return;
    setError(null);
    try {
      await deleteMember(id);
      if (members.length === 1 && page > 1) setPage(page - 1);
      else fetchMembers();
    } catch (err) {
      setError(getErrorMessage(err, 'Cannot delete member.'));
    }
  };

  const openCreateModal = () => {
    setEditingMember(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  // A list row carries only the list columns, so editing from it showed an empty address
  // and emergency contact for members who have them. Load the full record first.
  const openEditModal = async (member) => {
    setFormError(null);
    try {
      const res = await getMemberById(member.member_id);
      setEditingMember(res.data);
    } catch (err) {
      setEditingMember(member);
      setFormError(getErrorMessage(err, 'Could not load the full record; fields left blank keep their saved values.'));
    }
    setIsModalOpen(true);
  };

  const handleSave = async (formData) => {
    try {
      setModalLoading(true);
      setFormError(null);
      if (editingMember) {
        await updateMember(editingMember.member_id, formData);
      } else {
        await createMember(formData);
      }
      setIsModalOpen(false);
      fetchMembers();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to save member.'));
    } finally {
      setModalLoading(false);
    }
  };

  const canManage = ['admin', 'receptionist'].includes(user.role);

  const columns = [
    {
      key: 'member',
      label: 'Member',
      width: 'minmax(0,2.2fr)',
      render: (m, i) => <IdentityCell title={m.member_name} subtitle={m.email} index={i} />,
    },
    { key: 'phone', label: 'Phone', mono: true, render: (m) => m.phone || '—' },
    {
      key: 'status',
      label: 'Status',
      width: 'minmax(0,.9fr)',
      render: (m) => <Pill status={m.status === 'active' ? 'active' : 'expired'}>{(m.status || 'unknown').toUpperCase()}</Pill>,
    },
    {
      key: 'actions',
      label: '',
      width: 'auto',
      align: 'end',
      render: (m) => (
        <div className="flex gap-2">
          <Link to={`/members/${m.member_id}`} className="btn-ghost inline-flex items-center" title="View profile">
            <Eye size={16} />
          </Link>
          {canManage && (
            <>
              <button onClick={() => openEditModal(m)} className="btn-ghost" title="Edit" style={{ color: '#ffdf9e' }}>
                <Edit size={16} />
              </button>
              <button onClick={() => handleDelete(m.member_id)} className="btn-ghost" title="Delete" style={{ color: '#ffc2cc' }}>
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Members directory" subtitle={meta ? `${meta.total} members on file` : 'Every member at this branch'}>
        <SearchField
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, email or phone…"
          icon={Search}
        />
        {canManage && (
          <button onClick={openCreateModal} className="btn-primary text-[13.5px]">
            + New member
          </button>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <LoadingTable />
      ) : members.length === 0 ? (
        <EmptyState>{search ? `No members match “${search}”.` : 'No members found.'}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <GlassTable
            columns={columns}
            rows={members}
            rowKey={(m) => m.member_id}
            footer={<Pagination meta={meta} onPageChange={setPage} disabled={loading} />}
          />
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => !modalLoading && setIsModalOpen(false)}
        title={editingMember ? 'Edit member' : 'Create new member'}
      >
        {formError && <ErrorNote>{formError}</ErrorNote>}
        <MemberForm
          initialData={editingMember}
          onSubmit={handleSave}
          onCancel={() => setIsModalOpen(false)}
          loading={modalLoading}
        />
      </Modal>
    </div>
  );
}
