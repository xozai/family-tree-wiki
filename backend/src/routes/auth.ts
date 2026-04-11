import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, refresh, logout, me, changePassword, requestPasswordReset, confirmPasswordReset } from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // successful logins don't count toward the limit
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Too many password reset attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.post('/register', register);
authRouter.post('/login', loginLimiter, login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, me);
authRouter.patch('/password', authenticate, changePassword);
authRouter.post('/password-reset/request', passwordResetLimiter, requestPasswordReset);
authRouter.post('/password-reset/confirm', confirmPasswordReset);
