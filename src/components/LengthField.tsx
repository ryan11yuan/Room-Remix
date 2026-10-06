'use client';

import { useState } from 'react';
import { formatLength, parseLength, type Unit } from '@/lib/room/units';

/** The look of the app's text fields and selects: at least 44 px tall. */
export const inputClass = 'min-h-11 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5';

type LengthFieldProps = { label: string; metres: number; unit: Unit; onChange: (metres: number) => void };

/**
 * A length typed in the visitor's unit and kept in metres. While the field has focus it shows exactly what was typed,
 * so "12.55" doesn't jump to "12.6" mid-typing; the room only changes when the text does.
 */
export function LengthField({ label, metres, unit, onChange }: LengthFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Number.isFinite(metres) ? formatLength(metres, unit) : '';
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-400">
        {label} ({unit})
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? shown}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(parseLength(e.target.value, unit) ?? Number.NaN); // NaN: the form shows the size or position error
        }}
        onBlur={() => setDraft(null)}
        className={`${inputClass} w-24`}
      />
    </label>
  );
}
