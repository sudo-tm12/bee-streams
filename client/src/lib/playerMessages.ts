/**
 * Embedded players report playback with window.postMessage, in a few different shapes:
 *   { type: 'timeupdate', currentTime, duration }
 *   { type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime, duration } }
 *   '{"event":"time","progress":12.3,"duration":5400}'  (JSON string)
 * This normalises them. Only numbers are read — nothing from the message is ever rendered.
 */
export interface PlayerMessage {
  event: string;
  time: number | null;
  duration: number | null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function parsePlayerMessage(raw: unknown): PlayerMessage | null {
  let d: unknown = raw;
  if (typeof d === 'string') {
    if (d.length > 4000 || !d.startsWith('{')) return null;
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  if (!d || typeof d !== 'object') return null;
  const outer = d as Record<string, unknown>;
  const inner = outer.data && typeof outer.data === 'object' ? (outer.data as Record<string, unknown>) : null;
  const src =
    inner && ('currentTime' in inner || 'event' in inner || 'progress' in inner || 'duration' in inner) ? inner : outer;

  const event = String(src.event ?? src.type ?? outer.event ?? outer.type ?? '').toLowerCase().slice(0, 40);
  const time = num(src.currentTime) ?? num(src.progress) ?? num(src.time);
  const duration = num(src.duration) ?? num(src.durationSeconds);
  if (time == null && duration == null && !event) return null;
  if (time != null && (time < 0 || time > 86_400)) return null;
  return { event, time, duration: duration != null && duration > 0 && duration < 86_400 ? duration : null };
}

export function isEndEvent(msg: PlayerMessage) {
  return /ended|complete|finish/.test(msg.event);
}
