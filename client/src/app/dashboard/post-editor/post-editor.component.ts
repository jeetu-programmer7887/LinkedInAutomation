import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { PostService } from '../../core/services/post.service';
import { Post } from '../../core/models/post.model';

const MAX_IMAGES = 5;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Matches the server: a scheduled post needs at least one scheduler tick.
const MIN_SCHEDULE_LEAD_MS = 2 * 60_000;

/** An image already stored with the post, or a new upload replacing/adding one. */
type ImageSlot =
  | { kind: 'stored'; order: number; url: string }
  | { kind: 'new'; file: File; previewUrl: string };

/** datetime-local value (local time, minute precision) for a Date. */
function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Side drawer to fix a failed post or edit a scheduled one: change the
 * caption, replace, remove or add images, then reschedule it or post it
 * right away. Used by the Dashboard and the Queue.
 */
@Component({
  selector: 'app-post-editor',
  templateUrl: './post-editor.component.html',
  styleUrls: ['./post-editor.component.css'],
})
export class PostEditorComponent implements OnInit, OnDestroy {
  @Input({ required: true }) post!: Post;
  /** Emits the updated post after a successful save or publish. */
  @Output() saved = new EventEmitter<Post>();
  @Output() closed = new EventEmitter<void>();

  caption = '';
  slots: ImageSlot[] = [];
  mode: 'schedule' | 'now' = 'schedule';
  scheduledFor = '';

  saving = false;
  error: string | null = null;

  readonly maxImages = MAX_IMAGES;
  readonly captionLimit = 3000;

  private previousOverflow = '';

  constructor(private readonly postService: PostService) {}

  ngOnInit(): void {
    this.caption = this.post.content.text;
    this.slots = this.post.images.map((_, order) => ({
      kind: 'stored',
      order,
      url: this.postService.storedImageUrl(this.post._id, order, this.post.updatedAt),
    }));

    // Keep a still-future scheduled time; otherwise suggest an hour from now.
    const current = this.post.scheduledFor ? new Date(this.post.scheduledFor) : null;
    const suggested =
      current && current.getTime() > Date.now() + MIN_SCHEDULE_LEAD_MS ? current : new Date(Date.now() + 60 * 60_000);
    this.scheduledFor = toLocalInput(suggested);

    // Stop the page behind the drawer from scrolling.
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
    this.slots.forEach((slot) => slot.kind === 'new' && URL.revokeObjectURL(slot.previewUrl));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.saving) this.closed.emit();
  }

  get isFailed(): boolean {
    return this.post.status === 'failed';
  }

  get minScheduleTime(): string {
    return toLocalInput(new Date(Date.now() + MIN_SCHEDULE_LEAD_MS));
  }

  get saveLabel(): string {
    if (this.saving) return this.mode === 'now' ? 'Posting…' : 'Saving…';
    if (this.mode === 'now') return 'Save & post now';
    return this.isFailed ? 'Save & reschedule' : 'Save changes';
  }

  imageUrl(slot: ImageSlot): string {
    return slot.kind === 'stored' ? slot.url : slot.previewUrl;
  }

  /** Swaps the image at `index` for a newly chosen file, keeping its position. */
  replaceImage(event: Event, index: number): void {
    const file = this.takeFile(event);
    if (!file) return;
    this.release(this.slots[index]);
    this.slots[index] = { kind: 'new', file, previewUrl: URL.createObjectURL(file) };
  }

  addImage(event: Event): void {
    const file = this.takeFile(event);
    if (!file) return;
    if (this.slots.length >= MAX_IMAGES) {
      this.error = `A post can have at most ${MAX_IMAGES} images.`;
      return;
    }
    this.slots.push({ kind: 'new', file, previewUrl: URL.createObjectURL(file) });
  }

  removeImage(index: number): void {
    this.release(this.slots[index]);
    this.slots.splice(index, 1);
  }

  save(): void {
    if (!this.caption.trim()) {
      this.error = 'The caption cannot be empty.';
      return;
    }

    let when: Date | null = null;
    if (this.mode === 'schedule') {
      when = this.scheduledFor ? new Date(this.scheduledFor) : null;
      if (!when || Number.isNaN(when.getTime())) {
        this.error = 'Pick the date and time to publish.';
        return;
      }
      if (when.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
        this.error = 'Pick a time at least 2 minutes from now.';
        return;
      }
    }

    const formData = new FormData();
    formData.append('caption', this.caption);
    const layout: string[] = [];
    let uploads = 0;
    for (const slot of this.slots) {
      if (slot.kind === 'stored') {
        layout.push(`e${slot.order}`);
      } else {
        layout.push(`u${uploads++}`);
        formData.append('images', slot.file);
      }
    }
    formData.append('layout', JSON.stringify(layout));
    if (when) {
      formData.append('scheduledFor', when.toISOString());
    } else {
      formData.append('publishNow', 'true');
    }

    this.error = null;
    this.saving = true;
    this.postService.updatePost(this.post._id, formData).subscribe({
      next: (post) => {
        this.saving = false;
        this.saved.emit(post);
      },
      error: (err) => {
        this.saving = false;
        this.error = err.error?.error || 'Could not save the post. Try again.';
      },
    });
  }

  private takeFile(event: Event): File | null {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file && !ALLOWED_IMAGE_TYPES.has(file.type)) {
      this.error = 'Only JPEG, PNG, or WEBP images are allowed.';
      return null;
    }
    this.error = null;
    return file;
  }

  private release(slot: ImageSlot): void {
    if (slot.kind === 'new') {
      URL.revokeObjectURL(slot.previewUrl);
    }
  }
}
