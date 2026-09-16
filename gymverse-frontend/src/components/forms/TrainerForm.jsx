import { useState, useEffect } from 'react';
import Select from '../ui/Select';

export default function TrainerForm({ initialData, onSubmit, onCancel, loading }) {
  const [formData, setFormData] = useState({
    trainer_code: '',
    trainer_name: '',
    email: '',
    phone: '',
    specialization: '',
    qualification: '',
    experience_years: 0,
    shift: 'Morning',
    bio: '',
    status: 'active'
  });

  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      experience_years: parseInt(formData.experience_years, 10) || 0
    });
  };

  const isEdit = !!initialData;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Trainer Code *</span>
            <input required type="text" name="trainer_code" value={formData.trainer_code} onChange={handleChange} className="field text-sm" />
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
          <input required type="text" name="trainer_name" value={formData.trainer_name} onChange={handleChange} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Phone</span>
          <input type="text" name="phone" value={formData.phone || ''} onChange={handleChange} className="field text-sm" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Specialization</span>
          <input type="text" name="specialization" value={formData.specialization || ''} onChange={handleChange} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Qualification</span>
          <input type="text" name="qualification" value={formData.qualification || ''} onChange={handleChange} className="field text-sm" placeholder="e.g., ACE Certified" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Experience (years)</span>
          <input type="number" min="0" name="experience_years" value={formData.experience_years} onChange={handleChange} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Shift</span>
          <Select name="shift" value={formData.shift} onChange={handleChange} className="text-sm">
            <option value="Morning">Morning</option>
            <option value="Evening">Evening</option>
            <option value="Full-Day">Full-Day</option>
          </Select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Bio</span>
        <textarea name="bio" value={formData.bio || ''} onChange={handleChange} rows="2" className="field text-sm" placeholder="Short biography shown on the trainer's profile" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Status</span>
        <Select name="status" value={formData.status} onChange={handleChange} className="text-sm">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </label>

      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Saving…' : isEdit ? 'Update trainer' : 'Create trainer'}
        </button>
      </div>
    </form>
  );
}
