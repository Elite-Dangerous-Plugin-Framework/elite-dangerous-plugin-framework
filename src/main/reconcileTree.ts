import z from "zod";
import { PluginWrapper } from "./PluginWrapper";
import PluginsManager from "./PluginsManager";


const PluginViewStructureZodMeta = z.object({
  min_height: z.string().nullable().optional(),
  max_height: z.string().nullable().optional(),
  min_width: z.string().nullable().optional(),
  max_width: z.string().nullable().optional(),
})
const PluginCellNodeZod = z.object({
  type: z.literal("PluginCell"),
  plugin_id: z.string(),
  meta: PluginViewStructureZodMeta
})

const VerticalNodeZod = z.object({
  type: z.literal("VerticalLayout"),
  meta: PluginViewStructureZodMeta,
  identifier: z.string(),
  get children() {
    return z.array(AnyNodeZod)
  }
});

const AnyNodeZod = z.union([
  VerticalNodeZod, PluginCellNodeZod
])


export const PluginViewStructureZod = z.object({
  root: VerticalNodeZod
});



/**
   * This makes sure all nodes exist (both containers and Plugin cells)
   */
export function reconcileTree(data: z.infer<typeof PluginViewStructureZod>, self: PluginsManager, parkingLotRef: HTMLElement) {
  /**
   * We store the IDs of all elements we expect to be in the tree. Then we do a querySelectorAll() based on data-manager=pluginsmanager
   * to get anything that is managed by us.
   * We then prune any containers and move any plugin wrappers to the parking lot
   */
  const legalIds: Record<string, any> = {}

  /**
   * This is a recursive function that is called for all children. 
   * If the child is NOT a container, it returns without further recursion.
   */
  const handleNode = (node: z.infer<typeof AnyNodeZod>, expectedParent: HTMLElement, indexUnderParent: number) => {
    let identifier
    if (node.type === "PluginCell") {
      identifier = `plugin-cell-${node.plugin_id}`
    }
    else {
      identifier = node.identifier
    }
    legalIds[identifier] = {}
    // we get the node. by convention the id of the node is always just the identifier.
    // an exception to this is the root node, which is always edpf-plugin-tree-root
    let existingOrCreatedNode = document.getElementById(identifier)
    if (!existingOrCreatedNode) {
      existingOrCreatedNode = document.createElement(node.type === "PluginCell" ? PluginWrapper.htmlName : "div")
      if (node.type === "VerticalLayout") {
        existingOrCreatedNode.className = "flex justify-stretch bg-neutral-800 flex-col gap-1 w-full"
      }
      existingOrCreatedNode.id = identifier
    }
    existingOrCreatedNode.dataset.type = node.type
    existingOrCreatedNode.dataset.manager = "pluginsmanager"
    function setOrDelete(key: string, val: string | null | undefined) {
      if (val) {
        existingOrCreatedNode!.dataset[key] = val
      } else {
        delete existingOrCreatedNode!.dataset[key]
      }
    }
    setOrDelete("minW", node.meta.min_width)
    setOrDelete("maxW", node.meta.max_width)
    setOrDelete("minH", node.meta.min_height)
    setOrDelete("maxH", node.meta.max_height)
    if (existingOrCreatedNode.parentElement !== expectedParent) {
      expectedParent.append(existingOrCreatedNode)
    }
    // at this point we are guaranteed to be at the correct parent node
    // now we just have to get the ordering right
    const childrenOfParent = [...expectedParent.childNodes]
    const currentIdx = childrenOfParent.findIndex(e => e === existingOrCreatedNode)
    if (currentIdx !== indexUnderParent) {
      // we are at the wrong index and need to move
      if (indexUnderParent < childrenOfParent.length) {
        expectedParent.insertBefore(existingOrCreatedNode, childrenOfParent[indexUnderParent])
      }
      // now we are in the correct order. Because we move left-to-right, there is no index shiftings afterwards
    }

    if (node.type !== "PluginCell") {
      node.children.forEach((c, idx) => handleNode(c, existingOrCreatedNode, idx))
    }
  };
  // by convention the root is always called like that
  data.root.identifier = "edpf-plugin-tree-root"
  handleNode(data.root, self, 0)

  const allManagedNodes = document.querySelectorAll('[data-manager="pluginsmanager"]')
  const nodesToDelete: HTMLElement[] = []
  console.log("all nodes:", allManagedNodes)
  for (const node of allManagedNodes) {
    if (legalIds[node.id]) {
      // This is an allowed node. It shall stay
      continue
    }
    if (!(node instanceof HTMLElement)) {
      throw new Error("should never happen. Node is not an HTML Element")
    }
    // This node has to go. We cannot delete nodes immediately as 
    // they MAY contain children that we care about. 
    // So we enqueue them up into nodesToDelete if they are a container node.
    // if its a plugin we just move it to the parking lot
    if (node.dataset.type === "PluginCell" && node.parentElement !== parkingLotRef) {
      parkingLotRef.append(node) // node moved
    } else {
      nodesToDelete.push(node)
    }
  }
  for (const node of nodesToDelete) {
    node.remove()
  }
}