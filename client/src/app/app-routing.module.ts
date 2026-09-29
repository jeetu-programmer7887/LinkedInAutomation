import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

// Every page except /login needs the username/password login.
const routes: Routes = [
  { path: '', redirectTo: 'compose', pathMatch: 'full' },
  { path: 'login', canActivate: [guestGuard], loadChildren: () => import('./auth/auth.module').then((m) => m.AuthModule) },
  // Old sign-in URL (the LinkedIn OAuth callback still redirects here on error).
  { path: 'auth', redirectTo: 'login', pathMatch: 'full' },
  { path: 'compose', canActivate: [authGuard], loadChildren: () => import('./compose/compose.module').then((m) => m.ComposeModule) },
  // The research + idea cards (the old Schedule page) now live at /ideas;
  // scheduled posts moved to their own /queue page.
  { path: 'ideas', canActivate: [authGuard], loadChildren: () => import('./schedule/schedule.module').then((m) => m.ScheduleModule) },
  { path: 'queue', canActivate: [authGuard], loadChildren: () => import('./queue/queue.module').then((m) => m.QueueModule) },
  { path: 'schedule', redirectTo: 'ideas', pathMatch: 'full' },
  { path: 'dashboard', canActivate: [authGuard], loadChildren: () => import('./dashboard/dashboard.module').then((m) => m.DashboardModule) },
  { path: 'settings', canActivate: [authGuard], loadChildren: () => import('./settings/settings.module').then((m) => m.SettingsModule) },
  { path: '**', redirectTo: 'compose' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
