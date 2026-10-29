// Shared by the browser and server renderer so directory links stay consistent.
const originalAdministrators = new Set(["mrs-mary-brown", "mrs-amy-kearns", "signe-clausen"]);
const administrativeOrder = ["mrs-mary-brown", "mrs-amy-kearns", "signe-clausen"];

export function isAdministrative(person) {
  return typeof person.administrative === "boolean"
    ? person.administrative
    : originalAdministrators.has(person.slug);
}

export function staffProfilePath(person) {
  return `/about/our-people/${person.slug}`;
}

export function portraitPosition(person) {
  const percent = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
  return `${percent(person.photoPositionX, 50)}% ${percent(person.photoPositionY, 0)}%`;
}

export function administrativeStaff(staff) {
  return staff.map((person, index) => ({ person, index }))
    .filter(({ person }) => isAdministrative(person))
    .sort((a, b) => {
      const first = administrativeOrder.indexOf(a.person.slug);
      const second = administrativeOrder.indexOf(b.person.slug);
      return (first < 0 ? administrativeOrder.length : first) -
        (second < 0 ? administrativeOrder.length : second) || a.index - b.index;
    })
    .map(({ person }) => person);
}

export function isFilenameCaption(value) {
  return /^[^/\\\n]+\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)$/i.test(
    (value || "").trim().replace(/^[*_`]+|[*_`]+$/g, ""),
  );
}

export function cleanFilenameCaptions(markdown) {
  return (markdown || "").split("\n").filter(line => !isFilenameCaption(line))
    .join("\n").replace(/<figcaption[^>]*>([^<]*)<\/figcaption>/gi,
      (match, text) => isFilenameCaption(text) ? "" : match);
}
