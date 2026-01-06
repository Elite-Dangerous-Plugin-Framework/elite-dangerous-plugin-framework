import type { PluginSettingsContextV1Alpha } from "@elite-dangerous-plugin-framework/core";
import { useEffect, useState } from "react";

import * as z from "zod/mini";
import { LanguageIcon } from "./icones/settingsLocale";

const availableForShips = ["Coriolis", "EDSY"] as const;
const availableForStations = ["Inara", "Spansh"] as const;
const availableForSystems = ["Inara", "Spansh"] as const;

const locales = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "ja",
  "ko",
  "zh",
  "ru",
] as const;

export const OpenerPreferencesZod = z.object({
  ships: z.enum(availableForShips),
  systems: z.enum(availableForSystems),
  stations: z.enum(availableForStations),
});
export const LocalePreferencesZod = z.enum(locales);
export const EddnPreferencesZod = z.object({
  enabled: z.boolean(),
});

export function SettingsRoot({ ctx }: { ctx: PluginSettingsContextV1Alpha }) {
  const [prefs, setPrefs] = useState<z.infer<typeof OpenerPreferencesZod>>();
  const [eddnPrefs, setEddnPrefs] =
    useState<z.infer<typeof EddnPreferencesZod>>();
  const [locale, setLocale] = useState<z.infer<typeof LocalePreferencesZod>>();

  async function commitLocale(
    newLocale?: z.infer<typeof LocalePreferencesZod>,
  ) {
    if (newLocale) await ctx.Settings.writeSetting("core.Locale", newLocale);

    const response = await ctx.Settings.getSetting("core.Locale");
    const parsed = LocalePreferencesZod.safeParse(response);
    console.log({ parsedLocale: parsed });
    if (parsed.success) {
      setLocale(parsed.data);
    } else {
      setLocale("en");
    }
  }

  async function commitEddn(newEddn?: z.infer<typeof EddnPreferencesZod>) {
    if (newEddn) await ctx.Settings.writeSetting("core.eddnPrefs", newEddn);

    const response = await ctx.Settings.getSetting("core.eddnPrefs");
    const parsed = EddnPreferencesZod.safeParse(response);
    if (parsed.success) {
      setEddnPrefs(parsed.data);
    } else {
      setEddnPrefs({
        enabled: true,
      });
    }
  }

  async function commitPrefs(newPrefs?: z.infer<typeof OpenerPreferencesZod>) {
    if (newPrefs) await ctx.Settings.writeSetting("core.prefs", newPrefs);

    const response = await ctx.Settings.getSetting("core.prefs");
    const parsed = OpenerPreferencesZod.safeParse(response);
    console.log({ parsedPrefs: parsed });
    if (parsed.success) {
      setPrefs(parsed.data);
    } else {
      setPrefs({
        ships: "EDSY",
        systems: "Inara",
        stations: "Inara",
      });
    }
  }

  useEffect(() => {
    commitLocale();
    commitPrefs();
    commitEddn();
  }, []);

  if (!prefs || !locale) {
    return <div>Loading…</div>;
  }

  return (
    <>
      <link rel="stylesheet" href={ctx.assetsBase + "style.css"} />
      <div className="flex flex-col gap-4">
        <section id="shared">
          <h2 className="text-xl">Shared Settings</h2>
          <p className=" text-sm opacity-60">
            These are settings that generally affect all plugins
          </p>
          <div className="flex flex-row gap-2 flex-wrap">
            <LocaleDropDownPill
              selected={locale}
              newSelected={function (item): void {
                commitLocale(item as any);
              }}
            />
          </div>
        </section>
        <section id="prefs">
          <h2 className="text-xl">Preferred Tooling</h2>
          <p className=" text-sm opacity-60">
            Pick your preferred tool for each category below
          </p>
          <div className="flex flex-row gap-2 flex-wrap">
            <SimpleDropDownPill
              label="Systems"
              dropdown={availableForSystems}
              selected={prefs.systems}
              newSelected={(el) => commitPrefs({ ...prefs, systems: el })}
            />
            <SimpleDropDownPill
              label="Stations"
              dropdown={availableForStations}
              selected={prefs.stations}
              newSelected={(el) => commitPrefs({ ...prefs, stations: el })}
            />
            <SimpleDropDownPill
              label="Ships"
              dropdown={availableForShips}
              selected={prefs.ships}
              newSelected={(el) => commitPrefs({ ...prefs, ships: el })}
            />
          </div>
        </section>
        {eddnPrefs && (
          <section id="eddn">
            <h2 className="text-xl">EDDN Integration</h2>
            <p className=" text-sm opacity-60">
              Fine-tune which updates are sent to the Elite: Dangerous Data
              Network
            </p>
            <div className="flex items-center me-4">
              <input
                checked={eddnPrefs.enabled}
                id="eddn-enabled-checkbox"
                type="checkbox"
                value=""
                onChange={() => {
                  commitEddn({
                    ...eddnPrefs,
                    enabled: !eddnPrefs.enabled,
                  });
                }}
                className="w-6 h-6 border-default-medium rounded-xs focus:ring-2"
              />
              <label
                htmlFor="eddn-enabled-checkbox"
                className="select-none ms-2 text-sm font-medium text-heading"
              >
                Enable EDDN{" "}
                <span className="text-sm opacity-60 italic">
                  Uncheck this to stop sending Events to EDDN entirely.
                </span>
              </label>
            </div>
            <div className="my-2 bg-orange-200/20 border rounded-lg p-1 border-orange-300">
              This is still under construction
            </div>
          </section>
        )}
      </div>
    </>
  );
}

interface SimpleDropDownPillProps<T extends readonly string[]> {
  label: string;
  selected: T[number];
  dropdown: T;
  newSelected: (item: T[number]) => void;
}
function SimpleDropDownPill<T extends readonly string[]>({
  label,
  selected,
  dropdown,
  newSelected,
}: SimpleDropDownPillProps<T>) {
  const [dropdownData, setDropdownData] = useState<{
    x: number;
    y: number;
  } | null>(null);

  return (
    <>
      <div
        onClick={(ev) => {
          if (dropdownData) {
            setDropdownData(null);
          } else {
            setDropdownData({ x: ev.clientX, y: ev.clientY });
          }
        }}
        className=" flex flex-row cursor-pointer mt-3"
      >
        <span className=" py-1 px-2 bg-slate-800 rounded-l-lg">{label}</span>
        <span className=" py-1 px-2 bg-orange-600 rounded-r-lg">
          {selected}
        </span>
      </div>
      {dropdownData && (
        <SimpleDropDownMenu
          dropdown={dropdown}
          newSelected={(e) => {
            setDropdownData(null);
            if (e) {
              newSelected(e);
            }
          }}
          x={dropdownData.x}
          y={dropdownData.y}
        />
      )}
    </>
  );
}

interface LocaleDropDownPillProps {
  selected: z.infer<typeof LocalePreferencesZod>;
  newSelected: (item: z.infer<typeof LocalePreferencesZod>[number]) => void;
}
function LocaleDropDownPill({
  selected,
  newSelected,
}: LocaleDropDownPillProps) {
  const [dropdownData, setDropdownData] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const localeData: Record<z.infer<typeof LocalePreferencesZod>, string> = {
    en: "English",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    pt: "Português",
    it: "Italiano",
    ja: "日本語",
    ko: "한국어",
    zh: "中文",
    ru: "Русский",
  };
  const localeDataTuple = Object.entries(localeData);

  return (
    <>
      <div
        onClick={(ev) => {
          if (dropdownData) {
            setDropdownData(null);
          } else {
            setDropdownData({ x: ev.clientX, y: ev.clientY });
          }
        }}
        className=" flex flex-row cursor-pointer mt-3"
      >
        <span className=" py-1 inline-flex flex-row gap-2 items-center justify-center px-2 bg-slate-800 rounded-l-lg">
          <LanguageIcon className="w-6 h-6 text-white" />
          Language
        </span>
        <span className=" py-1 px-2 bg-orange-600 flex-row items-center justify-center rounded-r-lg">
          <span>{localeData[selected]}</span>
        </span>
      </div>
      {dropdownData && (
        <KeyValueDropDownMenu
          dropdown={localeDataTuple}
          newSelected={(e) => {
            setDropdownData(null);
            if (e) {
              newSelected(e as any);
            }
          }}
          x={dropdownData.x}
          y={dropdownData.y}
        />
      )}
    </>
  );
}

interface SimpleDropDownMenuProps<T extends readonly string[]> {
  dropdown: T;
  // item is an item was clicked, undefined if none was selected or moved out of range, telling the parent to close the context menu
  newSelected: (item: T[number] | undefined) => void;
  x: number;
  y: number;
}
function SimpleDropDownMenu<T extends readonly string[]>({
  dropdown,
  newSelected,
  x,
  y,
}: SimpleDropDownMenuProps<T>) {
  return (
    <div
      className="fixed z-50"
      onMouseLeave={() => newSelected(undefined)}
      style={{ top: y - 8, left: x - 8 }}
    >
      <div className="p-2">
        <div className="bg-neutral-900 border border-neutral-700 rounded shadow-md">
          {dropdown.map((e) => (
            <div
              key={e}
              className="px-3 py-1 hover:bg-neutral-700 cursor-pointer"
              onClick={() => {
                newSelected(e);
              }}
            >
              {e}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface KeyValueDropDownMenuProps<T extends readonly [string, string][]> {
  dropdown: T;
  // item is an item was clicked, undefined if none was selected or moved out of range, telling the parent to close the context menu
  newSelected: (item: T[0][number] | undefined) => void;
  x: number;
  y: number;
}
function KeyValueDropDownMenu<T extends readonly [string, string][]>({
  dropdown,
  newSelected,
  x,
  y,
}: KeyValueDropDownMenuProps<T>) {
  return (
    <div
      className="fixed z-50"
      onMouseLeave={() => newSelected(undefined)}
      style={{ top: y - 8, left: x - 8 }}
    >
      <div className="p-2">
        <div className="bg-neutral-900 border border-neutral-700 rounded shadow-md">
          {dropdown.map((e) => (
            <div
              key={e[0]}
              className="px-3 py-1 hover:bg-neutral-700 cursor-pointer"
              onClick={() => {
                newSelected(e[0]);
              }}
            >
              {e[1]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
