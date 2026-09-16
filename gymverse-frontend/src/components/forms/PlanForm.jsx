import { useState, useEffect } from 'react';
import Select from '../ui/Select';

export default function PlanForm({ initialData, onSubmit, onCancel, loading }) {
  const [formData, setFormData] = useState({
    plan_name: '',
    description: '',
    duration_months: 1,
    price: 0,
    access_level: 'basic',
    status: 'active'
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
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
      duration_months: parseInt(formData.duration_months, 10),
      price: parseFloat(formData.price)
    });
  };

  const isEdit = !!initialData;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Plan Name *</span>
        <input required type="text" name="plan_name" value={formData.plan_name} onChange={handleChange} className="field text-sm" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label-caps">Description</span>
        <textarea name="description" value={formData.description || ''} onChange={handleChange} rows="2" className="field text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Duration (months) *</span>
          <input required type="number" min="1" name="duration_months" value={formData.duration_months} onChange={handleChange} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Price *</span>
          <input required type="number" min="0" step="0.01" name="price" value={formData.price} onChange={handleChange} className="field text-sm" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Access Level</span>
          <Select name="access_level" value={formData.access_level || ''} onChange={handleChange} className="text-sm">
            {/* A plan with no level, or one set outside this form, must still show its real value. */}
            {!formData.access_level && <option value="">Not set</option>}
            {formData.access_level && !['basic', 'premium', 'vip'].includes(formData.access_level) && (
              <option value={formData.access_level}>{formData.access_level}</option>
            )}
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
            <option value="vip">VIP</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">Status</span>
          <Select name="status" value={formData.status} onChange={handleChange} className="text-sm">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </label>
      </div>

      <div className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-4">
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost text-sm disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-50">
          {loading ? 'Saving…' : isEdit ? 'Update plan' : 'Create plan'}
        </button>
      </div>
    </form>
  );
}
