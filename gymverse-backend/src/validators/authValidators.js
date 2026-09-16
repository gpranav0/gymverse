const { check } = require('express-validator');

// Long-but-simple passphrases beat short-but-gnarly passwords, so the floor is length
// with a light mixed-character requirement rather than a wall of symbol rules. Shared by
// every place a password is set, so the rule cannot differ between signup and reset.
const passwordRule = (field) =>
  check(field)
    .isString().withMessage('Password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number');

const emailRule = () =>
  check('email')
    .isEmail().withMessage('Please include a valid email')
    .isLength({ max: 100 }).withMessage('Email must be at most 100 characters')
    .normalizeEmail();

// Names, usernames and phone numbers are stored raw and escaped at render time by React.
// The old `.escape()` here HTML-encoded them on the way *into* the database, so
// "O'Brien" was persisted as "O&#x27;Brien" and stayed wrong everywhere downstream.
const registerValidator = [
  check('username')
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Username must be 3-100 characters')
    .matches(/^[A-Za-z0-9._-]+$/).withMessage('Username may only contain letters, numbers, dot, underscore and hyphen'),
  check('name')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  check('phone')
    .trim()
    .matches(/^[0-9+\-\s()]{7,20}$/).withMessage('Phone must be 7-20 digits and may include + - ( ) and spaces'),
  emailRule(),
  passwordRule('password'),
  check('role_name').isIn(['member', 'trainer']).withMessage('Role must be member or trainer'),
  check('specialization').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  check('qualification').optional({ values: 'falsy' }).trim().isLength({ max: 200 })
];

const loginValidator = [
  check('email').isEmail().withMessage('Please include a valid email').normalizeEmail(),
  check('password').isString().notEmpty().withMessage('Password is required')
];

const changePasswordValidator = [
  check('current_password').isString().notEmpty().withMessage('Current password is required'),
  passwordRule('new_password')
];

const emailOnlyValidator = [emailRule()];

const tokenRule = () =>
  check('token').isString().isLength({ min: 20, max: 200 }).withMessage('A valid link token is required');

const resetPasswordValidator = [tokenRule(), passwordRule('password')];

const tokenValidator = [tokenRule()];

const logoutValidator = [
  check('everywhere').optional().isBoolean({ strict: true }).withMessage('everywhere must be true or false')
];

module.exports = {
  registerValidator,
  loginValidator,
  changePasswordValidator,
  emailOnlyValidator,
  resetPasswordValidator,
  tokenValidator,
  logoutValidator
};
