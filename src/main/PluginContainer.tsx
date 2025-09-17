import { useEffect, useRef } from "react"

export interface PluginContainerProps {
  instance: HTMLElement | undefined
}

/**
 * This houses the Plugin's web component.
 */
export function PluginContainer(props: PluginContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (props.instance && containerRef.current) {
      // We move the reference to the HTML Element
      containerRef.current.appendChild(props.instance)
    }
  }, [props.instance])

  return <div ref={containerRef}></div>
}
