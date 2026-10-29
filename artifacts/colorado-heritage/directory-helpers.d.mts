type DirectoryPerson = { slug: string; administrative?: boolean };
export function isAdministrative(person: DirectoryPerson): boolean;
export function staffProfilePath(person: DirectoryPerson): string;
export function portraitPosition(person: { photoPositionX?: number; photoPositionY?: number }): string;
export function administrativeStaff<T extends DirectoryPerson>(staff: T[]): T[];
export function isFilenameCaption(value: string): boolean;
export function cleanFilenameCaptions(markdown: string): string;
