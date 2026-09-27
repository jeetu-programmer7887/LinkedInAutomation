import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../config/api-config';
import { DashboardSummary } from '../models/dashboard.model';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  constructor(private readonly http: HttpClient) {}

  getSummary() {
    return this.http.get<DashboardSummary>(`${API_BASE_URL}/dashboard`);
  }
}
