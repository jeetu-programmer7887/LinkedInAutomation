export interface Theme {
  name: string;
  background: string;
  text: string;
  hover: string;
}

// The 6 shipping presets, all pre-checked for WCAG AA contrast
// (background/text >= 4.5:1, hover/background >= 3:1).
export const THEME_PRESETS: Theme[] = [
  { name: 'Kiln', background: '#FBF7F2', text: '#2B2119', hover: '#A65A2E' },
  { name: 'Paper', background: '#F6F7F5', text: '#1C2024', hover: '#4E5B57' },
  { name: 'Harbor', background: '#F4F6FA', text: '#141C2B', hover: '#0F6E72' },
  { name: 'Press', background: '#FFFFFF', text: '#0B0B0C', hover: '#A31545' },
  { name: 'Midnight', background: '#12161C', text: '#E6EAF0', hover: '#5A8FCB' },
  { name: 'Conifer', background: '#101A16', text: '#E4EDE7', hover: '#4FA07A' },
];

export const DEFAULT_THEME_NAME = 'Kiln';

export const DEFAULT_THEME: Theme =
  THEME_PRESETS.find((t) => t.name === DEFAULT_THEME_NAME) ?? THEME_PRESETS[0];
