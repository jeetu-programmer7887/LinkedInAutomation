import { Inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_THEME, Theme, THEME_PRESETS } from '../models/theme.model';
import { API_BASE_URL } from '../config/api-config';

const STORAGE_KEY = 'la_theme';

// Applies the user's chosen Background/Text/Hover colors as CSS custom
// properties on <html>, so every component stylesheet that references
// var(--color-bg/--color-text/--color-hover) updates instantly, app-wide,
// with no reload. localStorage is only a flash-of-default-theme guard for
// the moment before the server value loads - the server theme (User.theme)
// is always the source of truth once the user is logged in.
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

  /** Applies immediately and persists to the logged-in user's profile. */
  setTheme(theme: Theme): void {
    this.currentThemeSubject.next(theme);
    this.applyToDom(theme);
    this.cacheTheme(theme);

    this.http.patch(`${API_BASE_URL}/users/me/theme`, theme).subscribe({
      error: () => {
        // Non-fatal: the theme still applies locally even if the save
        // fails (e.g. offline, or not logged in yet).
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
      this.currentThemeSubject.next(theme);
      this.applyToDom(theme);
      this.cacheTheme(theme);
    }
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
