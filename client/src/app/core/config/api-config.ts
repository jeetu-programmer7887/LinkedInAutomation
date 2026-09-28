// Central place for API endpoints. Both URLs come from environment variables,
// baked in at build time by scripts/set-env.js. Which one is used is decided
// here, when the app loads: opened on localhost it talks to the local
// backend, anywhere else (the deployed site) to API_URL.
import { API_URL } from './env.generated';

const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

const SERVER_URL = API_URL;

export const API_BASE_URL = `${SERVER_URL}/api`;
export const SOCKET_URL = SERVER_URL;
