const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  registerUser,
  loginUser,
  getMe,
  logoutUser,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const {
  registerValidator,
  loginValidator,
  changePasswordValidator,
  emailOnlyValidator,
  resetPasswordValidator,
  tokenValidator,
  logoutValidator
} = require('../validators/authValidators');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Recovery links cost an email each and are a probing surface, so they get their own,
// tighter budget — separate from sign-in so a burst of resets cannot lock out logins.
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.RECOVERY_RATE_LIMIT, 10) || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' }
});

router.post('/register', authLimiter, registerValidator, validate, registerUser);
router.post('/login', authLimiter, loginValidator, validate, loginUser);
router.post('/logout', requireAuth, logoutValidator, validate, logoutUser);
router.get('/me', requireAuth, getMe);
router.post('/change-password', requireAuth, authLimiter, changePasswordValidator, validate, changePassword);

router.post('/forgot-password', recoveryLimiter, emailOnlyValidator, validate, forgotPassword);
router.post('/reset-password', recoveryLimiter, resetPasswordValidator, validate, resetPassword);
router.post('/verify-email', recoveryLimiter, tokenValidator, validate, verifyEmail);
router.post('/resend-verification', recoveryLimiter, emailOnlyValidator, validate, resendVerification);

module.exports = router;
