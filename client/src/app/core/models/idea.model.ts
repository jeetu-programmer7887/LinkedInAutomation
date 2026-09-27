export type PostFormat = 'text' | 'text_image' | 'text_image_prompts';

export interface IdeaSource {
  title: string;
  url: string;
  source: string;
}

export interface Idea {
  kind: 'trending' | 'evergreen';
  topic: string;
  whyTrending: string;
  angle: string;
  keyPoints: string[];
  suggestedFormat: PostFormat;
  sources: IdeaSource[];
}

export interface IdeaBatch {
  _id: string;
  trigger: 'scheduled' | 'manual';
  status: 'running' | 'done' | 'failed';
  failureReason?: string;
  ideas: Idea[];
  createdAt: string;
}

export interface ResearchSettings {
  researchTime: string;
  timezone: string;
}

export interface IdeasOverview {
  latest: IdeaBatch | null;
  lastRun: Pick<IdeaBatch, '_id' | 'status' | 'failureReason' | 'trigger' | 'createdAt'> | null;
  settings: ResearchSettings;
}

/** Points Compose at one idea of a stored batch. */
export interface IdeaRef {
  batchId: string;
  index: number;
}
