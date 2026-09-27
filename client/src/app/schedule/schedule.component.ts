import { Component, OnInit } from '@angular/core';
import { IdeaService } from '../core/services/idea.service';
import { PostService } from '../core/services/post.service';
import { IdeaBatch, IdeasOverview, PostFormat } from '../core/models/idea.model';
import { Post } from '../core/models/post.model';

@Component({
  selector: 'app-schedule',
  templateUrl: './schedule.component.html',
  styleUrls: ['./schedule.component.css'],
})
export class ScheduleComponent implements OnInit {
  overview: IdeasOverview | null = null;
  scheduledPosts: Post[] = [];

  researchTime = '';
  savingTime = false;
  timeSaved = false;

  loading = true;
  refreshing = false;
  cancellingId: string | null = null;
  error: string | null = null;

  readonly formats: { value: PostFormat; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'text_image', label: 'Text + Image' },
    { value: 'text_image_prompts', label: 'Text + Image prompts' },
  ];

  constructor(
    private readonly ideaService: IdeaService,
    private readonly postService: PostService
  ) {}

  ngOnInit(): void {
    this.loadOverview();
    this.loadScheduledPosts();
  }

  get batch(): IdeaBatch | null {
    return this.overview?.latest ?? null;
  }

  /** The most recent run failed after the ideas on screen were made. */
  get lastRunFailure(): string | null {
    const lastRun = this.overview?.lastRun;
    if (lastRun?.status !== 'failed') return null;
    if (this.batch && new Date(this.batch.createdAt) > new Date(lastRun.createdAt)) return null;
    return lastRun.failureReason || 'Unknown error';
  }

  loadOverview(): void {
    this.loading = true;
    this.ideaService.getOverview().subscribe({
      next: (overview) => {
        this.overview = overview;
        this.researchTime = overview.settings.researchTime;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not load ideas. Is the server running?';
        this.loading = false;
      },
    });
  }

  loadScheduledPosts(): void {
    this.postService.getScheduled().subscribe({
      next: (posts) => (this.scheduledPosts = posts),
      error: (err) => (this.error = err.error?.error || 'Could not load scheduled posts.'),
    });
  }

  saveResearchTime(): void {
    if (!this.researchTime) {
      this.error = 'Pick a time first.';
      return;
    }
    this.error = null;
    this.savingTime = true;
    this.ideaService.updateResearchTime(this.researchTime).subscribe({
      next: (settings) => {
        if (this.overview) this.overview.settings = settings;
        this.savingTime = false;
        this.timeSaved = true;
        setTimeout(() => (this.timeSaved = false), 2000);
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not save the research time.';
        this.savingTime = false;
      },
    });
  }

  getFreshIdeas(): void {
    this.error = null;
    this.refreshing = true;
    this.ideaService.refresh().subscribe({
      next: () => {
        this.refreshing = false;
        this.loadOverview();
      },
      error: (err) => {
        this.error = err.error?.error || 'Research failed. Try again.';
        this.refreshing = false;
      },
    });
  }

  cancelScheduledPost(post: Post): void {
    if (!confirm('Cancel this scheduled post? It will not be published.')) return;
    this.error = null;
    this.cancellingId = post._id;
    this.postService.cancelScheduled(post._id).subscribe({
      next: () => {
        this.scheduledPosts = this.scheduledPosts.filter((p) => p._id !== post._id);
        this.cancellingId = null;
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not cancel the post.';
        this.cancellingId = null;
        this.loadScheduledPosts();
      },
    });
  }

  excerpt(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
  }
}
