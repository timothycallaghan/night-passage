const choices = ['auto', 'low', 'high'];

// Explicit URLs and existing session choices override Automatic.
export function resolveQuality(preset, storage) {
  if (choices.includes(preset)) return preset;
  try {
    const saved = JSON.parse(storage.getItem('np-quality-choice') || 'null');
    if (saved?.explicit === true && choices.includes(saved.value)) return saved.value;
    const legacy = storage.getItem('np-quality');
    if (['low', 'high'].includes(legacy)) return legacy;
  } catch {}
  return 'auto';
}

export function saveQuality(value, storage) {
  if (!choices.includes(value)) return;
  try { storage.setItem('np-quality-choice', JSON.stringify({explicit:true, value})); } catch {}
}

export const AUTO_RENDER_LEVELS = Object.freeze([
  Object.freeze({scale:1, reflectionInterval:1}),
  Object.freeze({scale:.85, reflectionInterval:2}),
  Object.freeze({scale:.70, reflectionInterval:3}),
]);

export function createFrameBudget() {
  let level = 0, warmUntil = 0, windowStart = 0, frames = 0, missed = 0;
  function reset(now) {
    warmUntil = now + 1000;
    windowStart = warmUntil;
    frames = missed = 0;
  }
  return {
    reset,
    sample(now, interval) {
      if (now < warmUntil || interval <= 0 || level === AUTO_RENDER_LEVELS.length - 1) return false;
      frames++;
      if (interval > 24) missed++;
      if (now - windowStart < 1200) return false;
      // Sustained misses of a 60 Hz frame budget, after startup and resize settle.
      if (frames >= 4 && missed / frames >= .35) {
        level++;
        reset(now);
        return true;
      }
      windowStart = now;
      frames = missed = 0;
      return false;
    },
    level: () => level,
  };
}
