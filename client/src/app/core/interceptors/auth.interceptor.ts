import { Injectable, Injector } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { AuthService } from '../services/auth.service';

// The login session lives in an httpOnly cookie set by the backend (see
// server/src/routes/authRoutes.js). Since the API runs on a different
// origin than the Angular app, the browser won't attach that cookie unless
// the request explicitly opts in.
//
// A 401 from any app route means the cookie expired or was cleared, so
// the visitor is sent back to /login.
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  // AuthService and Router are looked up lazily: AuthService needs
  // HttpClient, which needs this interceptor - injecting it directly
  // would be a circular dependency.
  constructor(private readonly injector: Injector) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!request.url.startsWith(API_BASE_URL)) {
      return next.handle(request);
    }

    return next.handle(request.clone({ withCredentials: true })).pipe(
      catchError((err: unknown) => {
        const isAuthCall = request.url.startsWith(`${API_BASE_URL}/auth/`);
        if (err instanceof HttpErrorResponse && err.status === 401 && !isAuthCall) {
          this.injector.get(AuthService).markLoggedOut();
          const router = this.injector.get(Router);
          if (!router.url.startsWith('/login')) {
            router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          }
        }
        return throwError(() => err);
      })
    );
  }
}
