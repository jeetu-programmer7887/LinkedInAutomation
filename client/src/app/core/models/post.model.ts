export interface PostImage {
  linkedInAssetUrn?: string;
}

export interface Post {
  _id: string;
  status: 'draft' | 'generating' | 'scheduled' | 'publishing' | 'published' | 'failed';
  content: { text: string; hashtags: string[] };
  images: PostImage[];
  linkedInPostUrn?: string;
  linkedInPostUrl?: string;
  publishedAt?: string;
}
