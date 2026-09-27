export type ActivityType =
  | 'post_published'
  | 'post_scheduled'
  | 'post_failed'
  | 'post_cancelled'
  | 'post_rescheduled'
  | 'research_done'
  | 'research_failed'
  | 'research_time_changed'
  | 'theme_changed';

export interface Activity {
  _id: string;
  type: ActivityType;
  message: string;
  postId?: string;
  createdAt: string;
}

/** GET /api/dashboard - counts cover posts created in the app, never generations. */
export interface DashboardSummary {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  last7Days: number;
  last30Days: number;
  activity: Activity[];
}
