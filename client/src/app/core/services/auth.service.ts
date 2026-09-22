import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, of, tap } from 'rxjs';
import { User } from '../models/user.model';
import { API_BASE_URL } from '../config/api-config';
import { ThemeService } from './theme.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly currentUserSubject = new BehaviorSubject<User | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();

  private readonly checkedSubject = new BehaviorSubject<boolean>(false);
  readonly checked$ = this.checkedSubject.asObservable();

  constructor(private readonly http: HttpClient, private readonly themeService: ThemeService) {}

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /** Full-page redirect - OAuth has to leave the SPA to hit LinkedIn's consent screen. */
  login(): void {
    window.location.href = `${API_BASE_URL}/auth/linkedin`;
  }

  logout(): void {
    this.http.post(`${API_BASE_URL}/auth/logout`, {}).subscribe(() => {
      this.currentUserSubject.next(null);
    });
  }

  /** Called once on app start to see if the session cookie is still valid. */
  refreshCurrentUser() {
    return this.http.get<User>(`${API_BASE_URL}/users/me`).pipe(
      tap((user) => {
        this.currentUserSubject.next(user);
        this.themeService.hydrateFromServer(user.theme);
      }),
      catchError(() => {
        this.currentUserSubject.next(null);
        return of(null);
      }),
      tap(() => this.checkedSubject.next(true))
    );
  }
}
