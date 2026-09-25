// Caption generation via the Groq SDK (OpenAI-style chat completions).
// Replaced the Gemini integration, which broke when Google retired
// gemini-2.5-flash for new users. Groq also rotates models on short
// notice, so the model id lives in .env (GROQ_MODEL) rather than here.
import Groq from 'groq-sdk';
import { groq as groqConfig } from '../config/env.js';

const client = new Groq({ apiKey: groqConfig.apiKey });

// Groq's raw SDK errors are terse. Annotate the ones we actually hit so a
// retired model or a bad key reads as itself instead of a generic 500.
function describeGroqError(error) {
  const status = error?.status ?? error?.code;
  const message = String(error?.message ?? error);

  if (status === 401) {
    return "Groq auth failed. Check GROQ_API_KEY in .env - keys start with 'gsk_'.";
  }
  if (status === 404 || /decommissioned|does not exist/i.test(message)) {
    return `Groq model "${groqConfig.model}" is unavailable or retired. Pick a current id from https://console.groq.com/docs/models and set GROQ_MODEL in .env.`;
  }
  if (status === 429) {
    return 'Groq rate limit hit - the free tier caps requests and tokens per minute and per day.';
  }
  if (status === 413) {
    return "Prompt too large for this model's free-tier token-per-minute limit.";
  }
  return null;
}

async function createCompletion(params) {
  try {
    return await client.chat.completions.create(params);
  } catch (error) {
    const hint = describeGroqError(error);
    if (hint) {
      throw new Error(hint);
    }
    throw error;
  }
}

/**
 * Turns a short, informal description of what the post should be about
 * into a full, LinkedIn-ready caption with hashtags. This is the only
 * automated step in Feature 1 - image selection and the send action are
 * fully manual.
 */
export async function generateCaption(description) {
  const prompt = `Write a professional, engaging LinkedIn post caption based on this description from the author:
"${description}"

Guidelines:
- First person, natural and confident tone - no corporate buzzword filler, not salesy
- Short paragraphs with line breaks, the way real LinkedIn posts read
- End with 5-8 hashtags chosen specifically to maximize reach and impressions: mix a couple of broad, high-traffic industry hashtags with several more specific, niche ones directly tied to the topic - avoid generic filler tags that don't relate to the content
- Output ONLY the caption text itself - no preamble, no markdown formatting, no surrounding quotes`;

  const completion = await createCompletion({
    model: groqConfig.model,
    messages: [
      { role: 'system', content: 'You ghostwrite LinkedIn captions. Output only the caption text - no preamble, no markdown, no surrounding quotes.' },
      { role: 'user', content: prompt },
    ],
  });

  const caption = completion.choices[0]?.message?.content?.trim();

  if (!caption) {
    throw new Error('Groq did not return a caption');
  }
  return caption;
}

// Deliberately long and explicit. The earlier, terser version leaned on
// negative constraints ("no buzzword filler") which the model simply
// ignored - it produced captions that would read identically for any
// topic, and image prompts that collapsed into generic "glowing network"
// stock imagery. This version specifies structure positively, names the
// exact failure modes, and ends with a self-check.
function buildCaptionAndImagePromptsInstructions(description, imageCount) {
  const images = imageCount === 1 ? 'image' : 'images';
  const prompts = imageCount === 1 ? 'prompt' : 'prompts';

  return `You are preparing a LinkedIn post for an individual professional. The author will publish the result publicly, so the writing must feel like something a real person would actually write after experiencing, learning, noticing, or thinking about something.

The author's description is:

"${description}"

The post will be published with exactly ${imageCount} ${images}.

Your job is to create two content deliverables:

1. A finished LinkedIn caption.
2. Exactly ${imageCount} standalone image-generation ${prompts}.

IMPORTANT WRITING PRINCIPLE

Specificity beats polish.

Do not try to make the post sound impressive. Make it sound observant, useful, and personal.

A strong post should make the reader think:
"I can tell what this person actually experienced or noticed."

It should NOT make the reader think:
"This sounds like an AI-generated LinkedIn post."

════════════════════════════════════
CAPTION REQUIREMENTS
════════════════════════════════════

Build the caption using this structure, but do not add headings such as "Hook", "Lesson", or "CTA".

1. OPENING — 1 or 2 short lines

Start with a concrete observation, realization, tension, surprising detail, mistake, decision, question, or change related directly to the author's subject.

The opening should create curiosity without using exaggerated clickbait.

Good opening patterns include:
- "I thought X would be the hard part. It wasn't."
- "One thing I underestimated while doing X:"
- "I changed my mind about X this week."
- "The interesting part wasn't X. It was Y."
- "We spent more time deciding X than actually doing Y."
- "A small change in X completely changed how I approached Y."

Do not force these exact patterns. Use them only when naturally appropriate.

2. SPECIFIC CONTEXT — 2 to 4 short paragraphs

Explain what happened, what the author was working on, what they noticed, or what prompted the thought.

Include at least one concrete detail whenever the author's input supports one.

Useful concrete details include:
- a technical decision
- a trade-off
- a mistake
- a surprising observation
- a before/after difference
- something that took longer than expected
- a question someone asked
- a practical constraint
- a specific behavior or result
- a lesson learned from doing something

Do not manufacture numbers, percentages, company names, client names, dates, technical results, events, people, quotes, or outcomes that the author did not provide.

3. INSIGHT — 1 to 3 short paragraphs

Extract one useful lesson from the situation.

The insight must be connected to the specific situation. Avoid generic statements such as:
- "Communication is key."
- "Hard work always pays off."
- "Never stop learning."
- "Teamwork makes the dream work."
- "Technology is constantly evolving."

If the input does not contain enough information for a highly specific lesson, make the insight modest and honest rather than inventing evidence.

Prefer:
"This made me realize that the migration wasn't really a code problem. It was a dependency problem."

over:
"This experience taught me the importance of strategic thinking and collaboration."

4. OPTIONAL PRACTICAL TAKEAWAY

When the topic naturally allows it, include 1 to 3 concise practical points using Unicode symbols such as:
→
•
✓
↳

Use these only when they genuinely improve scanning.

Do not force a list into a story that does not need one.

5. CTA — FINAL QUESTION BEFORE HASHTAGS

End the body with one specific question that naturally invites people with relevant experience to respond.

The question must be directly connected to the subject.

Weak:
"What do you think?"
"Agree?"
"Have you experienced this?"

Better:
"If you have migrated a monolith to services, what dependency caused the biggest surprise for you?"
"For people who have made a similar career change, what was harder than you expected?"
"Which part of this process would you automate first?"

The CTA should invite experience, disagreement, examples, or practical advice.

Do not ask a question merely to increase engagement.

6. HASHTAGS

End with exactly 5 to 8 relevant hashtags.

Choose hashtags based on the actual subject, not generic LinkedIn popularity.

Use a mixture of:
- 2 or 3 broad but relevant industry/topic hashtags
- 3 to 5 specific hashtags closely tied to the subject

Never use a hashtag that does not naturally describe the content.

Do not use generic filler such as:
#Success
#Motivation
#Leadership
#Entrepreneurship
unless the actual subject genuinely concerns that topic.

════════════════════════════════════
VOICE AND STYLE
════════════════════════════════════

Write in first person when the input describes the author's own experience.

Use natural sentence lengths. Mix short and medium-length sentences.

Use short paragraphs. Some paragraphs may be one sentence.

Let the writing have a little personality. It does not need to sound perfectly polished.

Use contractions naturally:
"I'm", "I've", "wasn't", "didn't", "it's", etc.

Prefer concrete verbs over corporate language.

Write like a technically competent or professionally experienced person explaining something to another professional.

Do not sound like:
- a company press release
- a motivational speaker
- a marketing agency
- a recruiter
- a corporate communications team
- an AI assistant

Avoid inflated phrases such as:
"game changer"
"journey"
"excited to announce"
"thrilled to share"
"huge shoutout"
"leveraging"
"unlocking new possibilities"
"driving innovation"
"transformative"
"revolutionary"
"seamless"
"cutting-edge"
"delighted"
"massive achievement"
"empowering"
"at the forefront"

Do not mechanically replace these words with synonyms. If the underlying sentence is generic, rewrite the thought itself.

════════════════════════════════════
THIN INPUT RULE
════════════════════════════════════

The author's description may be only one short sentence.

When information is missing, follow this rule:

USE what is explicitly provided.
INFER only what is a reasonable interpretation of the provided situation.
DO NOT INVENT factual details.

Never invent:
- metrics
- percentages
- timelines
- customer or client names
- company names
- project outcomes
- technical architecture details
- quotes
- people
- locations
- events
- business results
- problems that supposedly occurred

If the input is thin, create specificity through the author's perspective rather than fabricated facts.

For example, if the input is:

"Wrapping up a project migrating our backend to microservices"

Do not invent:
"latency dropped 42%"
"we reduced AWS costs by 30%"
"the migration took six months"

Instead, discuss defensible aspects of the stated situation, such as:
- why a migration requires architectural decisions
- what makes breaking dependencies difficult
- the trade-off between smaller services and operational complexity
- what the author noticed while completing the migration

However, do not present these as things that definitely happened unless the author's description supports that claim.

Use cautious phrasing when necessary:
"One thing migrations like this make obvious..."
rather than:
"Our migration proved..."

This is how you create useful content without fabricating the author's experience.

════════════════════════════════════
EMOJI AND SYMBOL RULES
════════════════════════════════════

Use 0 to 3 emojis in the entire caption.

Emoji should support tone or emphasis, not decorate every paragraph.

Good placement:
- occasionally in the opening
- beside a genuinely useful takeaway
- near the end when natural

Do not put emojis in every paragraph.

Do not use emojis inside hashtags.

Useful Unicode symbols may include:
→
•
✓
↳
—

Use symbols sparingly and only when they improve readability.

Do not turn the entire post into a visual checklist.

Use real newline characters.

There must be a blank line between paragraphs.

The hashtags must appear alone on the final line.

Do not put markdown headings, code formatting, quotation marks around the entire caption, or decorative formatting around the text.

Never use markdown emphasis anywhere in the caption. Do not wrap words in asterisks or underscores for bold or italic. LinkedIn has no markdown renderer, so those characters are published literally and look like a mistake. If a word needs emphasis, rewrite the sentence so the emphasis comes from the wording.

════════════════════════════════════
IMAGE PROMPT REQUIREMENTS
════════════════════════════════════

Create exactly ${imageCount} image ${prompts}.

Each image prompt must work completely on its own when pasted directly into an image-generation model.

Do not mention:
- "the caption"
- "the post"
- "this LinkedIn post"
- "the previous image"
- "image 1"
- "image 2"

Each image must depict a concrete visual connected to a specific moment, object, action, environment, problem, comparison, or idea in the written content.

The images must NOT merely represent the abstract meaning of the topic.

For example:

BAD:
"Futuristic visualization of interconnected microservices with glowing blue nodes."

BETTER:
"Photorealistic close-up of a software engineer reviewing a service-dependency diagram on a large monitor in a modern engineering workspace, with a laptop showing code beside handwritten architecture notes, late-afternoon window light, realistic office details, 35mm documentary photography, natural neutral colors, 1200x627 landscape."

The second prompt depicts a recognizable working situation rather than generic technology symbolism.

════════════════════════════════════
IMAGE SEQUENCE
════════════════════════════════════

If ${imageCount} is greater than 1, the images should tell a visual story.

Use different visual purposes:

Image 1:
The concrete situation, subject, or starting point.

Image 2:
A different moment, decision, challenge, comparison, or detail.

Image 3:
A practical result, lesson, environment, or human consequence.

Additional images:
Continue introducing genuinely different visual information.

Do NOT generate several versions of the same concept.

Every image must earn its place.

If there is only one image, make it the strongest visual representation of the central subject.

════════════════════════════════════
REALISM DEFAULT
════════════════════════════════════

Default to photographic realism.

For photographic prompts, explicitly describe:

- the main subject
- what the subject is doing
- the setting
- relevant objects
- composition
- camera perspective
- approximate lens or photographic style
- lighting
- mood
- realistic color palette
- 1200x627 landscape framing

Prefer authentic documentary/editorial photography over glossy stock photography.

People should look naturally posed or caught in a real moment rather than smiling at the camera unless the situation genuinely calls for it.

Use realistic environments and objects appropriate to the subject.

Do not add futuristic holograms, glowing interfaces, floating data, or sci-fi effects unless the subject genuinely requires them.

════════════════════════════════════
WHEN TO USE DIAGRAMS OR ILLUSTRATION
════════════════════════════════════

Photographic realism is the default, but use a clean diagram, technical illustration, infographic-style composition, or editorial illustration when the subject is inherently difficult to photograph.

Good candidates include:
- architecture comparisons
- database structures
- algorithms
- system flows
- financial concepts
- process comparisons
- abstract scientific concepts

When using a diagram or illustration, make it information-specific.

For example, for a database architecture topic, show actual database concepts, relationships, tables, queries, storage layers, or architecture components rather than generic glowing nodes.

Use clean professional visual design, restrained colors, clear hierarchy, and generous whitespace.

════════════════════════════════════
IMAGE BANNED VOCABULARY
════════════════════════════════════

Do not use or rely on generic AI-tech imagery involving:

"glowing network"
"interconnected nodes"
"digital network"
"futuristic technology"
"abstract technology"
"blue digital background"
"glowing lines"
"floating data"
"cyber space"
"digital sphere"
"neon circuitry"
"futuristic interface"
"holographic dashboard"
"binary code background"
"AI brain"
"robot hand"
"virtual reality"
"cyberpunk"
"abstract data visualization"

Also avoid generic visual metaphors such as:
- light bulbs for ideas
- mountain peaks for success
- rockets for growth
- puzzle pieces for teamwork
- chess pieces for strategy
- bridges for collaboration

Only use such imagery if the author's subject specifically requires it.

Do not use logos, brand marks, watermarks, fake UI text, lettering, words, captions, numbers, labels, or readable typography inside generated images.

════════════════════════════════════
IMAGE RELEVANCE TEST
════════════════════════════════════

Before returning each image prompt, ask:

"If someone saw only this image, would they be able to understand something specific about the subject?"

If the answer is no, rewrite it.

Also ask:

"Could this exact image prompt be reused unchanged for five unrelated LinkedIn topics?"

If yes, rewrite it.

Every image should contain at least two concrete details that make it specific to the subject.

════════════════════════════════════
IMAGE TECHNICAL REQUIREMENTS
════════════════════════════════════

Every image prompt must specify:

1200x627 landscape framing.

Do not request text, lettering, logos, numbers, captions, watermarks, or readable interface text inside the image.

The image prompt itself may contain technical terms needed to describe the scene, but the generated image must not contain those terms as visible text.

════════════════════════════════════
FINAL SELF-CHECK
════════════════════════════════════

Before returning the result, silently check all of the following:

CAPTION:
1. Does the opening create curiosity without clickbait?
2. Does the post contain at least one concrete detail supported by the input?
3. Did I avoid inventing facts?
4. Is the insight actually connected to the stated subject?
5. Does the writing sound like one person rather than a company?
6. Is there natural variation in paragraph and sentence length?
7. Are there 0 to 3 tasteful emojis?
8. Are Unicode symbols used only where useful?
9. Is the final question specific to the subject?
10. Are there exactly 5 to 8 relevant hashtags?
11. Could this caption be reused unchanged for a different topic? If yes, rewrite it.

IMAGES:
12. Are there exactly ${imageCount} image ${prompts}?
13. Does every image depict a concrete, subject-specific scene or visual?
14. Are the images meaningfully different from one another?
15. Is photographic realism used unless a diagram or illustration is genuinely more appropriate?
16. Have I avoided generic AI-tech imagery?
17. Could any image prompt be reused for an unrelated topic? If yes, rewrite it.
18. Does every prompt specify 1200x627 landscape framing?
19. Does every prompt prohibit visible text, logos, numbers, and watermarks?
20. Can every image prompt be pasted directly into an image generator without additional context?

════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════

Respond with a single JSON object and nothing else. No preamble, no explanation, no markdown code fences around it.

The JSON object must have exactly these two keys:

{
  "caption": "the complete caption text",
  "imagePrompts": ["first image prompt", "second image prompt"]
}

"caption" is a single JSON string. Encode the paragraph breaks as \\n escape sequences inside it, with a blank line (\\n\\n) between paragraphs and the hashtags on the final line. Do not collapse the caption into one unbroken block of text.

"imagePrompts" must be an array of exactly ${imageCount} ${prompts}, in the order the images appear in the post.`;
}

/**
 * Writes the caption AND one image-generation prompt per requested image,
 * in a single call so the visuals are grounded in the caption that ships
 * with them. The prompts are not rendered here - the author takes them to
 * whichever image tool they prefer and uploads the results back.
 */
export async function generateCaptionWithImagePrompts(description, imageCount) {
  const prompt = buildCaptionAndImagePromptsInstructions(description, imageCount);

  const completion = await createCompletion({
    model: groqConfig.model,
    messages: [
      { role: 'system', content: 'You ghostwrite LinkedIn posts. Respond with a single JSON object and nothing else.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    // gpt-oss is a reasoning model: its thinking tokens are billed as
    // completion tokens and are spent before any JSON is emitted. Left on
    // the defaults it runs out mid-document and Groq rejects the whole
    // request with json_validate_failed. Cap the thinking, raise the
    // ceiling.
    reasoning_effort: 'low',
    max_completion_tokens: 4096,
  });

  const choice = completion.choices[0];
  const raw = choice?.message?.content;
  if (!raw) {
    throw new Error(
      `Groq returned an empty response (finish_reason: ${choice?.finish_reason ?? 'unknown'}, ` +
        `completion tokens: ${completion.usage?.completion_tokens ?? '?'}). ` +
        'A "length" finish_reason means max_completion_tokens was too low for this prompt.'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Groq returned malformed JSON: ${err.message}`);
  }

  const { caption, imagePrompts } = parsed;
  if (!caption || !imagePrompts?.length) {
    throw new Error(
      `Groq returned JSON without the expected keys (got: ${Object.keys(parsed).join(', ') || 'none'}, ` +
        `finish_reason: ${choice?.finish_reason ?? 'unknown'})`
    );
  }

  // The prompt asks for an exact count but does not guarantee one, and a
  // short list would silently drop upload slots in the UI. Pad by reusing
  // the last prompt rather than failing the whole request.
  const prompts = imagePrompts.slice(0, imageCount);
  while (prompts.length < imageCount) {
    prompts.push(imagePrompts[imagePrompts.length - 1]);
  }

  return { caption: caption.trim(), imagePrompts: prompts.map((p) => p.trim()) };
}
