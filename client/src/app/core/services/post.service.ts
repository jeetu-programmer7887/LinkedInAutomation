import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Post } from '../models/post.model';
import { IdeaRef } from '../models/idea.model';
import { API_BASE_URL } from '../config/api-config';

@Injectable({
  providedIn: 'root',
})
export class PostService {
  constructor(private readonly http: HttpClient) {}

  /** `idea` grounds the caption in that idea's stored research. */
  generateCaption(description: string, idea?: IdeaRef) {
    return this.http.post<{ caption: string }>(`${API_BASE_URL}/posts/generate-caption`, { description, idea });
  }

  /** Caption plus one image-generation prompt per image, for the author to run in their own AI tool. */
  generateCaptionWithImagePrompts(description: string, imageCount: number, idea?: IdeaRef) {
    return this.http.post<{ caption: string; imagePrompts: string[] }>(
      `${API_BASE_URL}/posts/generate-caption-and-prompts`,
      { description, imageCount, idea }
    );
  }

  /**
   * formData carries description, caption, and 0-5 image files under the
   * "images" field - plus an ISO "scheduledFor" to schedule instead of posting now.
   */
  publish(formData: FormData) {
    return this.http.post<Post>(`${API_BASE_URL}/posts`, formData);
  }

  getScheduled() {
    return this.getPosts({ status: 'scheduled' });
  }

  getPosts(filters: { status?: string; type?: string } = {}) {
    const params: Record<string, string> = {};
    if (filters.status) params['status'] = filters.status;
    if (filters.type) params['type'] = filters.type;
    return this.http.get<Post[]>(`${API_BASE_URL}/posts`, { params });
  }

  /** Marks a scheduled post cancelled (the record is kept). */
  cancelScheduled(id: string) {
    return this.http.delete<Post>(`${API_BASE_URL}/posts/${id}`);
  }

  /**
   * Fix/edit a failed or scheduled post. formData carries caption, a JSON
   * "layout" of the final images ("e<n>" keeps stored image n, "u<n>" is
   * the n-th file under "images"), and scheduledFor or publishNow=true.
   */
  updatePost(id: string, formData: FormData) {
    return this.http.put<Post>(`${API_BASE_URL}/posts/${id}`, formData);
  }

  /** URL of a stored (not yet published) image, for an <img src>. */
  storedImageUrl(id: string, order: number, version: string) {
    return `${API_BASE_URL}/posts/${id}/images/${order}?v=${encodeURIComponent(version)}`;
  }
}
