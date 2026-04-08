// src/routes/auth.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import {
  register,
  login,
  getGoogleAuthUrl,
  googleCallback,
  refreshToken,
  logout,
  getMe,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimiter';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

// Public
router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validateRequest,
  register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validateRequest,
  login
);

router.get('/google', getGoogleAuthUrl);
router.get('/google/callback', googleCallback);
router.post('/refresh', refreshToken);

// Protected
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

export default router;