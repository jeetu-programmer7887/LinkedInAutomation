// Daily / on-demand research: search what's trending in the author's niche
// with Tavily, then have Groq turn the articles into 3 post ideas (2
// trending + 1 evergreen concept, mirroring the author's best-performing
// posts). Ideas only - the actual post is written later in Compose, from
// the research stored here.
import IdeaBatch from '../models/IdeaBatch.js';
import Post from '../models/Post.js';
import { getProfile } from './profileService.js';
import { search } from './tavilyService.js';
import { completeJson } from './aiService.js';
import { logActivity } from './activityService.js';

// What the model sees is sized to stay inside Groq's free-tier
// tokens-per-minute budget. Each search fetches a deeper pool than that
// (Tavily bills per search, not per result) so articles recent batches
// already used can be skipped and fresh ones take their place.
const TRENDING_RESULTS_PER_TOPIC = 10;
const MAX_TRENDING_ARTICLES = 14;
const MAX_EVERGREEN_ARTICLES = 5;
const EVERGREEN_RESULTS = MAX_EVERGREEN_ARTICLES + 5;
const SNIPPET_CHARS = 350;

const IDEAS_WANTED = 3;
// Batches whose topics the model must avoid, and whose articles go to the
// back of the queue. The weekly news window means consecutive runs see
// mostly the same articles - without this the model has to invent
// off-source titles to avoid recent topics, and grounding rejects them.
const RECENT_TOPIC_BATCHES = 3;
const RECENT_SOURCE_BATCHES = 5;

// A run that has been "running" this long died with the server.
const STALE_RUN_MS = 5 * 60_000;
const RECENT_POST_DAYS = 7;

const BLOCKED_SOURCES = /instagram\.com|facebook\.com|tiktok\.com|youtube\.com|pinterest\.com|reddit\.com/i;

export class ResearchInProgressError extends Error {
  constructor() {
    super('Research is already running - wait for it to finish.');
    this.status = 409;
  }
}

/**
 * Runs one research pass and stores it as an IdeaBatch. Resolves with the
 * finished batch either way; a failed run is saved with its reason so the
 * Schedule page can show it.
 */
export async function runResearch(trigger) {
  const inFlight = await IdeaBatch.exists({
    status: 'running',
    createdAt: { $gte: new Date(Date.now() - STALE_RUN_MS) },
  });
  if (inFlight) {
    throw new ResearchInProgressError();
  }
  await IdeaBatch.updateMany(
    { status: 'running' },
    { status: 'failed', failureReason: 'The run never finished (the server likely stopped mid-run).' }
  );

  const batch = await IdeaBatch.create({ trigger });
  const label = trigger === 'scheduled' ? 'Daily research' : 'On-demand research';
  try {
    const { ideas, articleCount, evergreenQuery } = await research();
    batch.set({ status: 'done', ideas, articleCount, evergreenQuery });
  } catch (err) {
    console.error('[ideas] research failed:', err);
    batch.set({ status: 'failed', failureReason: err.message });
  }
  await batch.save();
  await (batch.status === 'done'
    ? logActivity('research_done', `${label} found ${batch.ideas.length} post ideas`)
    : logActivity('research_failed', `${label} failed: ${batch.failureReason}`));
  return batch;
}

async function research() {
  const profile = await getProfile();
  const [recentPosts, recentBatches] = await Promise.all([recentPostTexts(), recentIdeaTopics()]);
  const evergreenQuery = pickEvergreenQuery(profile.evergreenTopics, recentBatches.evergreenQueries);

  const trendingSearches = profile.trendingTopics.map((topic) =>
    search(topic, { topic: 'news', timeRange: 'week', maxResults: TRENDING_RESULTS_PER_TOPIC, snippetChars: SNIPPET_CHARS })
  );
  const evergreenSearch = evergreenQuery
    ? search(evergreenQuery, { topic: 'general', maxResults: EVERGREEN_RESULTS, snippetChars: SNIPPET_CHARS })
    : Promise.resolve([]);

  const [evergreenResult, ...trendingResults] = await Promise.allSettled([evergreenSearch, ...trendingSearches]);

  const failures = [evergreenResult, ...trendingResults].filter((r) => r.status === 'rejected');
  failures.forEach((r) => console.warn('[ideas] search failed:', r.reason?.message));

  // Tag each article with the search that found it, then take them
  // round-robin across searches: a busy news topic (AI agents, say) would
  // otherwise fill the whole article budget on its own. Articles recent
  // batches already built ideas on only fill whatever room is left.
  const isUsed = (a) => recentBatches.sourceUrls.has(a.url);
  const trendingPool = uniqueArticles(
    trendingResults.flatMap((r, i) =>
      r.status === 'fulfilled' ? r.value.map((a) => ({ ...a, query: profile.trendingTopics[i] })) : []
    )
  );
  const trending = [
    ...roundRobin(trendingPool.filter((a) => !isUsed(a)), (a) => a.query),
    ...roundRobin(trendingPool.filter(isUsed), (a) => a.query),
  ].slice(0, MAX_TRENDING_ARTICLES);
  const evergreenPool = uniqueArticles(evergreenResult.status === 'fulfilled' ? evergreenResult.value : [], trending);
  const evergreen = [...evergreenPool.filter((a) => !isUsed(a)), ...evergreenPool.filter(isUsed)].slice(
    0,
    MAX_EVERGREEN_ARTICLES
  );
  const freshCount = [...trending, ...evergreen].filter((a) => !isUsed(a)).length;
  console.log(`[ideas] ${trending.length + evergreen.length} articles for the model, ${freshCount} not used by recent batches`);

  if (!trending.length && !evergreen.length) {
    throw new Error(failures[0]?.reason?.message || 'Tavily returned no articles for any topic.');
  }

  // One numbering across both lists, so a source id is unambiguous.
  const articles = [
    ...trending.map((a) => ({ ...a, section: 'trending' })),
    ...evergreen.map((a) => ({ ...a, section: 'evergreen' })),
  ].map((a, i) => ({ ...a, id: i + 1 }));
  if (process.env.IDEAS_DEBUG) {
    articles.forEach((a) => console.log(`[ideas:debug] [${a.id}] ${a.section.padEnd(9)} ${a.title.slice(0, 90)}`));
  }

  const wanted = { trending: evergreen.length ? IDEAS_WANTED - 1 : IDEAS_WANTED, evergreen: evergreen.length ? 1 : 0 };
  const selection = { wanted, recentTopics: recentBatches.topics };
  const promptBase = { profile, recentPosts, recentTopics: recentBatches.topics };

  const candidates = await askForIdeas({
    ...promptBase,
    articles,
    counts: evergreen.length ? { trending: 4, evergreen: 2 } : { trending: 5, evergreen: 0 },
  });
  let result = selectIdeas(candidates, articles, selection);

  // Top-up: the grounding checks rightly drop ideas the sources don't back,
  // so ask once more - only for the missing kinds, only from articles no
  // picked idea uses - instead of saving a short batch. The first round's
  // candidates go first, so selection keeps every idea it already picked.
  const missing = missingKinds(result, wanted);
  if (missing.trending + missing.evergreen > 0) {
    const usedUrls = new Set(result.flatMap((i) => i.sources.map((s) => s.url)));
    const unusedArticles = articles.filter((a) => !usedUrls.has(a.url) && (missing[a.section] ?? 0) > 0);
    console.log(
      `[ideas] ${result.length}/${IDEAS_WANTED} ideas survived - asking for ` +
        `${missing.trending} trending + ${missing.evergreen} evergreen more from ${unusedArticles.length} unused articles`
    );
    if (unusedArticles.length) {
      try {
        const extra = await askForIdeas({
          ...promptBase,
          articles: unusedArticles,
          // Twice what's missing: some will fail grounding again.
          counts: { trending: missing.trending * 2, evergreen: missing.evergreen * 2 },
          chosenTopics: result.map((i) => i.topic),
        });
        const combined = selectIdeas([...candidates, ...extra], articles, selection);
        // Greedy selection could in theory trade one pick for another;
        // never let the top-up leave fewer ideas than before.
        if (combined.length >= result.length) result = combined;
      } catch (err) {
        // A short batch beats a failed one (e.g. Groq's per-minute limit).
        console.warn('[ideas] top-up failed, keeping the first round:', err.message);
      }
    }
  }

  if (!result.length) {
    throw new Error('Groq returned no usable ideas (none were backed by the articles found). Try again.');
  }
  if (result.length < IDEAS_WANTED) {
    console.warn(`[ideas] only ${result.length}/${IDEAS_WANTED} ideas after the top-up`);
  }

  return { ideas: result, articleCount: articles.length, evergreenQuery };
}

function askForIdeas(prompt) {
  return completeJson(buildIdeasPrompt(prompt), {
    // Lower than the writing calls: this step is selection and extraction,
    // where creativity mostly shows up as invented detail.
    temperature: 0.5,
    maxTokens: 4000,
  }).then(({ ideas }) => (Array.isArray(ideas) ? ideas : []));
}

function missingKinds(picked, wanted) {
  const have = (kind) => picked.filter((i) => i.kind === kind).length;
  return {
    trending: Math.max(0, wanted.trending - have('trending')),
    evergreen: Math.max(0, wanted.evergreen - have('evergreen')),
  };
}

// Share of a topic's words that marks it as a repeat of a recent idea.
const REPEAT_TOPIC_SHARE = 0.5;

/**
 * Picks the final ideas from the model's ranked candidates, best-first:
 * - only candidates that survive grounding (cleanIdea);
 * - never two ideas on the same article;
 * - trending ideas from different searches, so they cover different
 *   subjects;
 * - candidates that repeat recently suggested topics only as a last resort.
 * The diversity rules relax in a second pass rather than return fewer ideas.
 */
function selectIdeas(candidates, articles, { wanted, recentTopics }) {
  const recentWordSets = recentTopics.map((t) => new Set(contentWords(t)));
  const isRepeat = (topic) => {
    const words = contentWords(topic ?? '');
    return recentWordSets.some((set) => words.length && words.filter((w) => set.has(w)).length / words.length >= REPEAT_TOPIC_SHARE);
  };
  const ordered = [...candidates.filter((c) => !isRepeat(c?.topic)), ...candidates.filter((c) => isRepeat(c?.topic))];

  const picked = [];
  const usedSources = new Set();
  const usedQueries = new Set();
  const taken = new Set();

  for (const strict of [true, false]) {
    for (const raw of ordered) {
      if (taken.has(raw)) continue;
      const cleaned = cleanIdea(raw, articles, usedSources);
      if (cleaned.rejected) {
        if (strict) console.warn(`[ideas] dropped "${raw?.topic}" - ${cleaned.rejected}`);
        continue;
      }
      const { idea, queries } = cleaned;
      if (picked.filter((i) => i.kind === idea.kind).length >= wanted[idea.kind]) continue;
      if (strict && idea.kind === 'trending' && queries.some((q) => usedQueries.has(q))) continue;
      if (strict && isRepeat(idea.topic)) continue;

      taken.add(raw);
      idea.sources.forEach((s) => usedSources.add(s.url));
      queries.forEach((q) => usedQueries.add(q));
      picked.push(idea);
    }
  }

  return picked.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'trending' ? -1 : 1));
}

/** Interleaves items by group: first of each group, then second of each... */
function roundRobin(items, groupOf) {
  const groups = new Map();
  for (const item of items) {
    const key = groupOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const queues = [...groups.values()];
  const out = [];
  for (let i = 0; out.length < items.length; i++) {
    for (const queue of queues) {
      if (i < queue.length) out.push(queue[i]);
    }
  }
  return out;
}

function uniqueArticles(list, alreadySeen = []) {
  const seen = new Set(alreadySeen.map((a) => titleKey(a.title)));
  return list
    .filter((a) => a.title && a.url && !BLOCKED_SOURCES.test(a.url))
    .filter((a) => {
      const key = titleKey(a.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(Boolean(b.content)) - Number(Boolean(a.content)));
}

function titleKey(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
}

// Random, but never the query the last few batches already used, so
// back-to-back "Get fresh ideas" clicks don't return the same concept.
function pickEvergreenQuery(topics, recentQueries) {
  if (!topics.length) return null;
  const fresh = topics.filter((t) => !recentQueries.includes(t));
  const pool = fresh.length ? fresh : topics;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function recentPostTexts() {
  const since = new Date(Date.now() - RECENT_POST_DAYS * 24 * 60 * 60 * 1000);
  const posts = await Post.find({
    status: { $in: ['published', 'scheduled'] },
    $or: [{ publishedAt: { $gte: since } }, { scheduledFor: { $gte: since } }],
  })
    .select('content.text')
    .limit(10);
  return posts.map((p) => (p.content?.text || '').replace(/\s+/g, ' ').slice(0, 160)).filter(Boolean);
}

async function recentIdeaTopics() {
  const batches = await IdeaBatch.find({ status: 'done' })
    .sort({ createdAt: -1 })
    .limit(RECENT_SOURCE_BATCHES)
    .select('ideas.topic ideas.sources.url evergreenQuery');
  const topicBatches = batches.slice(0, RECENT_TOPIC_BATCHES);
  return {
    topics: topicBatches.flatMap((b) => b.ideas.map((i) => i.topic)),
    evergreenQueries: topicBatches.map((b) => b.evergreenQuery).filter(Boolean),
    sourceUrls: new Set(batches.flatMap((b) => b.ideas.flatMap((i) => i.sources.map((s) => s.url))).filter(Boolean)),
  };
}

// Share of a key point's content words that must appear in the articles
// it cites. Paraphrase passes; a claim the articles never made does not.
const MIN_GROUNDED_SHARE = 0.6;
// Titles are short and get paraphrased, so the bar is lower.
const MIN_TOPIC_SHARE = 0.5;
const STOP_WORDS = new Set(
  'about after also been being from have into more most much only over such than that their them then there these they this those very what when where which while will with would your'.split(
    ' '
  )
);

// Both sides of every comparison (idea vs. its articles) go through this,
// so it only has to be consistent, not linguistically exact:
// - any dash splits a compound. The model often writes U+2011 (non-breaking
//   hyphen) where articles use "-"; keeping "-" inside words made
//   "self‑hosted" (title) and "self-hosted" (article) never match, which
//   failed good ideas at 0%;
// - a plain plural "s" is dropped, so "agents" matches "agent".
function contentWords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

const numbersIn = (text) => (String(text).match(/\d[\d,.]*%?/g) || []).map((n) => n.replace(/[.,]$/, ''));

/**
 * Keeps an idea only if the articles it cites actually back it:
 * - key points must be mostly made of words from the cited articles, and
 *   quote only numbers those articles contain;
 * - "why trending" / angle sentences may only use numbers that survived
 *   in a key point (stops a real stat being re-dressed as a different one);
 * - sources another idea already uses don't count.
 * Returns { rejected: reason } when nothing grounded is left.
 */
function cleanIdea(raw, articles, usedSources) {
  const kind = raw?.kind === 'evergreen' ? 'evergreen' : 'trending';
  const cited = [...new Set((raw?.sourceIds || []).map(Number))]
    .map((id) => articles.find((a) => a.id === id))
    .filter((a) => a && a.section === kind && !usedSources.has(a.url))
    .slice(0, 3);
  if (!raw?.topic) return { rejected: 'no topic' };
  if (!cited.length) {
    return { rejected: `cites no unused article from its own section (sourceIds: ${JSON.stringify(raw?.sourceIds ?? null)})` };
  }

  const citedText = cited.map((a) => `${a.title} ${a.content}`).join(' ');
  const citedWords = new Set(contentWords(citedText));
  const grounded = (point) => {
    const words = contentWords(point);
    const share = words.length ? words.filter((w) => citedWords.has(w)).length / words.length : 0;
    return share >= MIN_GROUNDED_SHARE && numbersIn(point).every((n) => citedText.includes(n));
  };

  // The title must describe what the sources are about, not just borrow
  // their facts under a different subject.
  const topicWords = contentWords(raw.topic);
  const topicShare = topicWords.length ? topicWords.filter((w) => citedWords.has(w)).length / topicWords.length : 0;
  if (topicShare < MIN_TOPIC_SHARE) {
    return { rejected: `title not about its sources (${Math.round(topicShare * 100)}% match with [${cited.map((a) => a.id)}])` };
  }

  const keyPoints = (raw.keyPoints || [])
    .map((p) => String(p).trim())
    .filter((p) => p && grounded(p))
    .slice(0, 4);
  if (!keyPoints.length) return { rejected: 'no key point backed by its sources' };

  const verifiedNumbers = new Set(keyPoints.flatMap(numbersIn));
  const keepSupportedSentences = (text) =>
    String(text || '')
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => numbersIn(sentence).every((n) => verifiedNumbers.has(n)))
      .join(' ');

  const formats = ['text', 'text_image', 'text_image_prompts'];
  return {
    idea: {
      kind,
      topic: String(raw.topic).trim(),
      whyTrending: keepSupportedSentences(raw.whyTrending),
      angle: keepSupportedSentences(raw.angle),
      keyPoints,
      suggestedFormat: formats.includes(raw.suggestedFormat) ? raw.suggestedFormat : 'text',
      sources: cited.map(({ title, url, source, content }) => ({ title, url, source, content })),
    },
    // Which searches the sources came from - used to keep ideas diverse.
    queries: [...new Set(cited.map((a) => a.query).filter(Boolean))],
  };
}

/**
 * counts: how many candidates of each kind to ask for.
 * chosenTopics: ideas already picked this run (top-up call) - avoided like
 * recent topics, so the extra candidates cover something else.
 */
function buildIdeasPrompt({ profile, articles, recentPosts, recentTopics, counts, chosenTopics = [] }) {
  const list = (items, empty = '(none)') => (items.length ? items.map((i) => `- ${i}`).join('\n') : empty);
  const section = (name) =>
    articles
      .filter((a) => a.section === name)
      .map(
        (a) =>
          `[${a.id}] ${a.title} (${a.source}${a.publishedDate ? `, ${a.publishedDate}` : ''})` +
          `${a.query ? ` - search: "${a.query}"` : ''}\n${a.content}`
      )
      .join('\n\n') || '(no articles)';
  const asks = [
    counts.trending && `${counts.trending} with kind "trending" built from the trending articles`,
    counts.evergreen && `${counts.evergreen} with kind "evergreen" built from the evergreen concept articles`,
  ].filter(Boolean);
  const total = counts.trending + counts.evergreen;

  return `You find LinkedIn post ideas for one person. You are NOT writing the posts - only the ideas, with the research behind them.

THE AUTHOR
Name: ${profile.name}
Headline: ${profile.headline}
About: ${profile.about}
Audience: ${profile.audience}
Goal: ${profile.goal}
Opinions they hold:
${list(profile.opinions)}
True facts about their work (the ONLY personal experience an angle may refer to):
${list(profile.facts)}

What works for them: short, practical posts about small concepts that prevent real production bugs, and posts on how AI changes real workflows - written as a developer talking to peers.

TRENDING ARTICLES (recent news)
${section('trending')}

EVERGREEN CONCEPT ARTICLES
${section('evergreen')}

Posted or scheduled in the last ${RECENT_POST_DAYS} days - do not repeat these topics:
${list(recentPosts)}

Already suggested recently - pick different topics:
${list(recentTopics)}
${
  chosenTopics.length
    ? `
Already chosen in this run - every new idea must be about a different subject:
${list(chosenTopics)}
`
    : ''
}
TASK
Return ${total} candidate ideas: ${asks.join(', then ')}.
Rank each kind best first: most likely to perform well with this audience, and where the author can say something specific.

Every idea must be about what its cited articles are actually about. If no article covers a subject, do not suggest it - never build an idea or a key point from the author's opinions or facts.
Ideas must be about clearly different subjects and must not share a source. Build each trending candidate from a different search (the "search:" label on each article).
A number in whyTrending or angle must also appear in that idea's keyPoints and keep exactly the same meaning (a forecast stays a forecast; "40% of projects" never becomes "40% of customers").

For each idea:
- topic: a short, specific title (not a headline copied from an article).
- whyTrending: 1-2 sentences on why this matters right now. For evergreen, why developers keep getting it wrong.
- angle: 1-2 sentences on the take the author could argue - an opinion or an observation about the news, written as "Argue that..." or "Point out that...".
  Connect it to one of the author's facts ONLY when the connection is direct and obvious, and then only restate that fact as written. Never add events, problems, observations, fixes, or results to a fact. Most angles need no personal fact at all.
  BAD (invents an experience): "In ZYRO I once saw the cron job cause a latency spike, and fixing it taught me..."
  BAD (forced link): "Rotating API keys in JPsyche shows why agents need runtime monitoring."
  GOOD (shape only - write your own words for each idea): "Argue that <a specific, debatable claim about this news>, because <a reason drawn from the articles>." Add "(the author built <fact, restated>)" only when that fact is directly about the same subject.
- keyPoints: 2-4 concrete facts or data points taken ONLY from the cited articles. Copy numbers exactly as the article states them. Never invent statistics, companies, people, quotes, or results.
- sourceIds: the [number] ids of 1-3 articles the idea is built on, from its own section.
- suggestedFormat: "text", "text_image", or "text_image_prompts" (an explainer that would benefit from infographics).

Respond with a single JSON object and nothing else:
{"ideas":[{"kind":"trending","topic":"","whyTrending":"","angle":"","keyPoints":[""],"sourceIds":[1],"suggestedFormat":"text"}]}`;
}

/** One idea from a stored batch, or null if the batch or index is gone. */
export async function findIdea(batchId, index) {
  const batch = await IdeaBatch.findById(batchId).catch(() => null);
  return batch?.ideas?.[Number(index)] ?? null;
}

/**
 * The block appended to the Compose caption prompts when a post is written
 * from an idea: the stored research, the author's verified facts, and
 * their past posts as a voice reference.
 */
export async function researchContextFor(idea) {
  const profile = await getProfile();
  const list = (items) => items.map((i) => `- ${i}`).join('\n');
  const sources = idea.sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.source})${s.content ? `\n${s.content}` : ''}`)
    .join('\n\n');
  const styleExamples = profile.stylePosts.map((p, i) => `--- Example ${i + 1} ---\n${p}`).join('\n\n');

  return `
RESEARCH BEHIND THIS POST
Build the post on this research. It is the only source of outside facts: use its details, copy any number exactly as written, and never add statistics, companies, people, quotes, or results that are not in it. Do not put links in the caption.

Topic: ${idea.topic}
Why it matters now: ${idea.whyTrending}
Suggested angle: ${idea.angle}
Key facts:
${list(idea.keyPoints)}

Sources:
${sources}

ABOUT THE AUTHOR
${profile.name} - ${profile.headline}
Audience: ${profile.audience}
The only personal experiences the caption may claim (anything else must be phrased as an observation, not as something that happened to them):
${list(profile.facts)}

THEIR PAST POSTS - match this voice and structure only; never reuse their facts, numbers, or stories:
${styleExamples}
`;
}
