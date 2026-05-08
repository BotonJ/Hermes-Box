import { useState, useEffect } from "preact/hooks";
import { getLocale, onLocaleChange, type Locale } from "./i18n";

/** Returns the current locale and re-renders when it changes. */
export function useLocale(): Locale {
  const [locale, setLocaleState] = useState(getLocale());

  useEffect(() => {
    return onLocaleChange(() => setLocaleState(getLocale()));
  }, []);

  return locale;
}
