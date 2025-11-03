// MARK: - Onboarding Schedule Helpers
// Provides consistent schedule presets for onboarding flows

export interface ScheduleOption {
  digestHourUTC?: number;
  cooldownHours: number;
  dmEnabled: boolean;
  label: string;
}

const scheduleOptions: Record<string, ScheduleOption> = {
  'daily-morning': { digestHourUTC: 14, cooldownHours: 24, dmEnabled: true, label: 'daily morning digest at 09:00 EST' },
  'daily-evening': { digestHourUTC: 1, cooldownHours: 24, dmEnabled: true, label: 'daily evening digest at 20:00 EST' },
  'twice-weekly': { digestHourUTC: 23, cooldownHours: 84, dmEnabled: true, label: 'twice-weekly digest (Mon & Thu at 18:00 EST)' },
  weekly: { digestHourUTC: 20, cooldownHours: 168, dmEnabled: true, label: 'weekly recap on Monday at 15:00 EST' },
  manual: { cooldownHours: 168, dmEnabled: false, label: 'manual digests only (no automatic DMs)' },
};

export function resolveScheduleOption(choice: string): ScheduleOption {
  return scheduleOptions[choice] ?? scheduleOptions.weekly;
}

export function buildScheduleConfirmation(choice: string, dmEnabledOverride?: boolean): string {
  const option = resolveScheduleOption(choice);
  const dmEnabled = dmEnabledOverride ?? option.dmEnabled;
  const base = `✅ All set! We saved your preference for ${option.label}.`;

  if (!dmEnabled) {
    return `${base}\n\nYou can run \`/digest-now\` whenever you want a recap.`;
  }

  return `${base}\n\nAdjust anytime with \`/onboarding start\` or manage cadence via \`/subscribe\`.`;
}

export const onboardingScheduleOptions = scheduleOptions;
