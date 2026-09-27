import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PostService } from '../core/services/post.service';
import { IdeaService } from '../core/services/idea.service';
import { Post } from '../core/models/post.model';
import { Idea, IdeaRef, PostFormat } from '../core/models/idea.model';
import { POST_TYPE_LABELS } from '../core/models/post-labels';

type PostType = PostFormat;
const POST_TYPES: PostType[] = ['text', 'text_image', 'text_image_prompts'];

// Matches the server: a scheduled post needs at least one scheduler tick.
const MIN_SCHEDULE_LEAD_MS = 2 * 60_000;

// LinkedIn's own post length limit, and roughly where its feed folds a
// post behind "…more" (about 3 lines). Both are display-only guides - the
// server does not enforce them.
const CAPTION_LIMIT = 3000;
const FEED_FOLD_CHARS = 210;

interface SelectedImage {
  file: File;
  previewUrl: string;
}

/** One AI-written image prompt paired with the image the author generated from it. */
interface PromptSlot {
  prompt: string;
  image: SelectedImage | null;
}

interface PreviewTile {
  url: string;
  span: number;
  ratio: string;
}

interface ReadyCheck {
  state: 'ok' | 'wait' | 'bad';
  label: string;
  sub: string;
}

const MAX_IMAGES = 5;
// Static images only - no GIFs (LinkedIn flattens them to a single still
// frame anyway, so animation would silently be lost) and no video.
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// How the feed preview lays out 1-5 images on a 6-column grid.
const TILE_LAYOUTS: Record<number, [number, string][]> = {
  1: [[6, '4 / 3']],
  2: [[3, '1'], [3, '1']],
  3: [[6, '16 / 9'], [3, '1'], [3, '1']],
  4: [[6, '16 / 9'], [2, '1'], [2, '1'], [2, '1']],
  5: [[3, '1'], [3, '1'], [2, '1'], [2, '1'], [2, '1']],
};

@Component({
  selector: 'app-compose',
  templateUrl: './compose.component.html',
  styleUrls: ['./compose.component.css'],
})
export class ComposeComponent implements OnInit, OnDestroy {
  postType: PostType = 'text';

  // Set when Compose was opened from an idea card on the Ideas page;
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

  /** Feed preview: whether the "…more" fold is opened. */
  previewExpanded = false;

  readonly maxImages = MAX_IMAGES;
  readonly captionLimit = CAPTION_LIMIT;
  readonly imageCountOptions = Array.from({ length: MAX_IMAGES }, (_, i) => i + 1);
  readonly typeLabels = POST_TYPE_LABELS;
  readonly formatOptions: { value: PostType; label: string; sub: string; icon: string }[] = [
    { value: 'text', label: 'Text only', sub: 'Caption only', icon: 'i-align-left' },
    { value: 'text_image', label: 'Text + images', sub: 'Attach up to 5 of your own', icon: 'i-image' },
    { value: 'text_image_prompts', label: 'Text + image prompts', sub: 'AI writes a prompt per image', icon: 'i-wand-sparkles' },
  ];

  private querySub?: Subscription;

  constructor(
    private readonly postService: PostService,
    private readonly ideaService: IdeaService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  /** Reads ?idea=<batchId>&index=<n>&type=<format> from the Ideas page's cards. */
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

  setImageCount(count: number): void {
    this.imageCount = count;
    this.syncSlots();
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

  /** Single entry point for the Generate button - picks the right call for the format. */
  generate(): void {
    if (this.postType === 'text_image_prompts') {
      this.generateCaptionAndPrompts();
    } else {
      this.generateCaption();
    }
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
        this.previewExpanded = false;
        this.generating = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not generate a caption. Try again.';
        this.generating = false;
      },
    });
  }

  /** Caption + one prompt per image, in a single call, for the prompts format. */
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
          this.previewExpanded = false;
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

  get generateLabel(): string {
    const prompts = this.postType === 'text_image_prompts';
    if (this.generating) return prompts ? 'Writing caption and prompts…' : 'Writing caption…';
    if (prompts) return `Generate caption + ${this.imageCount} image prompt${this.imageCount === 1 ? '' : 's'}`;
    return this.caption ? 'Regenerate caption' : 'Generate caption';
  }

  get generateHint(): string {
    if (this.idea) return "Grounded in the idea's researched facts.";
    if (this.caption) return "Regenerating replaces the caption you've edited.";
    return 'Written in your voice from your author profile.';
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

  get mediaCountLabel(): string {
    if (this.postType === 'text_image') return `${this.images.length} / ${this.maxImages}`;
    if (this.postType === 'text_image_prompts') return `${this.filledSlotCount} / ${this.slots.length} uploaded`;
    return '';
  }

  // ── Feed preview ──────────────────────────────────────────────────────

  private get foldIndex(): number {
    const firstThreeLines = this.caption.split('\n').slice(0, 3).join('\n').length;
    return Math.min(FEED_FOLD_CHARS, firstThreeLines);
  }

  get previewIsLong(): boolean {
    return this.caption.length > this.foldIndex + 1;
  }

  get previewText(): string {
    return this.previewIsLong && !this.previewExpanded ? this.caption.slice(0, this.foldIndex).trimEnd() : this.caption;
  }

  get previewTiles(): PreviewTile[] {
    const urls =
      this.postType === 'text_image'
        ? this.images.map((img) => img.previewUrl)
        : this.postType === 'text_image_prompts'
        ? this.slots.filter((slot) => slot.image).map((slot) => slot.image!.previewUrl)
        : [];
    const layout = TILE_LAYOUTS[urls.length] ?? [];
    return urls.map((url, i) => ({ url, span: layout[i][0], ratio: layout[i][1] }));
  }

  private get scheduleIsValid(): boolean {
    const when = this.scheduledFor ? new Date(this.scheduledFor).getTime() : NaN;
    return !Number.isNaN(when) && when >= Date.now() + MIN_SCHEDULE_LEAD_MS;
  }

  /** Mirrors the server's validation so problems show before Send. */
  get checks(): ReadyCheck[] {
    const len = this.caption.length;
    const checks: ReadyCheck[] = [
      {
        state: !len ? 'wait' : len > CAPTION_LIMIT ? 'bad' : 'ok',
        label: !len ? 'No caption yet' : len > CAPTION_LIMIT ? "Caption is over LinkedIn's limit" : 'Caption ready',
        sub: `${len.toLocaleString()} of ${CAPTION_LIMIT.toLocaleString()} characters`,
      },
    ];

    if (this.postType === 'text') {
      checks.push({ state: 'ok', label: 'Text-only post', sub: 'No media attached' });
    } else if (this.postType === 'text_image') {
      const n = this.images.length;
      checks.push({
        state: n ? 'ok' : 'wait',
        label: n ? `${n} image${n === 1 ? '' : 's'} attached` : 'No images yet',
        sub: 'JPEG, PNG or WEBP · posts as text only if none',
      });
    } else {
      const filled = this.filledSlotCount;
      checks.push({
        state: filled && filled === this.slots.length ? 'ok' : 'wait',
        label: `${filled} of ${this.slots.length} images uploaded`,
        sub: 'Only filled slots are posted',
      });
    }

    if (this.publishMode === 'now') {
      checks.push({ state: 'ok', label: 'Publishes immediately', sub: 'Straight to your LinkedIn feed' });
    } else {
      const valid = this.scheduleIsValid;
      checks.push({
        state: valid ? 'ok' : this.scheduledFor ? 'bad' : 'wait',
        label: valid ? 'Scheduled time is set' : this.scheduledFor ? 'That time is too soon' : 'Pick a date and time',
        sub: 'At least 2 minutes from now',
      });
    }
    return checks;
  }

  checkIcon(check: ReadyCheck): string {
    return check.state === 'ok' ? 'i-check' : check.state === 'bad' ? 'i-circle-alert' : 'i-circle-dashed';
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ── Send ──────────────────────────────────────────────────────────────

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
        window.scrollTo({ top: 0 });
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
    this.previewExpanded = false;
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
