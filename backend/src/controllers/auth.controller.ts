// src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/db';
import { tokenStore } from '../config/redis';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendSuccess, sendCreated, sendError } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';

const googleClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

// ── Register ────────────────────────────────────────────────────────────────
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email already in use', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, name: true, email: true, plan: true, createdAt: true },
    });

    const accessToken = generateAccessToken({ userId: user.id, email: user.email, plan: user.plan });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, plan: user.plan });
    await tokenStore.storeRefreshToken(user.id, refreshToken);

    sendCreated(res, { user, accessToken, refreshToken }, 'Account created successfully');
  } catch (err) {
    next(err);
  }
};

// ── Login ───────────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) throw new AppError('Invalid email or password', 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError('Invalid email or password', 401);

    const accessToken = generateAccessToken({ userId: user.id, email: user.email, plan: user.plan });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, plan: user.plan });
    await tokenStore.storeRefreshToken(user.id, refreshToken);

    sendSuccess(res, {
      user: { id: user.id, name: user.name, email: user.email, plan: user.plan, avatarUrl: user.avatarUrl },
      accessToken,
      refreshToken,
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// ── Google OAuth - get URL ──────────────────────────────────────────────────
export const getGoogleAuthUrl = (_req: Request, res: Response): void => {
  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });
  sendSuccess(res, { url }, 'Google OAuth URL generated');
};

// ── Google OAuth callback ──────────────────────────────────────────────────
export const googleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code } = req.query as { code: string };
    const { tokens } = await googleClient.getToken(code);

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new AppError('Failed to get user info from Google', 400);

    // Upsert user
    let user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name ?? payload.email,
          avatarUrl: payload.picture,
        },
      });
    }

    // Store/Update Gmail account tokens
    await prisma.emailAccount.upsert({
      where: { userId_email: { userId: user.id, email: payload.email } },
      create: {
        userId: user.id,
        provider: 'GMAIL',
        email: payload.email,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        tokenExpiry: new Date(tokens.expiry_date!),
      },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? '',
        tokenExpiry: new Date(tokens.expiry_date!),
        isActive: true,
      },
    });

    const accessToken = generateAccessToken({ userId: user.id, email: user.email, plan: user.plan });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, plan: user.plan });
    await tokenStore.storeRefreshToken(user.id, refreshToken);

    // Redirect to frontend with tokens
    res.redirect(`${env.FRONTEND_URL}/auth/callback?token=${accessToken}&refresh=${refreshToken}`);
  } catch (err) {
    next(err);
  }
};

// ── Refresh Token ─────────────────────────────────────────────────────────
export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) throw new AppError('Refresh token required', 400);

    const payload = verifyRefreshToken(token);
    const stored = await tokenStore.getRefreshToken(payload.userId);

    if (stored !== token) throw new AppError('Invalid refresh token', 401);

    const newAccessToken = generateAccessToken({
      userId: payload.userId,
      email: payload.email,
      plan: payload.plan,
    });

    sendSuccess(res, { accessToken: newAccessToken }, 'Token refreshed');
  } catch (err) {
    next(err);
  }
};

// ── Logout ────────────────────────────────────────────────────────────────
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) await tokenStore.blacklistToken(token);
    if (req.user?.userId) await tokenStore.deleteRefreshToken(req.user.userId);

    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

// ── Get current user ──────────────────────────────────────────────────────
export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true, name: true, email: true, avatarUrl: true,
        plan: true, aiActionsUsed: true, aiActionsLimit: true,
        onboardingDone: true, createdAt: true,
        emailAccounts: { select: { id: true, email: true, provider: true, isActive: true } },
      },
    });
    if (!user) throw new AppError('User not found', 404);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};