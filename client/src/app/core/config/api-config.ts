// Central place for API endpoints. The server's origin is API_URL from
// client/.env (or the Vercel project settings), baked in at build time by
// scripts/set-env.js.
import { API_URL } from './env.generated';

export const API_BASE_URL = `${API_URL}/api`;
export const SOCKET_URL = API_URL;
