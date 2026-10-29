import replacements from "../data/portrait-replacements.json";

/** Older databases may still reference permanently square-cropped imports.
 * Resolve only those exact legacy files; never replace a staff-uploaded photo.
 * This is read-time compatibility, not a production database migration.
 */
export function restoreImportedPortraits(content: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(content.staff)) return content;
  return {
    ...content,
    staff: content.staff.map(person => {
      const replacement = replacements.find(entry => entry.slug === person.slug && entry.oldPhoto === person.photo);
      return replacement ? {
        ...person,
        photo: replacement.photo,
        photoPositionX: person.photoPositionX ?? 50,
        photoPositionY: person.photoPositionY ?? replacement.photoPositionY,
      } : person;
    }),
  };
}
