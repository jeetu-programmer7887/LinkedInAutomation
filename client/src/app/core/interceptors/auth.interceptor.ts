import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';

// Our session lives in an httpOnly cookie set by the backend's OAuth
// callback (see server/src/routes/authRoutes.js). Since the API runs on a
// different port (localhost:3000) than the Angular dev server
// (localhost:4200), the browser treats them as different origins and
// won't attach that cookie unless the request explicitly opts in.
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (request.url.startsWith(API_BASE_URL)) {
      request = request.clone({ withCredentials: true });
    }
    return next.handle(request);
  }
}
