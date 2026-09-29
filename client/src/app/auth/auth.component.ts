import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css'],
})
export class AuthComponent {
  username = '';
  password = '';
  showPassword = false;
  submitting = false;
  error: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService
  ) {}

  submit(): void {
    if (this.submitting) return;
    if (!this.username.trim() || !this.password) {
      this.error = 'Enter your username and password.';
      return;
    }

    this.submitting = true;
    this.error = null;
    this.authService.login(this.username.trim(), this.password).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl()),
      error: (err: HttpErrorResponse) => {
        this.submitting = false;
        this.password = '';
        this.error =
          err.status === 0 ? 'Could not reach the server. Is it running?' : err.error?.error || 'Login failed. Try again.';
      },
    });
  }

  // Only same-app paths: "//evil.com" or a full URL would be an open redirect.
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login') ? url : '/compose';
  }
}
