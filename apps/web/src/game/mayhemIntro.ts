// The two-page Market Mayhem intro shows once per device (GAME_RULES §12, v2 spec §5).

const SEEN_KEY = 'mnm.mayhemIntroSeen';

export function hasSeenMayhemIntro(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // no storage: don't nag every time
  }
}

export function markMayhemIntroSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}
