import { Component } from '@angular/core';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'client';

  // Injected here so the theme is applied on every page from the first
  // render (from the browser cache), then synced with the saved copy.
  constructor(themeService: ThemeService) {
    themeService.loadFromServer();
  }
}
