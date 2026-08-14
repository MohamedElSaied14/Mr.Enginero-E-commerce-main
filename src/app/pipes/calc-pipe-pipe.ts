import { Pipe, PipeTransform } from '@angular/core';

/** `Intl.NumberFormat` instances are expensive to build — one per format, reused. */
const FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatter(decimals: number): Intl.NumberFormat {
  const key = String(decimals);
  let f = FORMATTERS.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-EG', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    FORMATTERS.set(key, f);
  }
  return f;
}

/** `{{ 39380 | calc }}` → `EGP 39,380`. Pass `2` for cash-register precision. */
@Pipe({ name: 'calc', standalone: true, pure: true })
export class CalcPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals: number = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return 'EGP —';
    return `EGP ${formatter(decimals).format(value)}`;
  }
}
