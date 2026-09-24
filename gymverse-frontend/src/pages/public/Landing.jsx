import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Dumbbell, Menu, MoveUpRight, ShieldCheck, Sparkles, X } from 'lucide-react';
import { getMembershipPlans } from '../../services/membershipService';
import { getClassSchedules } from '../../services/classService';
import { getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const programs = [
  { number: '01', name: 'Strength', detail: 'Build a stronger foundation with progressive training.', icon: Dumbbell, className: 'program-strength' },
  { number: '02', name: 'Functional', detail: 'Move with purpose, power, and confidence.', icon: Sparkles, className: 'program-functional' },
  { number: '03', name: 'Cardio', detail: 'Condition your engine and find your pace.', icon: MoveUpRight, className: 'program-cardio' },
  { number: '04', name: 'Mobility', detail: 'Make room for recovery, balance, and flow.', icon: ShieldCheck, className: 'program-mobility' },
  { number: '05', name: 'Coaching', detail: 'A guided approach built around your goals.', icon: ArrowUpRight, className: 'program-coaching' },
];
const gallery = [
  { src: '/gymverse-facility.jpg', alt: 'Functional training studio with kettlebells and strength equipment', label: 'Functional studio' },
  { src: '/gymverse-training-hero.jpg', alt: 'Athletic man preparing for a deadlift on the strength floor', label: 'Strength floor' },
  { src: '/gymverse-coaching.jpg', alt: 'Male coach guiding a male member during a strength session', label: 'Personal coaching' },
];

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
const dateKey = (value) => String(value || '').slice(0, 10);
const dayLabel = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
const timeLabel = (value) => String(value || '').slice(0, 5);

function SectionTitle({ eyebrow, title, description, action }) {
  return <div className="landing-section-heading">
    <div><p className="landing-eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p className="landing-section-description">{description}</p>}</div>
    {action}
  </div>;
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [plansState, setPlansState] = useState('loading');
  const [schedulesState, setSchedulesState] = useState('loading');
  const [plansError, setPlansError] = useState('');
  const [schedulesError, setSchedulesError] = useState('');
  const [period, setPeriod] = useState('monthly');
  const [day, setDay] = useState('');
  const [openImage, setOpenImage] = useState(null);
  const closeImageRef = useRef(null);
  const galleryTriggerRef = useRef(null);

  const closeImage = () => { setOpenImage(null); galleryTriggerRef.current?.focus(); };

  useEffect(() => {
    if (openImage === null) return undefined;
    closeImageRef.current?.focus();
    const onKeyDown = event => { if (event.key === 'Escape') closeImage(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openImage]);

  useEffect(() => {
    let active = true;
    getMembershipPlans().then(result => {
      if (!active) return;
      setPlans((result.data || []).filter(plan => plan.status === 'active'));
      setPlansState('ready');
    }).catch(error => { if (active) { setPlansError(error.response ? getErrorMessage(error, 'Plans could not be loaded.') : 'Plans could not be loaded. Please try again later.'); setPlansState('error'); } });
    getClassSchedules().then(result => {
      if (!active) return;
      setSchedules(result.data || []);
      setSchedulesState('ready');
    }).catch(error => { if (active) { setSchedulesError(error.response ? getErrorMessage(error, 'Classes could not be loaded.') : 'Classes could not be loaded. Please try again later.'); setSchedulesState('error'); } });
    return () => { active = false; };
  }, []);

  const planPeriods = useMemo(() => ({
    monthly: plans.filter(plan => Number(plan.duration_months) <= 1),
    longer: plans.filter(plan => Number(plan.duration_months) > 1),
  }), [plans]);
  const visiblePlans = planPeriods[period].slice(0, 3);
  const availableDays = useMemo(() => [...new Set(schedules.map(item => dateKey(item.class_date)))].slice(0, 5), [schedules]);
  const selectedDay = availableDays.includes(day) ? day : availableDays[0];
  const visibleSchedules = schedules.filter(item => dateKey(item.class_date) === selectedDay).slice(0, 4);
  const destination = isAuthenticated ? '/dashboard' : '/register';

  return <div className="landing-page">
    <header className="landing-header">
      <Link className="landing-brand" to="/" aria-label="GymVerse home"><span className="landing-brand-mark"><Dumbbell size={22} strokeWidth={2.6} /></span><span>GYMVERSE<span className="landing-brand-dot">.</span></span></Link>
      <nav className={menuOpen ? 'landing-nav is-open' : 'landing-nav'} aria-label="Main navigation">
        <a href="#programs" onClick={() => setMenuOpen(false)}>Programs</a><a href="#membership" onClick={() => setMenuOpen(false)}>Membership</a><a href="#classes" onClick={() => setMenuOpen(false)}>Classes</a><a href="#experience" onClick={() => setMenuOpen(false)}>The experience</a>
      </nav>
      <div className="landing-header-actions"><Link className="landing-signin" to={isAuthenticated ? '/dashboard' : '/login'}>{isAuthenticated ? 'Dashboard' : 'Sign in'}</Link><Link className="landing-header-cta" to={destination}>Join the movement <ArrowUpRight size={16} /></Link></div>
      <button className="landing-menu-button" type="button" onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>{menuOpen ? <X /> : <Menu />}</button>
    </header>

    <main>
      <section className="landing-hero" aria-labelledby="hero-title">
        <img src="/gymverse-training-hero.jpg" alt="Athletic man preparing for a deadlift in a modern gym" fetchPriority="high" className="landing-hero-image" />
        <div className="landing-hero-shade" />
        <div className="landing-hero-content"><p className="landing-eyebrow"><span className="landing-eyebrow-line" /> Your space to go further</p><h1 id="hero-title">BUILD STRENGTH.<br />TRACK PROGRESS.<br /><em>GO FURTHER.</em></h1><p>Train with purpose. Find your people. Make every session count with a club built around your progress.</p><div className="landing-hero-actions"><Link className="landing-button landing-button-primary" to={destination}>Start your journey <ArrowUpRight size={19} /></Link><a className="landing-button landing-button-outline" href="#membership">Explore plans <ArrowRight size={18} /></a></div></div>
        <div className="landing-hero-rail"><span>01 / 05</span><span className="landing-hero-rail-line" /><span>TRAIN BEYOND LIMITS</span></div>
      </section>

      <div className="landing-marquee" aria-label="GymVerse training philosophy"><span>TRAIN WITH PURPOSE</span><span className="landing-star">✳</span><span>MOVE WITH CONFIDENCE</span><span className="landing-star">✳</span><span>PROGRESS TOGETHER</span><span className="landing-star">✳</span><span>TRAIN WITH PURPOSE</span></div>

      <section id="programs" className="landing-section landing-programs">
        <SectionTitle eyebrow="01 / Find your lane" title={<>TRAINING FOR <em>EVERY AMBITION.</em></>} description="The best routine is the one you keep showing up for. Explore ways to move and make them your own." />
        <div className="landing-program-grid">{programs.map(program => <Link to={destination} className={`landing-program ${program.className}`} key={program.name}><span className="landing-program-index">{program.number} / PROGRAM</span><program.icon size={29} strokeWidth={1.6} /><div><h3>{program.name}</h3><p>{program.detail}</p></div><ArrowUpRight className="landing-program-arrow" size={22} aria-hidden="true" /></Link>)}</div>
      </section>

      <section id="experience" className="landing-experience"><div className="landing-experience-image" role="img" aria-label="Premium functional training studio" /><div className="landing-experience-copy"><p className="landing-eyebrow">02 / Built for the work</p><h2>MORE THAN<br />A PLACE TO <em>TRAIN.</em></h2><p>From the first session to the next milestone, GymVerse brings your training, classes, coaching, and progress into one experience.</p><div className="landing-experience-points"><div><span>01</span><strong>Train your way</strong><small>Workouts and classes for every stage.</small></div><div><span>02</span><strong>See your progress</strong><small>Keep your sessions and achievements in view.</small></div><div><span>03</span><strong>Stay connected</strong><small>Your schedule and support, all in one place.</small></div></div><Link className="landing-text-link" to={destination}>Explore GymVerse <ArrowUpRight size={18} /></Link></div></section>

      <section className="landing-section landing-coaching"><div><p className="landing-eyebrow">Coaching with purpose</p><h2>GUIDANCE FOR<br /><em>YOUR NEXT LEVEL.</em></h2><p>Work with a trainer, follow an assigned plan, and bring more intention to each session. Meet the GymVerse team after signing in.</p><Link className="landing-text-link" to={isAuthenticated ? '/trainers' : '/login'}>Explore trainers <ArrowUpRight size={18} /></Link></div><img src="/gymverse-coaching.jpg" alt="Male coach guiding a male member through a lunge with dumbbells" loading="lazy" width="1672" height="941" /></section>

      <section id="membership" className="landing-section landing-memberships"><SectionTitle eyebrow="03 / Membership" title={<>YOUR GOALS. <em>YOUR PLAN.</em></>} description="Current membership options are loaded from the GymVerse catalogue." action={<div className="landing-toggle" role="group" aria-label="Plan duration"><button type="button" className={period === 'monthly' ? 'active' : ''} onClick={() => setPeriod('monthly')}>Monthly</button><button type="button" className={period === 'longer' ? 'active' : ''} onClick={() => setPeriod('longer')}>Multi-month</button></div>} />
        {plansState === 'loading' ? <div className="landing-loading-grid" aria-label="Loading plans">{[1, 2, 3].map(i => <div key={i} className="landing-skeleton" />)}</div> : plansState === 'error' ? <p className="landing-inline-state" role="alert">{plansError} <a href="#membership" onClick={() => window.location.reload()}>Try again</a></p> : visiblePlans.length ? <div className="landing-plan-grid">{visiblePlans.map((plan, index) => <article className={index === 1 ? 'landing-plan featured' : 'landing-plan'} key={plan.plan_id}><div className="landing-plan-top"><span>{index === 1 ? 'POPULAR CHOICE' : `PLAN 0${index + 1}`}</span><ArrowUpRight size={20} /></div><h3>{plan.plan_name}</h3><p className="landing-plan-description">{plan.description || 'A focused membership to keep your training moving.'}</p><div className="landing-plan-price"><strong>{money(plan.price)}</strong><span> / {Number(plan.duration_months) === 1 ? 'month' : `${plan.duration_months} months`}</span></div><div className="landing-plan-divider" /><p className="landing-plan-access"><Check size={17} /> {plan.access_level || 'Gym access'}</p><Link className={index === 1 ? 'landing-button landing-button-primary' : 'landing-button landing-button-outline'} to={destination}>Choose this plan <ArrowUpRight size={17} /></Link></article>)}</div> : <p className="landing-inline-state">No {period === 'monthly' ? 'monthly' : 'multi-month'} plans are currently available. <button type="button" onClick={() => setPeriod(period === 'monthly' ? 'longer' : 'monthly')}>See other plans</button></p>}
      </section>

      <section id="classes" className="landing-section landing-classes"><SectionTitle eyebrow="04 / On the schedule" title={<>SHOW UP. <em>GET MOVING.</em></>} description="Find an upcoming session that fits your week. Availability comes from the live timetable." action={<Link className="landing-text-link" to={isAuthenticated ? '/classes' : '/login'}>View full schedule <ArrowUpRight size={18} /></Link>} />
        {schedulesState === 'loading' ? <div className="landing-skeleton landing-skeleton-short" aria-label="Loading classes" /> : schedulesState === 'error' ? <p className="landing-inline-state" role="alert">{schedulesError}</p> : availableDays.length ? <><div className="landing-day-tabs" role="group" aria-label="Choose class day">{availableDays.map(item => <button type="button" key={item} className={selectedDay === item ? 'active' : ''} onClick={() => setDay(item)}>{dayLabel(item)}</button>)}</div><div className="landing-schedule-list">{visibleSchedules.map(item => { const remaining = Math.max(0, Number(item.capacity || 0) - Number(item.enrolled_count || 0)); return <article key={item.schedule_id} className="landing-schedule-row"><div className="landing-schedule-time"><CalendarDays size={18} /><strong>{timeLabel(item.start_time)}</strong><span>{timeLabel(item.end_time)}</span></div><div className="landing-schedule-name"><h3>{item.class_name}</h3><p>{item.trainer_name ? `With ${item.trainer_name}` : 'Group training'}{item.room ? ` · ${item.room}` : ''}</p></div><span className={remaining ? 'landing-seats' : 'landing-seats is-full'}>{remaining ? `${remaining} spots left` : 'Fully booked'}</span><Link className="landing-schedule-action" to={isAuthenticated ? '/classes' : '/login'} aria-label={`View ${item.class_name} class`}><ArrowUpRight size={20} /></Link></article>; })}</div></> : <p className="landing-inline-state">No upcoming classes are scheduled right now. Check back soon.</p>}
      </section>

      <section className="landing-section landing-gallery"><SectionTitle eyebrow="05 / Training spaces" title={<>SPACE TO <em>DO THE WORK.</em></>} description="A visual look at the kind of training spaces and coaching experience GymVerse is building." /><div className="landing-gallery-grid">{gallery.map((item, index) => <button type="button" key={item.src} className="landing-gallery-item" onClick={event => { galleryTriggerRef.current = event.currentTarget; setOpenImage(index); }} aria-label={`View ${item.label} image`}><img src={item.src} alt={item.alt} loading="lazy" width="1672" height="941" /><span>{item.label} <ArrowUpRight size={18} /></span></button>)}</div></section>

      <section className="landing-final"><p className="landing-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h2>THE WORK IS YOURS.<br /><em>WE'RE HERE FOR IT.</em></h2><p>Step into a place designed to help you keep moving forward.</p><Link className="landing-button landing-button-primary" to={destination}>Join GymVerse <ArrowUpRight size={19} /></Link></section>
    </main>
    <footer className="landing-footer"><Link className="landing-brand" to="/"><span className="landing-brand-mark"><Dumbbell size={20} /></span><span>GYMVERSE<span className="landing-brand-dot">.</span></span></Link><p>Built for every stronger tomorrow.</p><div><a href="#programs">Programs</a><a href="#membership">Membership</a><a href="#classes">Classes</a><Link to="/login">Sign in</Link></div><small>© {new Date().getFullYear()} GymVerse</small></footer>
    <div className="landing-mobile-cta"><Link to={destination}>Start your journey <ArrowUpRight size={18} /></Link></div>
    {openImage !== null && <div className="landing-lightbox" role="presentation" onClick={closeImage}><div role="dialog" aria-modal="true" aria-label={gallery[openImage].label} onClick={event => event.stopPropagation()}><button ref={closeImageRef} type="button" onClick={closeImage} aria-label="Close image"><X size={24} /></button><img src={gallery[openImage].src} alt={gallery[openImage].alt} /><p>{gallery[openImage].label}</p></div></div>}
  </div>;
}
