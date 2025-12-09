import { useEffect, useRef, useState } from "react";
import {
  PluginStartStopButton,
  PluginTypeIcon,
  ZondiconsFolder,
} from "../icons/pluginType";
import { PluginState } from "../types/PluginState";
import React from "react";
import { StatusIndicator } from "./Settings";
import { CommandWrapper } from "../commands/commandWrapper";
import { SettingsComponentLoadState, startAndLoadSettings } from "./startAndLoadSettings";
import { SettingsCell } from "./SettingsCell";

export interface SettingsPluginPaneProps {
  plugin: PluginState;
  commands: CommandWrapper
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



export function SettingsPluginPane({
  plugin,
  commands
}: SettingsPluginPaneProps) {
  const pluginVersion = getDisplayVersion(plugin);
  const description = getDescription(plugin);
  const [settingsLoadState, setSettingsLoadState] =
    useState<SettingsComponentLoadState>({ type: "Loading" });


  useEffect(() => {
    // We (try to) register the ES-Module for this Plugin and try to find a Settings Component. If found, we register the Web Component. You cannot un-register web components. This is also why the hash is in here.
    startAndLoadSettings(plugin.id, commands).then(setSettingsLoadState)
  }, [plugin.id]);

  const currentStateType = plugin.current_state.type;
  return (
    <div className="flex flex-col p-2">
      <section
        id="header"
        className="flex flex-col md:flex-row justify-between"
      >
        <div className="flex flex-col">
          <span className="inline-flex gap-1 items-center">
            <PluginTypeIcon type={plugin.source} />{" "}
            <span className=" text-xs text-gray-500">{plugin.source} · </span>
            <span className="text-xs text-gray-500">
              {pluginVersion ?? "version info missing"}
            </span>
          </span>
          <h2 className=" inline-flex gap-2 items-baseline">
            <StatusIndicator state={plugin.current_state.type} />
            <span title={plugin.id}>{getName(plugin)}</span> <span></span>
          </h2>
        </div>
        <section id="actions" className="inline-flex rounded-md gap-1">
          {currentStateType == "FailedToStart" && (
            <button
              id="plugin-abort-start"
              className="rounded-lg p-2 bg-white/10 hover:bg-white/20 cursor-pointer "
              title="Stop trying to Start"
            >
              <PluginStartStopButton
                className="h-6 w-6 "
                currentState={"Abort"}
                onClick={() => {
                  commands.stopPlugin(plugin.id)
                }}
              />
            </button>
          )}
          <button
            id="plugin-start-stop"
            disabled={
              currentStateType === "Starting" ||
              currentStateType === "Disabling"
            }
            className={`rounded-lg p-2 bg-white/10 hover:bg-white/20 ${currentStateType === "Starting" ||
              currentStateType === "Disabling"
              ? "cursor-progress animate-pulse"
              : "cursor-pointer"
              } `}
          >
            <PluginStartStopButton
              className={`h-6 w-6 `}
              currentState={currentStateType}
              onClick={() => {
                if (
                  currentStateType === "Disabled" ||
                  currentStateType === "FailedToStart"
                ) {
                  commands.startPlugin(plugin.id)
                } else if (currentStateType === "Running") {
                  commands.stopPlugin(plugin.id)
                }
              }}
            />
          </button>
          {plugin.source === "UserProvided" && (
            <button
              id="plugin-start-stop"
              onClick={async () =>
                await commands.openPluginsDir(plugin.id)
              }
              title="Open Plugin Folder"
              className="rounded-lg bg-white/10 hover:bg-white/20 p-2 cursor-pointer "
            >
              <ZondiconsFolder className="h-6 w-6" />
            </button>
          )}
        </section>
      </section>

      <section className="mt-2 -tracking-tighter" id="description">
        {typeof description !== "string" ? (
          <p className=" text-sm italic text-gray-400">
            no description provided…
          </p>
        ) : (
          <p className="text-sm text-gray-200">{description}</p>
        )}
      </section>

      <hr className=" text-neutral-600 my-2" />
      {currentStateType === "FailedToStart" && (
        <div className="text-red-400 p-4">
          <h2>Failed to start plugin…</h2>
          {(
            (plugin.current_state as any).FailedToStart.reasons as string[]
          ).map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
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
        {settingsLoadState.type === "SettingsExportNotHTMLElement" || settingsLoadState.type === "InitializationFailed" && (
          <p>
            The plugin does not correctly define the settings. Please contact
            the plugin developer.
            {settingsLoadState.reason && <span className="block text-red-300">{settingsLoadState.reason}</span>}
          </p>
        )}
        {settingsLoadState.type === "Registered" &&
          <SettingsCell reference={settingsLoadState.instance} />
        }
      </section>
    </div>
  );
}
