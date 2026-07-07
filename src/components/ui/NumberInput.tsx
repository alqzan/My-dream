"use client";
import { forwardRef } from "react";
import { toLatinDigits } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> & {
  // Receives the already-normalized Latin-digit string.
  onChange: (value: string) => void;
};

// A numeric text field that accepts Arabic-Indic (٠-٩) or Latin digits and
// normalizes to Latin *instantly* as you type (the value is controlled, so the
// field re-renders showing Latin). `inputMode="numeric"` keeps it to whole
// digits; anything else allows a single decimal point.
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { onChange, inputMode = "decimal", ...rest },
  ref
) {
  const decimal = inputMode !== "numeric";
  function handle(raw: string) {
    let s = toLatinDigits(raw);
    if (decimal) {
      s = s.replace(/[^0-9.]/g, "");
      const dot = s.indexOf(".");
      if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
    } else {
      s = s.replace(/[^0-9]/g, "");
    }
    onChange(s);
  }
  return (
    <input
      ref={ref}
      type="text"
      inputMode={inputMode}
      onChange={(e) => handle(e.target.value)}
      {...rest}
    />
  );
});
