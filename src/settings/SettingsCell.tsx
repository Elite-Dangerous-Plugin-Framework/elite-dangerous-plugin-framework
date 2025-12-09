import { useEffect, useRef } from "react";


interface PluginPortalProps {
  reference: HTMLElement | undefined;
}

export function SettingsCell({ reference }: PluginPortalProps) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (divRef.current && reference) {
      if (!divRef.current.shadowRoot) {
        divRef.current.attachShadow({ mode: "open" });
      }
      if (!divRef.current.shadowRoot) {
        throw new Error("illogical error: shadow Root is unset after creating");
      }
      divRef.current.shadowRoot.appendChild(reference);
    }
    if (divRef.current && divRef.current.shadowRoot) {
      for (const child of divRef.current.shadowRoot.children) {
        if (child !== reference) {
          child.remove();
        }
      }
    }
  }, [reference]);

  return (
    <div
      data-role="settings_container"
      className="w-full h-full pointer-events-auto"
      ref={divRef}
    ></div>
  );
}

