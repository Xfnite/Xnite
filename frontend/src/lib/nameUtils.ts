/**
 * Utility for parsing and splitting full names into first name and last name.
 * 
 * Correctly handles:
 * - Second names / compound given names (e.g. "Rey John Delacruz" -> First: "Rey John", Last: "Delacruz")
 * - Compound surnames with prefixes like "Dela Cruz", "De La Cruz", "Delos Santos", "San Jose", etc.
 * - Name suffixes (e.g. "Jr.", "Sr.", "III")
 */

const TWO_WORD_SURNAME_PREFIXES = new Set([
  "de la",
  "de los",
  "de las",
  "van der",
  "van de",
  "van den",
  "von der",
]);

const ONE_WORD_SURNAME_PREFIXES = new Set([
  "dela",
  "delos",
  "delas",
  "de",
  "del",
  "san",
  "santa",
  "santo",
  "van",
  "von",
  "da",
  "das",
  "do",
  "dos",
  "du",
  "al",
  "el",
  "st",
  "st.",
]);

const NAME_SUFFIXES = new Set([
  "jr",
  "jr.",
  "sr",
  "sr.",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
]);

export interface SplitName {
  firstName: string;
  lastName: string;
}

export function splitFullName(fullName: string | null | undefined): SplitName {
  const trimmed = (fullName ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const rawParts = trimmed.split(" ");
  if (rawParts.length === 1) {
    return { firstName: rawParts[0], lastName: "" };
  }

  // Check if the last word is a suffix (e.g., Jr., Sr., III)
  let suffix = "";
  let parts = [...rawParts];
  if (parts.length > 2) {
    const lastWord = parts[parts.length - 1].toLowerCase().replace(/,/g, "");
    if (NAME_SUFFIXES.has(lastWord)) {
      suffix = parts[parts.length - 1];
      parts = parts.slice(0, -1);
    }
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: suffix,
    };
  }

  if (parts.length === 2) {
    return {
      firstName: parts[0],
      lastName: suffix ? `${parts[1]} ${suffix}` : parts[1],
    };
  }

  // For 3 or more parts, determine the boundary between first name and last name.
  // Check for 2-word compound surname prefix (e.g., "De La", "De Los", "Van Der")
  const twoWordPrefixIndex = parts.length - 3;
  if (twoWordPrefixIndex >= 1) {
    const twoWordCandidate = `${parts[twoWordPrefixIndex]} ${parts[twoWordPrefixIndex + 1]}`.toLowerCase();
    if (TWO_WORD_SURNAME_PREFIXES.has(twoWordCandidate)) {
      const firstName = parts.slice(0, twoWordPrefixIndex).join(" ");
      const lastName = parts.slice(twoWordPrefixIndex).join(" ");
      return {
        firstName,
        lastName: suffix ? `${lastName} ${suffix}` : lastName,
      };
    }
  }

  // Check for 1-word compound surname prefix (e.g., "Dela", "Delos", "Del", "San")
  const oneWordPrefixIndex = parts.length - 2;
  if (oneWordPrefixIndex >= 1) {
    const oneWordCandidate = parts[oneWordPrefixIndex].toLowerCase();
    if (ONE_WORD_SURNAME_PREFIXES.has(oneWordCandidate)) {
      const firstName = parts.slice(0, oneWordPrefixIndex).join(" ");
      const lastName = parts.slice(oneWordPrefixIndex).join(" ");
      return {
        firstName,
        lastName: suffix ? `${lastName} ${suffix}` : lastName,
      };
    }
  }

  // Default: the last word is the last name, and all preceding words form the first name.
  // This correctly preserves compound first names / second names (e.g. "Rey John" Delacruz).
  const firstName = parts.slice(0, -1).join(" ");
  const baseLastName = parts[parts.length - 1];
  const lastName = suffix ? `${baseLastName} ${suffix}` : baseLastName;

  return { firstName, lastName };
}

