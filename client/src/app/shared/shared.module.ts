import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NavBarComponent } from './components/nav-bar/nav-bar.component';
import { ThemePickerComponent } from './components/theme-picker/theme-picker.component';

@NgModule({
  declarations: [NavBarComponent, ThemePickerComponent],
  imports: [CommonModule, FormsModule, RouterModule],
  exports: [NavBarComponent, ThemePickerComponent, CommonModule, FormsModule],
})
export class SharedModule {}
