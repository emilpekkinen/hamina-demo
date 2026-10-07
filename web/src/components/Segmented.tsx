"use client";

import { cx } from "./ui";

/** Hamina pricing-page segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-gray-100 bg-gray-100 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors duration-150",
              active
                ? "border-gray-100 bg-white text-gray-900 shadow-sm"
                : "border-transparent text-gray-500 hover:text-gray-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
