import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../config/api-config';
import { Idea, IdeaBatch, IdeasOverview, ResearchSettings } from '../models/idea.model';

@Injectable({
  providedIn: 'root',
})
export class IdeaService {
  constructor(private readonly http: HttpClient) {}

  /** Latest finished ideas, the most recent run's outcome, and the research time. */
  getOverview() {
    return this.http.get<IdeasOverview>(`${API_BASE_URL}/ideas`);
  }

  /** Runs research now. Resolves once the new ideas are ready (~10-30s). */
  refresh() {
    return this.http.post<IdeaBatch>(`${API_BASE_URL}/ideas/refresh`, {});
  }

  getIdea(batchId: string, index: number) {
    return this.http.get<Idea>(`${API_BASE_URL}/ideas/${batchId}/${index}`);
  }

  updateResearchTime(researchTime: string) {
    return this.http.put<ResearchSettings>(`${API_BASE_URL}/ideas/settings`, { researchTime });
  }
}
