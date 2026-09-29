import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** App pages: logged-out visitors go to /login, then come back here. */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthService)
    .checkSession()
    .pipe(map((ok) => ok || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })));
};

/** The login page: already logged in means there is nothing to do there. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService)
    .checkSession()
    .pipe(map((ok) => (ok ? router.createUrlTree(['/compose']) : true)));
};
