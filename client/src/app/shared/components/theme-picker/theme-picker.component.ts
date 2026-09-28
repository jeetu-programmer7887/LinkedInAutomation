import { Component } from '@angular/core';
import { Theme } from '../../../core/models/theme.model';
import { ThemeService } from '../../../core/services/theme.service';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** WCAG relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  if (!HEX_COLOR.test(a) || !HEX_COLOR.test(b)) return 0;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type ColorKey = 'background' | 'text' | 'hover';

@Component({
  selector: 'app-theme-picker',
  templateUrl: './theme-picker.component.html',
  styleUrls: ['./theme-picker.component.css'],
})
export class ThemePickerComponent {
  customColors: Theme;

  readonly customFields: { key: ColorKey; label: string }[] = [
    { key: 'background', label: 'Background' },
    { key: 'text', label: 'Text' },
    { key: 'hover', label: 'Accent (hover)' },
  ];

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

  isValid(value: string): boolean {
    return HEX_COLOR.test(value);
  }

  /** The server only accepts #RRGGBB, so wait until all three are valid. */
  applyCustom(): void {
    const { background, text, hover } = this.customColors;
    if (![background, text, hover].every((c) => HEX_COLOR.test(c))) return;
    this.themeService.setTheme({ ...this.customColors, name: 'Custom' });
  }

  get textContrast(): number {
    return contrastRatio(this.currentTheme.text, this.currentTheme.background);
  }

  get accentContrast(): number {
    return contrastRatio(this.currentTheme.hover, this.currentTheme.background);
  }
}
