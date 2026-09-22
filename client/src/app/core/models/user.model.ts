import { Theme } from './theme.model';

export interface User {
  _id: string;
  linkedInId: string;
  name: string;
  email?: string;
  profilePictureUrl?: string;
  theme: Theme;
}
