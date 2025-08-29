import { useEffect, useRef, useState } from "react";
import { PluginTypeIcon } from "../icons/pluginType";
import { PluginState } from "../types/PluginState";
import { invoke } from "@tauri-apps/api/core";
import z from "zod";
import React from "react";

export interface SettingsPluginPaneProps {
  plugin: PluginState & { id: string };
}

function getName(plugin: PluginState) {
  if (plugin.manifest.type === "v1alpha") {
    return plugin.manifest.name;
  }
}

function getDescription(plugin: PluginState) {
  if (plugin.manifest.type === "v1alpha") {
    return plugin.manifest.description;
  }
}

function getDisplayVersion(plugin: PluginState) {
  if (plugin.manifest.type === "v1alpha") {
    return plugin.manifest.version;
  }
  return undefined;
}

type SettingsComponentLoadState =
  | { type: "Loading" }
  | {
      type: "PluginNotFound";
    }
  | {
      type: "FailedAwaitImport";
    }
  | {
      type: "NoSettingsExported";
    }
  | {
      type: "SettingsExportNotHTMLElement";
    }
  | {
      type: "Registered";
      registeredAs: string;
    };

export function SettingsPluginPane({ plugin }: SettingsPluginPaneProps) {
  const pluginVersion = getDisplayVersion(plugin);
  const description = getDescription(plugin);
  const settingsWebComponentRef = useRef<HTMLElement | null>(null);
  const [settingsLoadState, setSettingsLoadState] =
    useState<SettingsComponentLoadState>({ type: "Loading" });

  useEffect(() => {
    // We (try to) register the ES-Module for this Plugin and try to find a Settings Component. If found, we register the Web Component. You cannot un-register web components. This is also why the hash is in here.
    (async () => {
      const result = z
        .object({
          success: z.literal(false),
          reason: z.enum(["PLUGIN_NOT_FOUND"]),
        })
        .or(
          z.object({
            success: z.literal(true),
            import: z.string(),
            hash: z.string(),
          })
        )
        .parse(
          await invoke("get_import_path_for_plugin", { pluginId: plugin.id })
        );

      let module: any;
      if (result.success) {
        try {
          module = await import(/* @vite-ignore */ result.import);
        } catch (err) {
          console.error(err);
          setSettingsLoadState({ type: "FailedAwaitImport" });
          return;
        }
      } else if (result.reason === "PLUGIN_NOT_FOUND") {
        setSettingsLoadState({ type: "PluginNotFound" });
        return;
      }
      // if here, module exists
      if (!module.Settings) {
        setSettingsLoadState({ type: "NoSettingsExported" });
        return;
      }
      // This essentially checks if the export is a class definition that inherits HTMLElement

      console.log(typeof module.Settings);
      if (
        typeof module.Settings !== "function" ||
        !Object.prototype.isPrototypeOf.call(
          HTMLElement.prototype,
          module.Settings.prototype
        )
      ) {
        setSettingsLoadState({ type: "SettingsExportNotHTMLElement" });
        return;
      }

      let customElementID = `${plugin.id}-${
        result.success ? result.hash : "no-hash"
      }`;
      if (!customElements.get(customElementID)) {
        customElements.define(customElementID, module.Settings);
      }
      setSettingsLoadState({
        type: "Registered",
        registeredAs: customElementID,
      });
    })();
  }, [plugin.id]);

  return (
    <div className="flex flex-col p-2">
      <span className=" inline-flex gap-1 items-center">
        <PluginTypeIcon type={plugin.source} />{" "}
        <span className=" text-xs text-gray-500">{plugin.source} · </span>
        <span className="text-xs text-gray-500">
          {pluginVersion ?? "version info missing"}
        </span>
      </span>
      <h2>
        <span>{getName(plugin)}</span> <span></span>
      </h2>
      <section id="description">
        {typeof description !== "string" ? (
          <p className=" text-sm italic text-gray-400">
            no description provided…
          </p>
        ) : (
          <p className="text-sm text-gray-200">{description}</p>
        )}
      </section>
      <hr className=" text-neutral-600 my-2" />
      <section className="" id="plugin_settings">
        {settingsLoadState.type === "Loading" && <p>Loading…</p>}
        {settingsLoadState.type === "FailedAwaitImport" && (
          <p>Failed to import plugin. This is a bug and should be reported.</p>
        )}
        {settingsLoadState.type === "NoSettingsExported" && (
          <p>This plugin does not provide any settings.</p>
        )}
        {settingsLoadState.type === "PluginNotFound" && (
          <p>
            The plugin could not be found internally. This is a bug and should
            be reported.
          </p>
        )}
        {settingsLoadState.type === "SettingsExportNotHTMLElement" && (
          <p>
            The plugin does not correctly define the settings. Please contact
            the plugin developer.
          </p>
        )}
        {settingsLoadState.type === "Registered" &&
          React.createElement(settingsLoadState.registeredAs, {
            ref: settingsWebComponentRef,
          })}
      </section>
    </div>
  );
}
