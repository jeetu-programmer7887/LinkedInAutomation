import mongoose from 'mongoose';

// Defaults match the client's "Kiln" preset (client/src/app/core/models/theme.model.ts).
const themeSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Kiln' },
    background: { type: String, default: '#FBF7F2' },
    text: { type: String, default: '#2B2119' },
    hover: { type: String, default: '#A65A2E' },
  },
  { _id: false }
);

// Single document of user-editable app settings.
const appSettingsSchema = new mongoose.Schema(
  {
    // The app's colors, set from Settings. The browser also caches it in
    // localStorage so it applies before this loads. No default on purpose:
    // "never saved" must stay distinguishable, so a browser holding a theme
    // from before this setting existed uploads it instead of being reset.
    theme: { type: themeSchema },
    // "HH:mm", 24h, in config researchTimezone. Set from the Schedule page.
    researchTime: { type: String, default: '11:00' },
    // Date ("YYYY-MM-DD", research timezone) of the last scheduled research
    // run. The tick claims a day by flipping this atomically, so the daily
    // run happens once even if two ticks (or instances) race.
    lastScheduledRunDate: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model('AppSettings', appSettingsSchema);
