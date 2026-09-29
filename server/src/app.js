import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { allowedClientUrls } from './config/env.js';
import { connectDb } from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import postRoutes from './routes/postRoutes.js';
import ideaRoutes from './routes/ideaRoutes.js';
import cronRoutes from './routes/cronRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { requireLogin } from './middleware/auth.js';

const app = express();

// Behind Vercel's (or any) proxy: take the client IP from X-Forwarded-For,
// so the login rate limit counts per visitor rather than per proxy.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: allowedClientUrls, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send(`<h1> Working well... :)`)
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Every API route needs MongoDB. A no-op once connected; on Vercel this is
// what opens the connection, since server.js never runs there.
app.use('/api', async (_req, _res, next) => {
  await connectDb();
  next();
});

// Open: login/session/logout (the LinkedIn OAuth routes inside gate
// themselves), and cron, which has its own secret.
app.use('/api/auth', authRoutes);
app.use('/api/cron', cronRoutes);

// Everything else needs the username/password login (7-day cookie).
app.use('/api/users', requireLogin, userRoutes);
app.use('/api/posts', requireLogin, postRoutes);
app.use('/api/ideas', requireLogin, ideaRoutes);
app.use('/api/settings', requireLogin, settingsRoutes);
app.use('/api/dashboard', requireLogin, dashboardRoutes);

// Central error handler - express-async-errors forwards thrown/rejected
// errors from the async route handlers above here instead of crashing.
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.response?.status && err.response.status < 600 ? err.response.status : 500;
  res.status(status).json({
    error: err.response?.data?.message || err.message || 'Internal server error',
  });
});

export default app;
