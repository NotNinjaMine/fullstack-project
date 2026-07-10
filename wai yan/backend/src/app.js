const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/errorHandler');
const { fail } = require('./utils/response');
const {
  securityHeaders,
  apiRateLimit,
  assertJwtSecretConfigured,
} = require('./middleware/securityMiddleware');

const authRoutes = require('./routes/authRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const aiRoutes = require('./routes/aiRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');

assertJwtSecretConfigured();

const app = express();

// Behind reverse proxy (Render/nginx) so req.ip is correct for rate limits
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(securityHeaders);

const corsOrigin = process.env.FRONTEND_URL;
app.use(
  cors({
    // In production set FRONTEND_URL; otherwise allow local dev origins
    origin: corsOrigin
      ? corsOrigin
      : process.env.NODE_ENV === 'production'
        ? false
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Cap JSON body size (DoS / oversized payload protection)
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '100kb' }));

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', ts: new Date().toISOString() } });
});

// Light rate limit on all /api (login has stricter limit in authRoutes)
app.use('/api', apiRateLimit);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);

app.use((req, res) => {
  fail(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
});

app.use(errorHandler);

module.exports = app;
