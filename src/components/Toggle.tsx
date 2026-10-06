'use client';

type ToggleProps = {
  /** What the pair chooses between, for screen readers: "Listen dry or in your room". */
  label: string;
  options: [string, string];
  /** False selects the first option, true the second. */
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

/** A two-option switch: a labelled group of two pressed/unpressed buttons, each at least 44 px tall. */
export function Toggle({ label, options, value, onChange, disabled = false }: ToggleProps) {
  return (
    <div role="group" aria-label={label} className={`inline-flex w-fit rounded-lg border border-neutral-700 p-0.5 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((text, i) => {
        const selected = value === (i === 1);
        return (
          <button
            key={text}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(i === 1)}
            className={`min-h-11 rounded-md px-3 text-sm ${selected ? 'bg-white font-semibold text-neutral-950' : 'text-neutral-300'}`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
