import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'compose', pathMatch: 'full' },
  { path: 'auth', loadChildren: () => import('./auth/auth.module').then((m) => m.AuthModule) },
  { path: 'compose', loadChildren: () => import('./compose/compose.module').then((m) => m.ComposeModule) },
  // The research + idea cards (the old Schedule page) now live at /ideas;
  // scheduled posts moved to their own /queue page.
  { path: 'ideas', loadChildren: () => import('./schedule/schedule.module').then((m) => m.ScheduleModule) },
  { path: 'queue', loadChildren: () => import('./queue/queue.module').then((m) => m.QueueModule) },
  { path: 'schedule', redirectTo: 'ideas', pathMatch: 'full' },
  { path: 'dashboard', loadChildren: () => import('./dashboard/dashboard.module').then((m) => m.DashboardModule) },
  { path: 'settings', loadChildren: () => import('./settings/settings.module').then((m) => m.SettingsModule) },
  { path: '**', redirectTo: 'compose' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
