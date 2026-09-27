import AuthorProfile from '../models/AuthorProfile.js';
import AppSettings from '../models/AppSettings.js';
import { defaultProfile } from '../config/defaultProfile.js';

// Both collections hold exactly one document. Upsert-on-read keeps that
// true without a separate seed step: the first read creates it.
export async function getProfile() {
  return AuthorProfile.findOneAndUpdate({}, { $setOnInsert: defaultProfile }, { upsert: true, returnDocument: 'after' });
}

export async function getSettings() {
  return AppSettings.findOneAndUpdate({}, { $setOnInsert: {} }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
}

export async function updateSettings(changes) {
  await getSettings();
  return AppSettings.findOneAndUpdate({}, { $set: changes }, { returnDocument: 'after' });
}
