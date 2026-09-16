import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../services/api';
import AppBackdrop from '../../components/ui/AppBackdrop';
import { useGlassTheme } from '../../components/ui/Glass';
import { Dumbbell } from 'lucide-react';
import Select from '../../components/ui/Select';

export default function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role_name: 'member',
    specialization: '',
    qualification: '',
    honeypot: ''
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();
  useGlassTheme({ accent: '#4d8dff', blur: 18 });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (formData.honeypot) {
      // Bot detected, just silently fail
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Mirrors registerValidator on the backend, so the user is told here rather than
    // getting a 422 after the round trip.
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!/[A-Za-z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
      setError('Password must contain at least one letter and one number');
      return;
    }

    setLoading(true);
    try {
      // Client-only fields have no business on the wire.
      const { honeypot: _hp, confirmPassword: _cp, ...payload } = formData;
      const result = await register(payload);

      if (formData.role_name === 'trainer') {
        setSuccess('Registered successfully. Awaiting admin approval. You cannot login until approved.');
      } else if (!result?.data?.token) {
        // The gym requires email confirmation before a first sign-in.
        setSuccess(result?.message || 'Account created. Check your email to confirm your address, then sign in.');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center px-6 py-10 text-ink">
      <AppBackdrop />
      <div className="glass w-full max-w-[560px] px-8 py-9" style={{ animation: 'var(--animate-screen-in)' }}>
        <div className="mb-7 flex items-center gap-2.5">
          <div
            className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
            style={{
              background: 'linear-gradient(150deg, var(--gv-accent), #7c5cff)',
              boxShadow: '0 8px 22px -8px var(--gv-accent)',
            }}
          >
            <Dumbbell size={19} color="#fff" />
          </div>
          <span className="font-display text-[19px] font-bold tracking-[-.2px]">GymVerse</span>
        </div>

        <h1 className="m-0 mb-1.5 font-display text-[27px] font-bold tracking-[-.6px]">Join GymVerse</h1>
        <p className="m-0 mb-6.5 text-sm text-ink-soft">Create an account to book classes and track your progress.</p>

        {error && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-[13px] text-[#ffc2cc]"
            style={{ background: 'rgb(251 113 133 / .14)', border: '1px solid rgb(251 113 133 / .36)' }}
          >
            {error}
          </div>
        )}

        {success ? (
          <div
            className="rounded-xl px-4 py-4 text-center text-[13.5px] text-[#8ff0cd]"
            style={{ background: 'rgb(52 211 153 / .14)', border: '1px solid rgb(52 211 153 / .36)' }}
          >
            <p className="m-0 mb-3 font-semibold">{success}</p>
            <Link to="/login" className="btn-primary inline-flex text-sm no-underline">
              Go to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {/* Honeypot field - hidden from users but bots might fill it */}
            <div className="hidden">
              <label>Leave this field empty if you are human</label>
              <input type="text" name="honeypot" value={formData.honeypot} onChange={handleChange} tabIndex="-1" autoComplete="off" />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="label-caps">Full name</span>
                <input required type="text" name="name" className="field text-sm" value={formData.name} onChange={handleChange} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label-caps">Username</span>
                <input required type="text" name="username" className="field text-sm" value={formData.username} onChange={handleChange} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="label-caps">Email</span>
                <input required type="email" name="email" className="field text-sm" value={formData.email} onChange={handleChange} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label-caps">Phone</span>
                <input required type="text" name="phone" className="field text-sm" value={formData.phone} onChange={handleChange} />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="label-caps">I am joining as</span>
              <Select name="role_name" className="text-sm" value={formData.role_name} onChange={handleChange}>
                <option value="member">Member</option>
                <option value="trainer">Trainer</option>
              </Select>
            </label>

            {formData.role_name === 'trainer' && (
              <div className="glass-inset grid grid-cols-2 gap-3.5 p-4">
                <label className="flex flex-col gap-1.5">
                  <span className="label-caps">Specialization</span>
                  <input type="text" name="specialization" placeholder="e.g., Weightlifting" className="field text-sm" value={formData.specialization} onChange={handleChange} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="label-caps">Qualification</span>
                  <input type="text" name="qualification" placeholder="e.g., ACE Certified" className="field text-sm" value={formData.qualification} onChange={handleChange} />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="label-caps">Password</span>
                <input required type="password" name="password" className="field text-sm" value={formData.password} onChange={handleChange} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label-caps">Confirm password</span>
                <input required type="password" name="confirmPassword" className="field text-sm" value={formData.confirmPassword} onChange={handleChange} />
              </label>
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-2 py-3.5 text-sm disabled:opacity-60">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}

        {!success && (
          <p className="m-0 mt-5 text-center text-[13px] text-ink-muted">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
