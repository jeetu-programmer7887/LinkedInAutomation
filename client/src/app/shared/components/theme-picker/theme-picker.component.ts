import { Component } from '@angular/core';
import { Theme } from '../../../core/models/theme.model';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-theme-picker',
  templateUrl: './theme-picker.component.html',
  styleUrls: ['./theme-picker.component.css'],
})
export class ThemePickerComponent {
  customColors: Theme;

  constructor(readonly themeService: ThemeService) {
    this.customColors = { ...themeService.currentTheme, name: 'Custom' };
  }

  get presets(): Theme[] {
    return this.themeService.presets;
  }

  get currentTheme(): Theme {
    return this.themeService.currentTheme;
  }

  isActivePreset(preset: Theme): boolean {
    return this.currentTheme.name === preset.name;
  }

  choosePreset(preset: Theme): void {
    this.customColors = { ...preset };
    this.themeService.setPreset(preset.name);
  }

  applyCustom(): void {
    this.themeService.setTheme({ ...this.customColors, name: 'Custom' });
  }
}
