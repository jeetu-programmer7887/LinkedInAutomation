import { ChangeDetectionStrategy, Component, HostBinding, Input, booleanAttribute } from '@angular/core';

/**
 * The app's loading mark, drawn after the JP logo: a broken copper ring
 * that spins, the J and P writing themselves in, and the logo's little
 * pixel squares blinking.
 *
 *   <app-loader size="lg" label="Loading the queue…" block></app-loader>  page load
 *   <app-loader size="md" label="Writing your caption…"></app-loader>      section
 *   <app-loader size="sm"></app-loader>                                     inside a button
 *
 * "sm" is just the spinning ring in the button's own text color, so it
 * reads on any button background. Colors follow the active theme.
 */
@Component({
  selector: 'app-loader',
  templateUrl: './loader.component.html',
  styleUrls: ['./loader.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoaderComponent {
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  /** Shown under md/lg marks, and announced to screen readers. */
  @Input() label = '';

  /** Centers the loader in its own padded block - for whole-page loads. */
  @Input({ transform: booleanAttribute }) @HostBinding('class.block') block = false;

  @HostBinding('class') get sizeClass(): string {
    return `loader-${this.size}`;
  }
}
