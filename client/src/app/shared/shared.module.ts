import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NavBarComponent } from './components/nav-bar/nav-bar.component';
import { ThemePickerComponent } from './components/theme-picker/theme-picker.component';
// Shared so both the Dashboard and the Queue can open the same editor drawer.
import { PostEditorComponent } from '../dashboard/post-editor/post-editor.component';

@NgModule({
  declarations: [NavBarComponent, ThemePickerComponent, PostEditorComponent],
  imports: [CommonModule, FormsModule, RouterModule],
  exports: [NavBarComponent, ThemePickerComponent, PostEditorComponent, CommonModule, FormsModule, RouterModule],
})
export class SharedModule {}
