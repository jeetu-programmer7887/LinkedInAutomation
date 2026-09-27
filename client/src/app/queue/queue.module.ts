import { NgModule } from '@angular/core';

import { QueueRoutingModule } from './queue-routing.module';
import { QueueComponent } from './queue.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [QueueComponent],
  imports: [QueueRoutingModule, SharedModule],
})
export class QueueModule {}
