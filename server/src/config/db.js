import mongoose from 'mongoose';
import { mongoUri } from './env.js';

let connection = null;

/**
 * Connects once and reuses the connection. Locally server.js awaits this at
 * startup; on Vercel (which runs app.js as a serverless function and never
 * runs server.js) the middleware in app.js awaits it on the first request.
 */
export function connectDb() {
  if (!connection) {
    mongoose.set('strictQuery', true);
    connection = mongoose
      .connect(mongoUri, { serverSelectionTimeoutMS: 10_000 })
      .then(() => console.log('[db] connected'))
      .catch((err) => {
        connection = null; // let the next request retry
        throw err;
      });
  }
  return connection;
}
