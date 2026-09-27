import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { clientUrl } from './config/env.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import postRoutes from './routes/postRoutes.js';
import ideaRoutes from './routes/ideaRoutes.js';
import cronRoutes from './routes/cronRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send(`<h1> Working well... :)`)
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/ideas', ideaRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);

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
