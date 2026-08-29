/* Creative Commons licences need a link to the licence itself, not just its
   name, wherever the photo appears. The photo credit maps only record the
   short name, so the deed URL is derived here rather than repeated in every
   entry. */

const DEEDS = {
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY 2.5': 'https://creativecommons.org/licenses/by/2.5/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC BY-SA 2.5': 'https://creativecommons.org/licenses/by-sa/2.5/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

/** Deed URL for a licence short name, or '' when there is nothing to link. */
export function licenceUrl(name) {
  return DEEDS[String(name || '').trim()] || '';
}
