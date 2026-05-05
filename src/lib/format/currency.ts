export function filsToAed(fils: number): string {
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(fils);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  return `${sign}AED ${major.toLocaleString("en-AE")}.${minor.toString().padStart(2, "0")}`;
}

export function aedInputToFils(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fils = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isFinite(fils) ? fils : null;
}
