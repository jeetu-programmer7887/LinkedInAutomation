import { Component, OnDestroy } from '@angular/core';
import { PostService } from '../core/services/post.service';
import { Post } from '../core/models/post.model';

interface SelectedImage {
  file: File;
  previewUrl: string;
}

/**
 * One AI-written image prompt and the image the author uploaded for it
 * after rendering the prompt in their own image tool.
 */
interface PromptSlot {
  prompt: string;
  image: SelectedImage | null;
}

const MAX_IMAGES = 5;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Component({
  selector: 'app-schedule',
  templateUrl: './schedule.component.html',
  styleUrls: ['./schedule.component.css'],
})
export class ScheduleComponent implements OnDestroy {
  description = '';
  caption = '';
  imageCount = 3;
  slots: PromptSlot[] = [];

  generating = false;
  publishing = false;
  error: string | null = null;
  publishedPost: Post | null = null;

  readonly imageCountOptions = Array.from({ length: MAX_IMAGES }, (_, i) => i + 1);

  constructor(private readonly postService: PostService) {
    this.syncSlots();
  }

  ngOnDestroy(): void {
    this.releaseSlotImages();
  }

  /** One slot per requested image, visible before anything is generated. */
  syncSlots(): void {
    const next: PromptSlot[] = [];
    for (let i = 0; i < this.imageCount; i++) {
      next.push(this.slots[i] ?? { prompt: '', image: null });
    }
    this.slots.slice(this.imageCount).forEach((slot) => {
      if (slot.image) {
        URL.revokeObjectURL(slot.image.previewUrl);
      }
    });
    this.slots = next;
  }

  generateCaptionAndPrompts(): void {
    if (!this.description.trim()) {
      this.error = 'Describe what the post should be about first.';
      return;
    }
    this.error = null;
    this.generating = true;

    this.postService.generateCaptionWithImagePrompts(this.description.trim(), this.imageCount).subscribe({
      next: ({ caption, imagePrompts }) => {
        this.caption = caption;
        this.syncSlots();
        imagePrompts.forEach((prompt, i) => {
          if (this.slots[i]) {
            this.slots[i].prompt = prompt;
          }
        });
        this.generating = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not generate the caption and prompts. Try again.';
        this.generating = false;
      },
    });
  }

  onSlotFileSelected(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.error = null;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      this.error = 'Only JPEG, PNG, or WEBP images are allowed - no GIFs or video.';
      return;
    }

    this.removeSlotImage(index);
    this.slots[index].image = { file, previewUrl: URL.createObjectURL(file) };
  }

  removeSlotImage(index: number): void {
    const existing = this.slots[index].image;
    if (existing) {
      URL.revokeObjectURL(existing.previewUrl);
      this.slots[index].image = null;
    }
  }

  get filledSlotCount(): number {
    return this.slots.filter((slot) => slot.image).length;
  }

  get hasPrompts(): boolean {
    return this.slots.some((slot) => slot.prompt);
  }

  send(): void {
    if (!this.caption.trim()) {
      this.error = 'Generate or write a caption first.';
      return;
    }

    this.error = null;
    this.publishing = true;

    const formData = new FormData();
    formData.append('description', this.description);
    formData.append('caption', this.caption);
    this.slots
      .filter((slot) => slot.image)
      .forEach((slot) => {
        formData.append('images', slot.image!.file);
        formData.append('imagePrompts', slot.prompt);
      });

    this.postService.publish(formData).subscribe({
      next: (post) => {
        this.publishedPost = post;
        this.publishing = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Publishing failed. Try again.';
        this.publishing = false;
      },
    });
  }

  startNewPost(): void {
    this.releaseSlotImages();
    this.description = '';
    this.caption = '';
    this.imageCount = 3;
    this.slots = [];
    this.syncSlots();
    this.publishedPost = null;
    this.error = null;
  }

  private releaseSlotImages(): void {
    this.slots.forEach((slot) => slot.image && URL.revokeObjectURL(slot.image.previewUrl));
  }
}
