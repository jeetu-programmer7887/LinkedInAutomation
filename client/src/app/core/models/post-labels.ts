import { PostFormat } from './idea.model';
import { PostStatus } from './post.model';

export const POST_TYPE_LABELS: Record<PostFormat, string> = {
  text: 'Text only',
  text_image: 'Text + image',
  text_image_prompts: 'Text + image prompts',
};

export const STATUS_LABELS: Partial<Record<PostStatus, string>> = {
  published: 'Published',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

// Tolerates a missing caption (some older posts have no content.text): a
// throw here would abort change detection and blank the rest of the page.
export function excerpt(text: string | null | undefined, max = 160): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}
