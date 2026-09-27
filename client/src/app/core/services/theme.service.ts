import { Inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_THEME, Theme, THEME_PRESETS } from '../models/theme.model';
import { API_BASE_URL } from '../config/api-config';

const STORAGE_KEY = 'la_theme';

// Applies the chosen Background/Text/Hover colors as CSS custom properties
// on <html>, so every component stylesheet that references
// var(--color-bg/--color-text/--color-hover) updates instantly, app-wide,
// with no reload.
//
// Two copies of the theme: MongoDB (GET/PUT /api/settings/theme) is the
// source of truth, shared by every browser; localStorage is this browser's
// cache, applied the instant the app boots so a refresh never flashes the
// default colors while the server copy loads. AppComponent creates this
// service at startup and calls loadFromServer().
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly presets: Theme[] = THEME_PRESETS;

  private readonly currentThemeSubject = new BehaviorSubject<Theme>(this.readCachedTheme());
  readonly currentTheme$ = this.currentThemeSubject.asObservable();

  constructor(@Inject(DOCUMENT) private readonly document: Document, private readonly http: HttpClient) {
    this.applyToDom(this.currentThemeSubject.value);
  }

  get currentTheme(): Theme {
    return this.currentThemeSubject.value;
  }

  /** Applies immediately, caches in this browser, and saves to the server. */
  setTheme(theme: Theme): void {
    this.apply(theme);

    this.http.put<Theme>(`${API_BASE_URL}/settings/theme`, theme).subscribe({
      error: () => {
        // Non-fatal: the theme still applies and stays cached in this
        // browser even if the save fails (e.g. the server is down).
      },
    });
  }

  /**
   * Syncs with the saved theme once at startup. The server copy wins, so a
   * theme set in one browser follows to the next. If the server has never
   * saved one, this browser's cached choice (if any) is uploaded rather than
   * replaced by the default. If the server is unreachable, the cache stays.
   */
  loadFromServer(): void {
    this.http.get<{ theme: Theme | null }>(`${API_BASE_URL}/settings/theme`).subscribe({
      next: ({ theme }) => {
        if (theme) {
          this.hydrateFromServer(theme);
        } else if (this.hasCachedTheme()) {
          this.setTheme(this.currentTheme);
        }
      },
      error: () => {
        // Keep the cached theme.
      },
    });
  }

  setPreset(name: string): void {
    const preset = this.presets.find((t) => t.name === name);
    if (preset) {
      this.setTheme(preset);
    }
  }

  /** Called once after login with the theme stored on the user's profile. */
  hydrateFromServer(theme: Theme | null | undefined): void {
    if (theme?.background && theme?.text && theme?.hover) {
      this.apply(theme);
    }
  }

  private apply(theme: Theme): void {
    this.currentThemeSubject.next(theme);
    this.applyToDom(theme);
    this.cacheTheme(theme);
  }

  private applyToDom(theme: Theme): void {
    const root = this.document.documentElement;
    root.style.setProperty('--color-bg', theme.background);
    root.style.setProperty('--color-text', theme.text);
    root.style.setProperty('--color-hover', theme.hover);
  }

  private cacheTheme(theme: Theme): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {
      // Private browsing / storage disabled - fine, just skip the cache.
    }
  }

  private hasCachedTheme(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  private readCachedTheme(): Theme {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached) as Theme;
      }
    } catch {
      // Ignore malformed/inaccessible storage and fall back to default.
    }
    return DEFAULT_THEME;
  }
}
