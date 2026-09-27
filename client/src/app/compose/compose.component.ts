import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PostService } from '../core/services/post.service';
import { IdeaService } from '../core/services/idea.service';
import { Post } from '../core/models/post.model';
import { Idea, IdeaRef, PostFormat } from '../core/models/idea.model';

type PostType = PostFormat;
const POST_TYPES: PostType[] = ['text', 'text_image', 'text_image_prompts'];

// Matches the server: a scheduled post needs at least one scheduler tick.
const MIN_SCHEDULE_LEAD_MS = 2 * 60_000;

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
export class ComposeComponent implements OnInit, OnDestroy {
  postType: PostType = 'text';

  // Set when Compose was opened from an idea card on the Schedule page;
  // the caption calls then ground the post in that idea's research.
  ideaRef: IdeaRef | null = null;
  idea: Idea | null = null;
  ideaLoading = false;

  publishMode: 'now' | 'schedule' = 'now';
  /** datetime-local value, in the browser's local time. */
  scheduledFor = '';

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

  private querySub?: Subscription;

  constructor(
    private readonly postService: PostService,
    private readonly ideaService: IdeaService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  /** Reads ?idea=<batchId>&index=<n>&type=<format> from the Schedule page's idea cards. */
  ngOnInit(): void {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const type = params.get('type') as PostType | null;
      if (type && POST_TYPES.includes(type)) {
        this.selectPostType(type);
      }

      const batchId = params.get('idea');
      const index = Number(params.get('index'));
      if (batchId && Number.isInteger(index)) {
        this.loadIdea({ batchId, index });
      }
    });
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.releaseImages();
    this.releaseSlotImages();
  }

  private loadIdea(ref: IdeaRef): void {
    this.ideaLoading = true;
    this.error = null;
    this.ideaService.getIdea(ref.batchId, ref.index).subscribe({
      next: (idea) => {
        this.ideaRef = ref;
        this.idea = idea;
        this.description = `${idea.topic}\n\n${idea.angle}`;
        this.ideaLoading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not load that idea.';
        this.ideaLoading = false;
      },
    });
  }

  /** Back to a blank, un-researched post. Drops the query params so a reload doesn't bring the idea back. */
  clearIdea(): void {
    this.ideaRef = null;
    this.idea = null;
    this.description = '';
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  /** Earliest value the datetime-local picker allows, in local time. */
  get minScheduleTime(): string {
    const soon = new Date(Date.now() + MIN_SCHEDULE_LEAD_MS);
    soon.setMinutes(soon.getMinutes() - soon.getTimezoneOffset());
    return soon.toISOString().slice(0, 16);
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
    this.postService.generateCaption(this.description.trim(), this.ideaRef ?? undefined).subscribe({
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

    this.postService
      .generateCaptionWithImagePrompts(this.description.trim(), this.imageCount, this.ideaRef ?? undefined)
      .subscribe({
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

    let scheduledAt: Date | null = null;
    if (this.publishMode === 'schedule') {
      scheduledAt = this.scheduledFor ? new Date(this.scheduledFor) : null;
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        this.error = 'Pick the date and time to publish.';
        return;
      }
      if (scheduledAt.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
        this.error = 'Pick a time at least 2 minutes from now.';
        return;
      }
    }

    this.error = null;
    this.publishing = true;

    const formData = new FormData();
    formData.append('description', this.description);
    formData.append('caption', this.caption);
    // Recorded on the post for the Dashboard's breakdowns.
    formData.append('postType', this.postType);
    if (this.ideaRef) {
      formData.append('ideaBatchId', this.ideaRef.batchId);
      formData.append('ideaIndex', String(this.ideaRef.index));
    }
    if (scheduledAt) {
      formData.append('scheduledFor', scheduledAt.toISOString());
    }

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
    this.publishMode = 'now';
    this.scheduledFor = '';
    this.publishedPost = null;
    this.error = null;
    if (this.idea) {
      this.clearIdea();
    }
  }

  private releaseImages(): void {
    this.images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  }

  private releaseSlotImages(): void {
    this.slots.forEach((slot) => slot.image && URL.revokeObjectURL(slot.image.previewUrl));
  }
}
