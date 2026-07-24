export const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export const fromISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const fmt = (iso) =>
  fromISO(iso).toLocaleDateString("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
