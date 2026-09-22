import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Post } from '../models/post.model';
import { API_BASE_URL } from '../config/api-config';

@Injectable({
  providedIn: 'root',
})
export class PostService {
  constructor(private readonly http: HttpClient) {}

  generateCaption(description: string) {
    return this.http.post<{ caption: string }>(`${API_BASE_URL}/posts/generate-caption`, { description });
  }

  /** Caption plus one image-generation prompt per image, for the author to run in their own AI tool. */
  generateCaptionWithImagePrompts(description: string, imageCount: number) {
    return this.http.post<{ caption: string; imagePrompts: string[] }>(
      `${API_BASE_URL}/posts/generate-caption-and-prompts`,
      { description, imageCount }
    );
  }

  /** formData carries description, caption, and 0-5 image files under the "images" field. */
  publish(formData: FormData) {
    return this.http.post<Post>(`${API_BASE_URL}/posts`, formData);
  }
}
