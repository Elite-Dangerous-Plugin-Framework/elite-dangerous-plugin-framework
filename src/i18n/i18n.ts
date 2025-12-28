import mainEn from "./en/main.json"
import mainDe from "./de/main.json"
import settingsEn from "./en/settings.json"
import settingsDe from "./de/settings.json"

export const defaultNs = "main"
export const resources = {
  en: {
    main: mainEn,
    settings: settingsEn
  },
  de: {
    settings: settingsDe,
    main: mainDe
  }
} as const;

console.log({ resources })
