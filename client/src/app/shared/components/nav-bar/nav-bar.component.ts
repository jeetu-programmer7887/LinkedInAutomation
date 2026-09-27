import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { PostService } from '../../../core/services/post.service';
import { DashboardService } from '../../../core/services/dashboard.service';
import { ThemeService } from '../../../core/services/theme.service';
import { Post } from '../../../core/models/post.model';
import { excerpt } from '../../../core/models/post-labels';

interface NavLink {
  path: string;
  label: string;
  icon: string;
  hint: string;
}

/**
 * Left rail on desktop, sticky top bar with a drop-down menu on phones and
 * tablets. Shows how many posts are queued / failed and the next one due,
 * refreshed on every navigation.
 */
@Component({
  selector: 'app-nav-bar',
  templateUrl: './nav-bar.component.html',
  styleUrls: ['./nav-bar.component.css'],
})
export class NavBarComponent implements OnInit, OnDestroy {
  isMenuOpen = false;
  scheduledCount = 0;
  failedCount = 0;
  nextPost: Post | null = null;
  themeName = '';

  readonly links: NavLink[] = [
    { path: '/compose', label: 'Compose', icon: 'i-pen-line', hint: 'Write and publish a post' },
    { path: '/ideas', label: 'Ideas', icon: 'i-lightbulb', hint: 'Researched post ideas' },
    { path: '/queue', label: 'Queue', icon: 'i-calendar-clock', hint: 'Posts scheduled to go out' },
    { path: '/dashboard', label: 'Dashboard', icon: 'i-layout-dashboard', hint: 'Totals, every post and recent activity' },
    { path: '/settings', label: 'Settings', icon: 'i-settings-2', hint: 'Theme and appearance' },
  ];

  private readonly subs = new Subscription();

  constructor(
    private readonly router: Router,
    private readonly postService: PostService,
    private readonly dashboardService: DashboardService,
    private readonly themeService: ThemeService
  ) {}

  ngOnInit(): void {
    this.refresh();
    this.subs.add(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
        this.closeMenu();
        this.refresh();
      })
    );
    this.subs.add(this.themeService.currentTheme$.subscribe((theme) => (this.themeName = theme.name)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /** Counts are a nice-to-have: failures (e.g. server down) are ignored. */
  refresh(): void {
    this.postService.getScheduled().subscribe({
      next: (posts) => {
        this.scheduledCount = posts.length;
        this.nextPost = posts[0] ?? null;
      },
      error: () => {},
    });
    this.dashboardService.getSummary().subscribe({
      next: (summary) => (this.failedCount = summary.byStatus['failed'] ?? 0),
      error: () => {},
    });
  }

  badge(path: string): number {
    if (path === '/queue') return this.scheduledCount;
    if (path === '/dashboard') return this.failedCount;
    return 0;
  }

  badgeTitle(path: string): string {
    return path === '/queue' ? 'Posts scheduled' : 'Failed posts that need a fix';
  }

  excerpt(text: string): string {
    return excerpt(text, 70);
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  @HostListener('document:keydown.escape')
  closeMenu(): void {
    this.isMenuOpen = false;
  }
}
