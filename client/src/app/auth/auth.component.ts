import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css'],
})
export class AuthComponent {
  error: string | null = this.route.snapshot.queryParamMap.get('error');

  constructor(private readonly route: ActivatedRoute, readonly authService: AuthService) {}
}
