export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const num = (fd: FormData, k: string, dflt = 0) => {
  const raw = str(fd, k);
  const v = Number(raw);
  return raw !== "" && Number.isFinite(v) ? v : dflt;
};
export const flag = (fd: FormData, k: string) => (fd.get(k) ? 1 : 0);
export const optId = (fd: FormData, k: string) => {
  const v = Number(str(fd, k));
  return Number.isInteger(v) && v > 0 ? v : null;
};
export const ids = (fd: FormData, k: string) =>
  fd
    .getAll(k)
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
