import { Component } from '@angular/core';
import {
  Event,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { Observable, distinctUntilChanged, filter, map, of, switchMap, timer } from 'rxjs';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'client';

  /** The nav rail only exists once logged in; /login is a bare page. */
  readonly authenticated$ = this.authService.authenticated$;

  /**
   * True while a page change (the login check + the page's lazy chunk)
   * takes longer than 150ms - quick switches never flash the loader.
   */
  readonly navigating$: Observable<boolean> = this.router.events.pipe(
    filter(
      (e: Event) =>
        e instanceof NavigationStart ||
        e instanceof NavigationEnd ||
        e instanceof NavigationCancel ||
        e instanceof NavigationError
    ),
    map((e) => e instanceof NavigationStart),
    distinctUntilChanged(),
    switchMap((started) => (started ? timer(150).pipe(map(() => true)) : of(false)))
  );

  // ThemeService is injected here so the cached theme is applied on every
  // page from the first render - the login page included. The saved copy
  // needs the login, so it's synced each time we become logged in.
  constructor(
    themeService: ThemeService,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
    this.authenticated$
      .pipe(
        distinctUntilChanged(),
        filter((loggedIn) => loggedIn === true)
      )
      .subscribe(() => themeService.loadFromServer());
  }
}
