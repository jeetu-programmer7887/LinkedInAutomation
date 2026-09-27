// Web/news search via Tavily (https://docs.tavily.com). Plain fetch - the
// API is a single POST - behind the same primary/backup key pool as Groq.
import { tavily } from '../config/env.js';
import { createKeyPool, cooldown, retryAfterMs } from '../utils/keyPool.js';

const API_URL = 'https://api.tavily.com/search';
const TIMEOUT_MS = 30_000;

class TavilyError extends Error {
  constructor(status, message, headers) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

// 432/433 are Tavily's plan-credit and pay-as-you-go limits: the key is
// spent for a long while, so bench it well past a normal rate limit.
function classifyTavilyError(error) {
  const status = error?.status;
  if (status === 401 || status === 403) {
    return { failover: true, cooldownMs: cooldown.HOUR, reason: `auth ${status}` };
  }
  if (status === 432 || status === 433) {
    return { failover: true, cooldownMs: 6 * cooldown.HOUR, reason: 'credit limit reached' };
  }
  if (status === 429) {
    return { failover: true, cooldownMs: retryAfterMs(error.headers) ?? cooldown.MINUTE, reason: 'rate limited' };
  }
  if (status === undefined || status >= 500) {
    return { failover: true, cooldownMs: cooldown.MINUTE, reason: status ? `server ${status}` : 'connection failed' };
  }
  return { failover: false };
}

const tavilyPool = createKeyPool('tavily', tavily.apiKeys, classifyTavilyError);

async function request(apiKey, body) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.detail?.error || parsed?.detail || parsed?.error || detail;
    } catch {
      // Not JSON - keep the raw snippet.
    }
    throw new TavilyError(response.status, `Tavily ${response.status}: ${detail}`, response.headers);
  }
  return JSON.parse(text);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * One search, normalised to { title, url, content, source, publishedDate }.
 * topic "news" is recent reporting; "general" suits evergreen concepts.
 */
export async function search(query, { topic = 'news', timeRange, maxResults = 8, snippetChars = 400 } = {}) {
  const body = {
    query,
    topic,
    search_depth: 'basic',
    max_results: maxResults,
    include_answer: false,
  };
  if (timeRange) body.time_range = timeRange;

  const data = await tavilyPool.run((apiKey) => request(apiKey, body));

  return (data.results || []).map((r) => ({
    title: (r.title || '').trim(),
    url: r.url || '',
    content: (r.content || '').replace(/\s+/g, ' ').trim().slice(0, snippetChars),
    source: hostOf(r.url),
    publishedDate: r.published_date || null,
  }));
}
