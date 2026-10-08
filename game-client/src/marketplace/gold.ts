/**
 * Gold as the page prints it: digit-grouped and whole (FS-8EGFA "Very large gold values").
 *
 * Prices are int64 on the wire. Grouping works on the decimal string, so no floating-point
 * arithmetic ever touches an amount, and a bigint passes through exactly.
 */
export function formatGold(gold: number | bigint): string {
  const digits =
    typeof gold === "bigint" ? gold.toString() : Math.trunc(gold).toFixed(0);
  const sign = digits.startsWith("-") ? "-" : "";
  const whole = sign ? digits.slice(1) : digits;
  return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
