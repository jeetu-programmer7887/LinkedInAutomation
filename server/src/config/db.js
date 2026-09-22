import mongoose from 'mongoose';
import { mongoUri } from './env.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri);
  console.log(`[db] connected to ${mongoUri}`);
}
