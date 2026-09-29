import { Component } from '@angular/core';
import { distinctUntilChanged, filter } from 'rxjs';
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

  // ThemeService is injected here so the cached theme is applied on every
  // page from the first render - the login page included. The saved copy
  // needs the login, so it's synced each time we become logged in.
  constructor(themeService: ThemeService, private readonly authService: AuthService) {
    this.authenticated$
      .pipe(
        distinctUntilChanged(),
        filter((loggedIn) => loggedIn === true)
      )
      .subscribe(() => themeService.loadFromServer());
  }
}
