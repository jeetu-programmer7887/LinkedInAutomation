import { Component, OnInit } from '@angular/core';
import { PostService } from '../core/services/post.service';
import { Post } from '../core/models/post.model';
import { POST_TYPE_LABELS, excerpt } from '../core/models/post-labels';

const DAY_MS = 24 * 60 * 60 * 1000;

interface DayGroup {
  key: string;
  date: Date;
  relative: string;
  posts: Post[];
}

/** Every scheduled post, soonest first, grouped by day - edit or cancel before it goes out. */
@Component({
  selector: 'app-queue',
  templateUrl: './queue.component.html',
  styleUrls: ['./queue.component.css'],
})
export class QueueComponent implements OnInit {
  posts: Post[] = [];
  groups: DayGroup[] = [];

  loading = true;
  error: string | null = null;
  cancellingId: string | null = null;
  editingPost: Post | null = null;

  readonly typeLabels = POST_TYPE_LABELS;

  constructor(private readonly postService: PostService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.postService.getScheduled().subscribe({
      next: (posts) => {
        // The server already sorts status=scheduled soonest-first.
        this.posts = posts;
        this.groups = this.groupByDay(posts);
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not load scheduled posts. Is the server running?';
        this.loading = false;
      },
    });
  }

  cancel(post: Post): void {
    if (!confirm('Cancel this scheduled post? It will not be published.')) return;
    this.error = null;
    this.cancellingId = post._id;
    this.postService.cancelScheduled(post._id).subscribe({
      next: () => {
        this.cancellingId = null;
        this.load();
      },
      error: (err) => {
        this.error = err.error?.error || 'Could not cancel the post.';
        this.cancellingId = null;
        this.load();
      },
    });
  }

  onSaved(): void {
    this.editingPost = null;
    this.load();
  }

  excerpt(text: string): string {
    return excerpt(text, 220);
  }

  private groupByDay(posts: Post[]): DayGroup[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const groups: DayGroup[] = [];

    for (const post of posts) {
      if (!post.scheduledFor) continue;
      const date = new Date(post.scheduledFor);
      const key = date.toDateString();
      let group = groups.find((g) => g.key === key);
      if (!group) {
        const day = new Date(date);
        day.setHours(0, 0, 0, 0);
        const diff = Math.round((day.getTime() - today.getTime()) / DAY_MS);
        const relative = diff <= 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff} days`;
        group = { key, date, relative, posts: [] };
        groups.push(group);
      }
      group.posts.push(post);
    }
    return groups;
  }
}
