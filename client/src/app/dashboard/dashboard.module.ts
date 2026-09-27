import { NgModule } from '@angular/core';

import { DashboardRoutingModule } from './dashboard-routing.module';
import { DashboardComponent } from './dashboard.component';
import { PostEditorComponent } from './post-editor/post-editor.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [DashboardComponent, PostEditorComponent],
  imports: [DashboardRoutingModule, SharedModule],
})
export class DashboardModule {}
