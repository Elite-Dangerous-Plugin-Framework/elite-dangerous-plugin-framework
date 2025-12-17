import { CommandWrapper } from "../commands/commandWrapper";
import { PluginSettingsContextV1AlphaImpl } from "./SettingsContext";

export type SettingsComponentLoadState =
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
    type: "InitializationFailed";
    reason: "ConstructFailed" | "InitMissing" | "InitFailed"
  }

  | {
    type: "Registered";
    instance: HTMLElement
  };

export async function startAndLoadSettings(
  pluginID: string,
  commands: CommandWrapper
): Promise<SettingsComponentLoadState> {
  const result = await commands.getImportPathForPlugin(pluginID);
  if (!result.success) {
    return {
      type: "PluginNotFound"
    }
  }

  const { hash, import: moduleImport } = result.data

  // now try to import the module
  let module: any;
  try {
    module = await import(/* @vite-ignore */ moduleImport);
  } catch (err) {

    return {
      type: "FailedAwaitImport"
    }
  }
  // if here, module exists
  if (!module.Settings) {
    return {
      type: "NoSettingsExported"
    }
  }
  // This essentially checks if the export is a class definition that inherits HTMLElement
  if (
    typeof module.Settings !== "function" ||
    !Object.prototype.isPrototypeOf.call(
      HTMLElement.prototype,
      module.Settings.prototype
    )
  ) {
    return {
      type: "SettingsExportNotHTMLElement"
    }
  }
  let customElementID = `setting-${pluginID}-${hash}`;
  if (!customElements.get(customElementID)) {
    customElements.define(customElementID, module.Settings);
  } else {
    console.info("custom element was already defined");
  }
  console.info(
    customElementID,
    "registered:",
    customElements.get(customElementID)
  );
  // We spawn the HTML Element
  let item: HTMLElement;
  try {
    item = new module.Settings();
  } catch (e) {
    console.error("Settings element for Plugin " + pluginID + " could not be constructed", { err: e })
    return {
      type: "InitializationFailed",
      reason: "ConstructFailed"
    }
  }
  if (!(item instanceof HTMLElement)) {
    return {
      type: "SettingsExportNotHTMLElement"
    }
  }
  if (!("initSettings" in item) || typeof item.initSettings !== "function") {
    return {
      type: "InitializationFailed",
      reason: "InitMissing"
    }
  }
  const assetsBase = result.data.import.substring(0, result.data.import.lastIndexOf("/") + 1);
  const settingsContext = new PluginSettingsContextV1AlphaImpl(pluginID, commands, assetsBase)
  try {
    item.initSettings(settingsContext);
  } catch (e) {

    return {
      type: "InitializationFailed",
      reason: "InitFailed"
    }
  }

  return {
    type: "Registered",
    instance: item
  }
}
