import z from "zod";
import { AnyNodeZod, PluginViewStructureZod } from "./layouts/types";
import { PluginStateContainingCurrentStateZod } from "./PluginsManager";

export function traverseNode(
  el: z.infer<typeof AnyNodeZod>,
  containerId: string
): z.infer<typeof AnyNodeZod> | undefined {
  switch (el.type) {
    case "PluginCell":
      if (el.plugin_id === containerId) {
        return el;
      }
      return undefined;
    case "VerticalLayout":
      if (el.identifier === containerId) {
        return el;
      }

      return el.children
        .map((e) => {
          return traverseNode(e, containerId);
        })
        .find(Boolean);
  }
}

export function removeOldItemInChildren(
  el: z.infer<typeof AnyNodeZod>,
  containerId: string
) {
  if (el.type === "PluginCell") {
    // plugin cells cant have children. Nothing we can do here. This needs to be done in the parent
    return;
  }
  el.children = el.children.filter((e) => {
    switch (e.type) {
      case "PluginCell":
        return e.plugin_id !== containerId || e.newElement;
      case "VerticalLayout":
        removeOldItemInChildren(e, containerId);
        return e.identifier !== containerId || e.newElement;
    }
  });
}

// This function traverses all known plugins and returns the ones that are not found within the layout
export function makePluginIdsInParkingLot(
  pluginIds: Record<
    string,
    z.infer<typeof PluginStateContainingCurrentStateZod>
  >,
  layout: z.infer<typeof PluginViewStructureZod> | undefined
) {
  if (typeof pluginIds === "undefined" || typeof layout === "undefined") {
    return undefined;
  }

  function returnIdsForLayout(layout: z.infer<typeof AnyNodeZod>): string[] {
    switch (layout.type) {
      case "PluginCell":
        return [layout.plugin_id];
      case "VerticalLayout":
        return layout.children.flatMap((e) => returnIdsForLayout(e));
    }
  }
  // This is a lookup
  const knownIds = Object.fromEntries(
    returnIdsForLayout(layout.root).map((e) => [e, true])
  );
  const idsNotInLayout = Object.keys(pluginIds).filter(
    (e) => !knownIds[e] && pluginIds[e]!.current_state.type !== "Disabled"
  );

  return idsNotInLayout;
}
