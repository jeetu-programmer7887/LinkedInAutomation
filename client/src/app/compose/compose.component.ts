import { Component, OnDestroy } from '@angular/core';
import { PostService } from '../core/services/post.service';
import { Post } from '../core/models/post.model';

type PostType = 'text' | 'text_image' | 'text_image_prompts';

interface SelectedImage {
  file: File;
  previewUrl: string;
}

/** One AI-written image prompt paired with the image the author generated from it. */
interface PromptSlot {
  prompt: string;
  image: SelectedImage | null;
}

const MAX_IMAGES = 5;
// Static images only - no GIFs (LinkedIn flattens them to a single still
// frame anyway, so animation would silently be lost) and no video.
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Component({
  selector: 'app-compose',
  templateUrl: './compose.component.html',
  styleUrls: ['./compose.component.css'],
})
export class ComposeComponent implements OnDestroy {
  postType: PostType = 'text';
  description = '';
  caption = '';
  images: SelectedImage[] = [];

  imageCount = 3;
  slots: PromptSlot[] = [];
  copiedIndex: number | null = null;

  generating = false;
  publishing = false;
  error: string | null = null;
  publishedPost: Post | null = null;

  readonly maxImages = MAX_IMAGES;
  readonly imageCountOptions = Array.from({ length: MAX_IMAGES }, (_, i) => i + 1);

  constructor(private readonly postService: PostService) {}

  ngOnDestroy(): void {
    this.releaseImages();
    this.releaseSlotImages();
  }

  selectPostType(type: PostType): void {
    this.postType = type;
    this.error = null;

    if (type !== 'text_image') {
      this.releaseImages();
      this.images = [];
    }
    if (type === 'text_image_prompts') {
      this.syncSlots();
    } else {
      this.releaseSlotImages();
      this.slots = [];
    }
  }

  /**
   * Keeps one slot per requested image so the upload boxes are visible
   * straight away, before anything has been generated. Existing prompts
   * and uploads survive a count change; only trimmed-off slots release
   * their preview URLs.
   */
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

  generateCaption(): void {
    if (!this.description.trim()) {
      this.error = 'Describe what the post should be about first.';
      return;
    }
    this.error = null;
    this.generating = true;
    this.postService.generateCaption(this.description.trim()).subscribe({
      next: ({ caption }) => {
        this.caption = caption;
        this.generating = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not generate a caption. Try again.';
        this.generating = false;
      },
    });
  }

  /** Caption + one prompt per image, in a single call, for the prompts tab. */
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
        // Fill the slots that are already on screen, so any images the
        // author uploaded before generating stay where they are.
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

  copyPrompt(index: number): void {
    navigator.clipboard.writeText(this.slots[index].prompt).then(
      () => {
        this.copiedIndex = index;
        setTimeout(() => (this.copiedIndex = null), 2000);
      },
      () => (this.error = 'Could not copy to the clipboard - select the prompt text and copy it manually.')
    );
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const allFiles = Array.from(input.files ?? []);
    this.error = null;

    const validFiles = allFiles.filter((file) => ALLOWED_IMAGE_TYPES.has(file.type));
    if (validFiles.length < allFiles.length) {
      this.error = 'Only JPEG, PNG, or WEBP images are allowed - no GIFs or video.';
    }

    const room = this.maxImages - this.images.length;
    if (validFiles.length > room) {
      this.error = `You can attach up to ${this.maxImages} images.`;
    }

    validFiles.slice(0, room).forEach((file) => {
      this.images.push({ file, previewUrl: URL.createObjectURL(file) });
    });

    input.value = '';
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

  removeImage(index: number): void {
    URL.revokeObjectURL(this.images[index].previewUrl);
    this.images.splice(index, 1);
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

    if (this.postType === 'text_image_prompts') {
      // Only slots with an image contribute, so the prompts stay aligned
      // with the files the server receives.
      this.slots
        .filter((slot) => slot.image)
        .forEach((slot) => {
          formData.append('images', slot.image!.file);
          formData.append('imagePrompts', slot.prompt);
        });
    } else if (this.postType === 'text_image') {
      this.images.forEach((img) => formData.append('images', img.file));
    }

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
    this.releaseImages();
    this.releaseSlotImages();
    this.postType = 'text';
    this.description = '';
    this.caption = '';
    this.images = [];
    this.slots = [];
    this.imageCount = 3;
    this.publishedPost = null;
    this.error = null;
  }

  private releaseImages(): void {
    this.images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  }

  private releaseSlotImages(): void {
    this.slots.forEach((slot) => slot.image && URL.revokeObjectURL(slot.image.previewUrl));
  }
}
