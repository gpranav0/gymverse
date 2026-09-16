const { body, query } = require('express-validator');

// Mirrors of the CHECK constraints in database/01_schema.sql. Keeping them here means a
// bad value is a 400 with a useful message rather than a constraint violation bubbling
// up from the driver.
const GENDERS = ['Male', 'Female', 'Other'];
const MEMBER_STATUSES = ['active', 'inactive', 'suspended', 'expired'];
const TRAINER_STATUSES = ['active', 'inactive'];
const PLAN_STATUSES = ['active', 'inactive'];
const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer'];
const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'];
const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'];
const ASSIGNMENT_STATUSES = ['assigned', 'in_progress', 'completed', 'cancelled'];
// Must match attendance.check_in_method in 01_schema.sql (and swagger.yaml). This list had
// drifted to 'card', which passed validation and then failed the CHECK, while the
// schema's own 'app' was rejected.
const CHECK_IN_METHODS = ['manual', 'qr', 'biometric', 'app'];

const oneOf = (list) => `must be one of: ${list.join(', ')}`;

// `optional({ values: 'falsy' })` treats '' and null as "not supplied", which is what an
// untouched form field actually sends. The stricter default would reject them outright.
const opt = (field) => body(field).optional({ values: 'falsy' });

// For numbers that must be positive. `opt` counts 0 as "not supplied" because 0 is falsy,
// so `duration_minutes: 0` skipped its min-1 rule and reached the schema's > 0 CHECK as a
// driver error. This skips only genuinely absent values: undefined, null and ''.
const optNum = (field) => body(field).if((value) => value !== undefined && value !== null && value !== '');

const nameRule = (field, label, max = 100) =>
  body(field).trim().isLength({ min: 2, max }).withMessage(`${label} must be 2-${max} characters`);

const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

const phoneRule = (field, label) =>
  body(field).trim().matches(PHONE_RE).withMessage(`${label} must be 7-20 digits`);

const optPhoneRule = (field, label) =>
  opt(field).trim().matches(PHONE_RE).withMessage(`${label} must be 7-20 digits`);

const today = () => new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------------- members */

const memberCreateValidator = [
  body('member_code').trim().isLength({ min: 1, max: 50 }).withMessage('member_code is required (max 50 chars)'),
  nameRule('member_name', 'member_name'),
  phoneRule('phone', 'phone'),
  body('email').isEmail().withMessage('A valid email is required').isLength({ max: 100 }).normalizeEmail(),
  opt('gender').isIn(GENDERS).withMessage(`gender ${oneOf(GENDERS)}`),
  opt('date_of_birth').isISO8601().withMessage('date_of_birth must be a date (YYYY-MM-DD)')
    .isBefore(today()).withMessage('date_of_birth must be in the past'),
  opt('address').trim().isLength({ max: 500 }),
  opt('emergency_contact_name').trim().isLength({ max: 100 }),
  optPhoneRule('emergency_contact_phone', 'emergency_contact_phone'),
  opt('status').isIn(MEMBER_STATUSES).withMessage(`status ${oneOf(MEMBER_STATUSES)}`)
];

// PUT replaces the record, so the core fields are mandatory. PATCH is the partial verb.
const memberUpdateValidator = [
  nameRule('member_name', 'member_name'),
  phoneRule('phone', 'phone'),
  opt('address').trim().isLength({ max: 500 }),
  opt('emergency_contact_name').trim().isLength({ max: 100 }),
  optPhoneRule('emergency_contact_phone', 'emergency_contact_phone'),
  opt('status').isIn(MEMBER_STATUSES).withMessage(`status ${oneOf(MEMBER_STATUSES)}`)
];

const memberPatchValidator = [
  opt('member_name').trim().isLength({ min: 2, max: 100 }).withMessage('member_name must be 2-100 characters'),
  optPhoneRule('phone', 'phone'),
  opt('address').trim().isLength({ max: 500 }),
  opt('emergency_contact_name').trim().isLength({ max: 100 }),
  optPhoneRule('emergency_contact_phone', 'emergency_contact_phone'),
  opt('status').isIn(MEMBER_STATUSES).withMessage(`status ${oneOf(MEMBER_STATUSES)}`)
];

/* --------------------------------------------------------------- trainers */

const trainerCreateValidator = [
  body('trainer_code').trim().isLength({ min: 1, max: 50 }).withMessage('trainer_code is required (max 50 chars)'),
  nameRule('trainer_name', 'trainer_name'),
  phoneRule('phone', 'phone'),
  body('email').isEmail().withMessage('A valid email is required').isLength({ max: 100 }).normalizeEmail(),
  opt('specialization').trim().isLength({ max: 100 }),
  opt('qualification').trim().isLength({ max: 200 }),
  opt('experience_years').isInt({ min: 0, max: 80 }).withMessage('experience_years must be 0-80'),
  opt('shift').trim().isLength({ max: 50 }),
  opt('bio').trim().isLength({ max: 2000 }),
  opt('status').isIn(TRAINER_STATUSES).withMessage(`status ${oneOf(TRAINER_STATUSES)}`)
];

const trainerUpdateValidator = [
  nameRule('trainer_name', 'trainer_name'),
  phoneRule('phone', 'phone'),
  opt('specialization').trim().isLength({ max: 100 }),
  opt('qualification').trim().isLength({ max: 200 }),
  opt('experience_years').isInt({ min: 0, max: 80 }).withMessage('experience_years must be 0-80'),
  opt('shift').trim().isLength({ max: 50 }),
  opt('bio').trim().isLength({ max: 2000 }),
  opt('status').isIn(TRAINER_STATUSES).withMessage(`status ${oneOf(TRAINER_STATUSES)}`)
];

const trainerPatchValidator = [
  opt('trainer_name').trim().isLength({ min: 2, max: 100 }).withMessage('trainer_name must be 2-100 characters'),
  optPhoneRule('phone', 'phone'),
  opt('specialization').trim().isLength({ max: 100 }),
  opt('qualification').trim().isLength({ max: 200 }),
  opt('experience_years').isInt({ min: 0, max: 80 }).withMessage('experience_years must be 0-80'),
  opt('shift').trim().isLength({ max: 50 }),
  opt('bio').trim().isLength({ max: 2000 }),
  opt('status').isIn(TRAINER_STATUSES).withMessage(`status ${oneOf(TRAINER_STATUSES)}`)
];

/* -------------------------------------------------------- membership plans */

const planCreateValidator = [
  body('plan_name').trim().isLength({ min: 2, max: 100 }).withMessage('plan_name must be 2-100 characters'),
  body('duration_months').isInt({ min: 1, max: 120 }).withMessage('duration_months must be 1-120'),
  body('price').isFloat({ min: 0, max: 99999999 }).withMessage('price must be a non-negative number'),
  opt('description').trim().isLength({ max: 2000 }),
  opt('access_level').trim().isLength({ max: 50 }),
  opt('status').isIn(PLAN_STATUSES).withMessage(`status ${oneOf(PLAN_STATUSES)}`)
];

const planPatchValidator = [
  opt('plan_name').trim().isLength({ min: 2, max: 100 }).withMessage('plan_name must be 2-100 characters'),
  opt('duration_months').isInt({ min: 1, max: 120 }).withMessage('duration_months must be 1-120'),
  opt('price').isFloat({ min: 0, max: 99999999 }).withMessage('price must be a non-negative number'),
  opt('description').trim().isLength({ max: 2000 }),
  opt('access_level').trim().isLength({ max: 50 }),
  opt('status').isIn(PLAN_STATUSES).withMessage(`status ${oneOf(PLAN_STATUSES)}`)
];

/* --------------------------------------------------- subscriptions/payments */

const subscriptionCreateValidator = [
  body('member_id').isInt({ min: 1 }).withMessage('member_id must be a positive integer'),
  body('plan_id').isInt({ min: 1 }).withMessage('plan_id must be a positive integer'),
  body('payment_method').isIn(PAYMENT_METHODS).withMessage(`payment_method ${oneOf(PAYMENT_METHODS)}`),
  opt('notes').trim().isLength({ max: 1000 })
];

const paymentCreateValidator = [
  body('subscription_id').isInt({ min: 1 }).withMessage('subscription_id must be a positive integer'),
  body('member_id').isInt({ min: 1 }).withMessage('member_id must be a positive integer'),
  // The schema enforces amount > 0; catching it here turns a driver-level check
  // violation into an actionable message.
  body('amount').isFloat({ gt: 0, max: 99999999 }).withMessage('amount must be greater than 0'),
  body('payment_method').isIn(PAYMENT_METHODS).withMessage(`payment_method ${oneOf(PAYMENT_METHODS)}`),
  opt('notes').trim().isLength({ max: 1000 })
];

const paymentPatchValidator = [
  opt('payment_status').isIn(PAYMENT_STATUSES).withMessage(`payment_status ${oneOf(PAYMENT_STATUSES)}`),
  opt('notes').trim().isLength({ max: 1000 })
];

/* ------------------------------------------------------------- attendance */

const checkInValidator = [
  opt('member_id').isInt({ min: 1 }).withMessage('member_id must be a positive integer'),
  opt('check_in_method').isIn(CHECK_IN_METHODS).withMessage(`check_in_method ${oneOf(CHECK_IN_METHODS)}`)
];

const checkOutValidator = [
  opt('member_id').isInt({ min: 1 }).withMessage('member_id must be a positive integer')
];

/* -------------------------------------------------------------- exercises */

const exerciseValidator = [
  body('exercise_name').trim().isLength({ min: 2, max: 100 }).withMessage('exercise_name must be 2-100 characters'),
  opt('description').trim().isLength({ max: 2000 }),
  opt('muscle_group').trim().isLength({ max: 50 }),
  opt('secondary_muscle_group').trim().isLength({ max: 50 }),
  opt('equipment_required').trim().isLength({ max: 100 }),
  opt('difficulty_level').isIn(DIFFICULTY_LEVELS).withMessage(`difficulty_level ${oneOf(DIFFICULTY_LEVELS)}`),
  opt('instructions').trim().isLength({ max: 5000 })
];

/* ----------------------------------------------------------- workout plans */

// The exercise list is inserted one row at a time inside a transaction, so an unbounded
// array is an easy way to hold a pool connection open indefinitely.
const MAX_PLAN_EXERCISES = 200;

const workoutPlanCreateValidator = [
  body('plan_name').trim().isLength({ min: 2, max: 100 }).withMessage('plan_name must be 2-100 characters'),
  opt('description').trim().isLength({ max: 2000 }),
  opt('goal_type').trim().isLength({ max: 50 }),
  opt('difficulty_level').isIn(DIFFICULTY_LEVELS).withMessage(`difficulty_level ${oneOf(DIFFICULTY_LEVELS)}`),
  optNum('duration_weeks').isInt({ min: 1, max: 260 }).withMessage('duration_weeks must be 1-260'),
  opt('trainer_id').isInt({ min: 1 }).withMessage('trainer_id must be a positive integer'),
  body('exercises').optional().isArray({ max: MAX_PLAN_EXERCISES })
    .withMessage(`exercises must be an array of at most ${MAX_PLAN_EXERCISES} items`),
  body('exercises.*.exercise_id').isInt({ min: 1 }).withMessage('exercises[].exercise_id must be a positive integer'),
  optNum('exercises.*.day_number').isInt({ min: 1, max: 366 }).withMessage('exercises[].day_number must be 1-366'),
  optNum('exercises.*.order_number').isInt({ min: 1, max: 500 }).withMessage('exercises[].order_number must be 1-500'),
  optNum('exercises.*.sets').isInt({ min: 1, max: 100 }).withMessage('exercises[].sets must be 1-100'),
  optNum('exercises.*.repetitions').isInt({ min: 1, max: 1000 }).withMessage('exercises[].repetitions must be 1-1000'),
  opt('exercises.*.duration_seconds').isInt({ min: 0, max: 86400 }).withMessage('exercises[].duration_seconds must be 0-86400'),
  opt('exercises.*.rest_seconds').isInt({ min: 0, max: 86400 }).withMessage('exercises[].rest_seconds must be 0-86400')
];

const assignWorkoutValidator = [
  body('member_id').isInt({ min: 1 }).withMessage('member_id must be a positive integer'),
  body('workout_plan_id').isInt({ min: 1 }).withMessage('workout_plan_id must be a positive integer'),
  opt('assigned_by_trainer_id').isInt({ min: 1 }).withMessage('assigned_by_trainer_id must be a positive integer'),
  opt('start_date').isISO8601().withMessage('start_date must be a date (YYYY-MM-DD)'),
  opt('end_date').isISO8601().withMessage('end_date must be a date (YYYY-MM-DD)'),
  opt('notes').trim().isLength({ max: 1000 })
];

const memberWorkoutPatchValidator = [
  opt('status').isIn(ASSIGNMENT_STATUSES).withMessage(`status ${oneOf(ASSIGNMENT_STATUSES)}`),
  opt('completion_percentage').isInt({ min: 0, max: 100 }).withMessage('completion_percentage must be 0-100'),
  opt('notes').trim().isLength({ max: 1000 })
];

const workoutSessionValidator = [
  opt('member_id').isInt({ min: 1 }).withMessage('member_id must be a positive integer'),
  opt('workout_plan_id').isInt({ min: 1 }).withMessage('workout_plan_id must be a positive integer'),
  // The schema requires duration_minutes > 0, so 0 used to pass here and fail in the driver.
  optNum('duration_minutes').isInt({ min: 1, max: 1440 }).withMessage('duration_minutes must be 1-1440'),
  // NUMERIC(8,2) in the schema: decimals are valid.
  opt('calories_burned').isFloat({ min: 0, max: 100000 }).withMessage('calories_burned must be 0-100000'),
  body('completed').optional().isBoolean().withMessage('completed must be a boolean'),
  opt('notes').trim().isLength({ max: 1000 })
];

/* ------------------------------------------------------- classes/schedules */

const classValidator = [
  body('class_name').trim().isLength({ min: 2, max: 100 }).withMessage('class_name must be 2-100 characters'),
  opt('description').trim().isLength({ max: 2000 }),
  opt('difficulty_level').isIn(DIFFICULTY_LEVELS).withMessage(`difficulty_level ${oneOf(DIFFICULTY_LEVELS)}`),
  optNum('duration_minutes').isInt({ min: 1, max: 1440 }).withMessage('duration_minutes must be 1-1440'),
  opt('status').isIn(['active', 'inactive']).withMessage('status must be active or inactive')
];

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

const scheduleCreateValidator = [
  body('class_id').isInt({ min: 1 }).withMessage('class_id must be a positive integer'),
  body('trainer_id').isInt({ min: 1 }).withMessage('trainer_id must be a positive integer'),
  body('class_date').isISO8601().withMessage('class_date must be a date (YYYY-MM-DD)'),
  body('start_time').matches(TIME_RE).withMessage('start_time must be HH:MM or HH:MM:SS'),
  body('end_time').matches(TIME_RE).withMessage('end_time must be HH:MM or HH:MM:SS'),
  // capacity is required here even though the column is nullable: a NULL capacity made
  // every "is this class full?" comparison evaluate to NULL, so the class never filled.
  body('capacity').isInt({ min: 1, max: 1000 }).withMessage('capacity must be 1-1000'),
  opt('room').trim().isLength({ max: 50 })
];

const enrollValidator = [
  opt('member_id').isInt({ min: 1 }).withMessage('member_id must be a positive integer')
];

const scheduleUpdateValidator = [
  opt('status').isIn(['scheduled', 'completed', 'cancelled']).withMessage('status must be scheduled, completed or cancelled'),
  optNum('capacity').isInt({ min: 1, max: 1000 }).withMessage('capacity must be 1-1000'),
  opt('room').trim().isLength({ max: 50 })
];

const scheduleListQuery = [
  query('include').optional().isIn(['cancelled']).withMessage('include may only be "cancelled"')
];

/* ------------------------------------------------------ trainer assignments */

const ROSTER_STATUSES = ['active', 'completed', 'cancelled'];

const trainerAssignmentQuery = [
  query('status').optional().isIn([...ROSTER_STATUSES, 'all']).withMessage(`status ${oneOf([...ROSTER_STATUSES, 'all'])}`),
  query('trainer_id').optional().isInt({ min: 1 }).withMessage('trainer_id must be a positive integer'),
  query('member_id').optional().isInt({ min: 1 }).withMessage('member_id must be a positive integer')
];

const trainerAssignmentCreateValidator = [
  body('member_id').isInt({ min: 1 }).withMessage('member_id must be a positive integer'),
  body('trainer_id').isInt({ min: 1 }).withMessage('trainer_id must be a positive integer'),
  opt('start_date').isISO8601().withMessage('start_date must be a date (YYYY-MM-DD)'),
  opt('end_date').isISO8601().withMessage('end_date must be a date (YYYY-MM-DD)'),
  opt('notes').trim().isLength({ max: 1000 })
];

const trainerAssignmentUpdateValidator = [
  opt('status').isIn(ROSTER_STATUSES).withMessage(`status ${oneOf(ROSTER_STATUSES)}`),
  opt('end_date').isISO8601().withMessage('end_date must be a date (YYYY-MM-DD)'),
  opt('notes').trim().isLength({ max: 1000 })
];

/* ------------------------------------------------------------------- chat */

const chatValidator = [
  body('message').isString().withMessage('message must be text')
    .trim().isLength({ min: 1, max: 2000 }).withMessage('message must be 1-2000 characters'),
  body('conversationHistory').optional().isArray({ max: 20 })
    .withMessage('conversationHistory must be an array of at most 20 turns'),
  body('conversationHistory.*.role').isIn(['user', 'model', 'assistant'])
    .withMessage('conversationHistory[].role must be user, model or assistant'),
  body('conversationHistory.*.content').isString().isLength({ min: 1, max: 4000 })
    .withMessage('conversationHistory[].content must be 1-4000 characters'),
  // Strict, so the string "false" can't be read as truthy and silently skip saving.
  body('temporary').optional().isBoolean({ strict: true })
    .withMessage('temporary must be true or false')
];

module.exports = {
  memberCreateValidator, memberUpdateValidator, memberPatchValidator,
  trainerCreateValidator, trainerUpdateValidator, trainerPatchValidator,
  planCreateValidator, planPatchValidator,
  subscriptionCreateValidator, paymentCreateValidator, paymentPatchValidator,
  checkInValidator, checkOutValidator,
  exerciseValidator,
  workoutPlanCreateValidator, assignWorkoutValidator,
  memberWorkoutPatchValidator, workoutSessionValidator,
  classValidator, scheduleCreateValidator, enrollValidator,
  chatValidator,
  scheduleUpdateValidator, scheduleListQuery,
  trainerAssignmentQuery, trainerAssignmentCreateValidator, trainerAssignmentUpdateValidator
};
