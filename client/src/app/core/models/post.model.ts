import { PostFormat } from './idea.model';

export interface PostImage {
  linkedInAssetUrn?: string;
  prompt?: string;
}

export type PostStatus = 'draft' | 'generating' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';

export interface Post {
  _id: string;
  status: PostStatus;
  postType?: PostFormat;
  source?: 'manual' | 'idea';
  ideaTopic?: string;
  publishMode?: 'now' | 'scheduled';
  content: { text: string; hashtags: string[] };
  images: PostImage[];
  linkedInPostUrn?: string;
  linkedInPostUrl?: string;
  publishedAt?: string;
  scheduledFor?: string;
  failureReason?: string;
  failedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}
