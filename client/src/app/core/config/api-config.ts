// Central place for API endpoints. The server's origin comes from API_URL,
// baked in at build time by scripts/set-env.js (production by default; set
// API_URL=http://localhost:3000 in client/.env to use a local backend).
import { API_URL } from './env.generated';

export const API_BASE_URL = `${API_URL}/api`;
export const SOCKET_URL = API_URL;
