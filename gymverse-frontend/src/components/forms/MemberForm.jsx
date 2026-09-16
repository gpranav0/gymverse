import { useState, useEffect } from 'react';

export default function MemberForm({ initialData, onSubmit, onCancel, loading }) {
  const [formData, setFormData] = useState({
    member_code: '',
    member_name: '',
    email: '',
    phone: '',
    gender: 'Other',
    date_of_birth: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    status: 'active'
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        date_of_birth: initialData.date_of_birth ? new Date(initialData.date_of_birth).toISOString().split('T')[0] : ''
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const isEdit = !!initialData;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Member Code *</span>
            <input required type="text" name="member_code" value={formData.member_code} onChange={handleChange} className="field text-sm" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Email *</span>
            <input required type="email" name="email" value={formData.email} onChange={handleChange} className="field text-sm" />
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Full Name *</span>
          <input required type="text" name="member_name" value={formData.member_name} onChange={handleChange} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Phone</span>
          <input type="text" name="phone" value={formData.phone || ''} onChange={handleChange} className="field text-sm" />
        </label>
      </div>

      {!isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Gender</span>
            <select name="gender" value={formData.gender} onChange={handleChange} className="field text-sm">
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Date of Birth</span>
            <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className="field text-sm" />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Address</span>
        <textarea name="address" value={formData.address || ''} onChange={handleChange} rows="2" className="field text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Emergency Contact Name</span>
          <input type="text" name="emergency_contact_name" value={formData.emergency_contact_name || ''} onChange={handleChange} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Emergency Phone</span>
          <input type="text" name="emergency_contact_phone" value={formData.emergency_contact_phone || ''} onChange={handleChange} className="field text-sm" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Status</span>
        <select name="status" value={formData.status} onChange={handleChange} className="field text-sm">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="expired">Expired</option>
        </select>
      </label>

      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Saving…' : isEdit ? 'Update member' : 'Create member'}
        </button>
      </div>
    </form>
  );
}
