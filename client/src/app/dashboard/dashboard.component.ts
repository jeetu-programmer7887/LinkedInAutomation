import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { DashboardService } from '../core/services/dashboard.service';
import { PostService } from '../core/services/post.service';
import { DashboardSummary } from '../core/models/dashboard.model';
import { Post } from '../core/models/post.model';
import { POST_TYPE_LABELS, STATUS_LABELS, excerpt } from '../core/models/post-labels';

interface Breakdown {
  label: string;
  count: number;
  share: number; // 0-100, for the bar width
}

interface Tile {
  label: string;
  value: number;
  sub: string;
  alert?: boolean;
}

/**
 * Everything the app has recorded: how many posts were created (published,
 * scheduled, failed, cancelled - generations never count), what kind they
 * were, where each one stands, and the activity log.
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit {
  summary: DashboardSummary | null = null;
  posts: Post[] = [];

  statusFilter = '';
  typeFilter = '';

  loading = true;
  error: string | null = null;
  editingPost: Post | null = null;
  cancellingId: string | null = null;

  readonly statusFilters = [
    { value: '', label: 'All' },
    { value: 'published', label: 'Published' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
  readonly typeOptions = Object.entries(POST_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly postService: PostService
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.error = null;
    forkJoin({
      summary: this.dashboardService.getSummary(),
      posts: this.postService.getPosts({ status: this.statusFilter, type: this.typeFilter }),
    }).subscribe({
      next: ({ summary, posts }) => {
        this.summary = summary;
        this.posts = posts;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not load the dashboard. Is the server running?';
        this.loading = false;
      },
    });
  }

  setStatusFilter(value: string): void {
    this.statusFilter = value;
    this.editingPost = null;
    this.reload();
  }

  count(status: string): number {
    return this.summary?.byStatus[status] ?? 0;
  }

  get tiles(): Tile[] {
    if (!this.summary) return [];
    const failed = this.count('failed');
    return [
      { label: 'Posts created', value: this.summary.total, sub: `${this.summary.last7Days} this week · ${this.summary.last30Days} in 30 days` },
      { label: 'Published', value: this.count('published'), sub: 'Live on LinkedIn' },
      { label: 'Scheduled', value: this.count('scheduled') + this.count('publishing'), sub: 'Waiting in the queue' },
      { label: 'Failed', value: failed, sub: failed ? 'Needs a fix' : 'All clear', alert: failed > 0 },
      { label: 'Cancelled', value: this.count('cancelled'), sub: 'Kept for the record' },
    ];
  }

  get typeBreakdown(): Breakdown[] {
    return this.breakdown(this.summary?.byType ?? {}, POST_TYPE_LABELS);
  }

  get sourceBreakdown(): Breakdown[] {
    return this.breakdown(this.summary?.bySource ?? {}, { idea: 'From an idea', manual: 'Written from scratch' });
  }

  typeLabel(post: Post): string {
    return post.postType ? POST_TYPE_LABELS[post.postType] : 'Unknown';
  }

  statusLabel(post: Post): string {
    return STATUS_LABELS[post.status] ?? post.status;
  }

  excerpt(text: string): string {
    return excerpt(text, 180);
  }

  canEdit(post: Post): boolean {
    return post.status === 'failed' || post.status === 'scheduled';
  }

  openEditor(post: Post): void {
    this.editingPost = post;
  }

  onSaved(): void {
    this.editingPost = null;
    this.reload();
  }

  cancelPost(post: Post): void {
    if (!confirm('Cancel this scheduled post? It will not be published.')) return;
    this.cancellingId = post._id;
    this.postService.cancelScheduled(post._id).subscribe({
      next: () => {
        this.cancellingId = null;
        this.reload();
      },
      error: (err) => {
        this.cancellingId = null;
        this.error = err.error?.error || 'Could not cancel the post.';
        this.reload();
      },
    });
  }

  trackByLabel(_: number, item: { label: string }): string {
    return item.label;
  }

  private breakdown(counts: Record<string, number>, labels: Record<string, string>): Breakdown[] {
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return Object.entries(labels).map(([key, label]) => {
      const count = counts[key] ?? 0;
      return { label, count, share: total ? Math.round((count / total) * 100) : 0 };
    });
  }
}
