import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';

interface SessionResponse {
  authenticated: boolean;
  username?: string;
}

// Username/password login for the whole app. The session itself is an
// httpOnly cookie (7 days) set by POST /api/auth/login, so this service
// never sees a token - it only tracks whether the server says we're in.
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  /** null until the first session check answers. */
  private readonly authenticatedSubject = new BehaviorSubject<boolean | null>(null);
  readonly authenticated$ = this.authenticatedSubject.asObservable();

  private username: string | null = null;
  private pendingCheck: Observable<boolean> | null = null;

  constructor(private readonly http: HttpClient) {}

  get currentUsername(): string | null {
    return this.username;
  }

  /** Answers from memory once known; otherwise asks the server once. */
  checkSession(): Observable<boolean> {
    const known = this.authenticatedSubject.value;
    if (known !== null) {
      return of(known);
    }
    if (!this.pendingCheck) {
      this.pendingCheck = this.http.get<SessionResponse>(`${API_BASE_URL}/auth/session`).pipe(
        map((res) => this.setSession(res)),
        catchError(() => of(this.setSession({ authenticated: false }))),
        finalize(() => (this.pendingCheck = null)),
        shareReplay(1)
      );
    }
    return this.pendingCheck;
  }

  login(username: string, password: string): Observable<void> {
    return this.http
      .post<SessionResponse>(`${API_BASE_URL}/auth/login`, { username, password })
      .pipe(
        tap((res) => this.setSession(res)),
        map(() => undefined)
      );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/auth/logout`, {}).pipe(
      // Log out locally even if the server call fails.
      catchError(() => of(undefined)),
      tap(() => this.markLoggedOut())
    );
  }

  /** The server rejected our cookie (expired or cleared elsewhere). */
  markLoggedOut(): void {
    this.setSession({ authenticated: false });
  }

  private setSession(res: SessionResponse): boolean {
    this.username = res.authenticated ? res.username ?? null : null;
    this.authenticatedSubject.next(res.authenticated);
    return res.authenticated;
  }
}
