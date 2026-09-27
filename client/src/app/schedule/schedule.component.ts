import { Component, OnInit } from '@angular/core';
import { IdeaService } from '../core/services/idea.service';
import { IdeaBatch, IdeasOverview, PostFormat } from '../core/models/idea.model';

/** The Ideas page: daily research time plus the latest batch of researched ideas. */
@Component({
  selector: 'app-schedule',
  templateUrl: './schedule.component.html',
  styleUrls: ['./schedule.component.css'],
})
export class ScheduleComponent implements OnInit {
  overview: IdeasOverview | null = null;

  researchTime = '';
  savingTime = false;
  timeSaved = false;

  loading = true;
  refreshing = false;
  error: string | null = null;

  readonly formats: { value: PostFormat; label: string }[] = [
    { value: 'text', label: 'Text only' },
    { value: 'text_image', label: 'Text + image' },
    { value: 'text_image_prompts', label: 'Text + image prompts' },
  ];

  constructor(private readonly ideaService: IdeaService) {}

  ngOnInit(): void {
    this.loadOverview();
  }

  get batch(): IdeaBatch | null {
    return this.overview?.latest ?? null;
  }

  get timeUnchanged(): boolean {
    return this.researchTime === this.overview?.settings?.researchTime;
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

  pad(index: number): string {
    return String(index + 1).padStart(2, '0');
  }
}
