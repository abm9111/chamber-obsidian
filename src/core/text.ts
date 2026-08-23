/**
 * UTF-8 length and display clipping. JS `string.length` is UTF-16 code units,
 * which is the wrong measure for a byte cap and can split a surrogate pair
 * when used as a slice boundary.
 */

export function utf8ByteLength(raw: string): number {
  let n = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c <= 0x7f) n += 1;
    else if (c <= 0x7ff) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = raw.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

export function exceedsByteCap(raw: string, maxBytes: number): boolean {
  if (raw.length > maxBytes) return true;
  return utf8ByteLength(raw) > maxBytes;
}

export function excerpt(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  let end = Math.max(0, max - 1);
  const prev = end > 0 ? s.charCodeAt(end - 1) : 0;
  if (prev >= 0xd800 && prev <= 0xdbff) end -= 1;
  return s.slice(0, end) + "…";
}
