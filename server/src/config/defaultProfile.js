// Seed for the single AuthorProfile document (models/AuthorProfile.js).
// Used only the first time the profile is read, when the collection is
// still empty - after that the stored document is the source of truth.
//
// Every entry in `facts` was checked against the project repos' actual
// code (not just their READMEs, which are partly out of date). These are
// the ONLY personal experiences the AI is allowed to claim, so keep them
// strictly true when editing.
export const defaultProfile = {
  name: 'Jeetu Prasad',
  headline:
    'Full-Stack Developer | MERN & Next.js | 9.97 CGPA | Built AI-powered e-commerce & mental health apps',
  location: 'Mumbai, India',
  about:
    'Software developer building full-stack applications with MongoDB, Express, React, Node.js and Next.js. ' +
    'Strengthening core computer science fundamentals and system design, focused on production-ready apps.',
  audience: 'Tech recruiters and hiring managers in India, fellow developers, and CS students / early-career engineers',
  goal:
    'Get noticed by recruiters for full-stack / software developer roles (Mumbai, on-site, hybrid or remote), ' +
    'grow followers, and build credibility as a developer who ships real AI features',

  opinions: [
    'AI is not just a tool you add to an app; it changes how you see and solve the problem',
    'Building real projects end-to-end teaches more than tutorials',
    'Strong CS fundamentals and system design matter more as AI writes more code',
    'Self-hosted and local LLMs are becoming a real option for developers, not just a hobby',
  ],

  facts: [
    'Built ZYRO, a MERN jewellery e-commerce app (with teammate Mayuri Pasi): an AI Stylist that sends an uploaded portrait to Groq to read skin undertone and outfit colour and recommend gold vs silver',
    'ZYRO also has a Gemini support chatbot that answers from real order data, the product catalog and the store return/shipping policies',
    'ZYRO has a loyalty coin system (10% of order value back, reversed automatically on returns) and a node-cron job that updates order statuses every hour',
    'Built JPsyche, an AI mental-wellness chat app with Next.js, TypeScript, Clerk auth, Prisma + PostgreSQL and Gemini',
    'In JPsyche, long chats stay in context through rolling summaries plus an extracted memory profile of the user; requests rotate across three Gemini API keys',
    'In JPsyche, editing an earlier message forks the conversation from that point; Hindi (Devanagari) text is detected and read aloud with a matching voice',
    'Built JSocial, a real-time MERN social app with Socket.IO and Redux',
    'In JSocial, fixed a race condition where several socket connections per user overwrote each other on the server, by moving to one shared socket via React Context',
    'In JSocial, set up cross-domain httpOnly cookie auth between a Netlify frontend and a Render backend (sameSite none + secure)',
    'Moved the JSocial backend off serverless because persistent WebSocket connections need a long-running server',
  ],

  // Searched daily with Tavily "news" - what is trending in the niche.
  trendingTopics: [
    'AI agents and chatbots in real products',
    'AI in customer support and the future of work',
    'AI coding tools and developer workflow',
    'Next.js React Node.js release news',
    'self-hosted local LLM open source models',
    'AI in e-commerce',
    'software developer hiring India freshers',
  ],

  // One of these backs the daily "evergreen concept" idea - the format of
  // the author's best-performing posts (small concepts that prevent real
  // production bugs), researched with Tavily "general".
  evergreenTopics: [
    'Python concepts that cause production bugs',
    'JavaScript concepts that cause production bugs',
    'Node.js event loop pitfalls in production',
    'MongoDB schema design mistakes',
    'REST API input validation best practices',
    'React state management pitfalls',
    'database indexing basics for backend developers',
    'system design fundamentals for junior developers',
  ],

  // Full text of past posts, used only to match voice and structure. The
  // prompt forbids copying their facts or numbers.
  stylePosts: [
    `Three small Python concepts, but each can prevent real production bugs. 🚀
Which one surprised you the most: is vs ==, pass vs break, or explicit type conversion? 🤔`,
    `🔹 The Namespace Trap
Understanding the difference between import module and from module import function isn't just syntax. Mixing import styles across services can create hidden namespace issues and unexpected NameError crashes.

🔹 Input Defensiveness
A backend should never trust incoming data. A simple type mismatch can bypass recursive termination conditions and trigger a RecursionError, potentially taking down an API endpoint. Validate early. Fail fast.

🔹 Immutable Strings & Search Methods
Python strings are immutable, meaning every modification creates a new object in memory. I also learned why .find() and .index() are not interchangeable in production code - one fails gracefully, while the other throws exceptions that can impact request handling.`,
    `I thought AI would just be a tool, not a lens.

That simple shift made me realize the workflow had already rearranged itself: the team was spending less time on routine questions and more on complex problem solving. It wasn't a new platform; it was a new way of thinking about where our time is most valuable.

The lesson is clear: when AI steps into a process, the real change isn't in the code - it's in the human role that re-defines itself around the new capabilities.

→ Re-allocate time from repetitive tasks to higher-value analysis.
→ Keep the human in the loop for nuanced decisions.
✓ Measure impact by tracking time saved, not just adoption rate.

Which part of your workflow do you think AI could most efficiently automate, and what skill set would that free up?

#AI #MachineLearning #FutureOfWork #TechTrends #Innovation`,
  ],
};
