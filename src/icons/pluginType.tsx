import { SVGProps } from "react";
import { PluginState } from "../types/PluginState";
import { PluginCurrentStateKeys } from "../types/PluginCurrentState";

export function PluginTypeIcon(
  props: SVGProps<SVGSVGElement> & { type: PluginState["source"] }
) {
  if (props.type === "Embedded") {
    return <IconoirPackageLock {...props} />;
  } else if (props.type === "UserProvided") {
    return <IconoirUser {...props} />;
  } else {
    throw new Error("unknown plugin type");
  }
}

function IconoirPackageLock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Iconoir by Luca Burgio - https://github.com/iconoir-icons/iconoir/blob/main/LICENSE */}
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6m-8-3V4m9.167 14.5h.233a.6.6 0 0 1 .6.6v2.3a.6.6 0 0 1-.6.6h-3.8a.6.6 0 0 1-.6-.6v-2.3a.6.6 0 0 1 .6-.6h.233m3.334 0v-1.75c0-.583-.334-1.75-1.667-1.75s-1.667 1.167-1.667 1.75v1.75m3.334 0h-3.334"
      />
    </svg>
  );
}

function IconoirUser(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Iconoir by Luca Burgio - https://github.com/iconoir-icons/iconoir/blob/main/LICENSE */}
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M5 20v-1a7 7 0 0 1 7-7v0a7 7 0 0 1 7 7v1m-7-8a4 4 0 1 0 0-8a4 4 0 0 0 0 8"
      />
    </svg>
  );
}

export function ZondiconsFolder(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
      {...props}
    >
      {/* Icon from Zondicons by Steve Schoger - https://github.com/dukestreetstudio/zondicons/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M0 4c0-1.1.9-2 2-2h7l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2z"
      />
    </svg>
  );
}

export function PluginStartStopButton(
  props: {
    currentState: PluginCurrentStateKeys | "Abort";
  } & SVGProps<SVGSVGElement>
) {
  const newProps = {
    ...props,
    currentState: undefined,
  } as Omit<typeof props, "currentState"> & { currentState?: any };
  delete newProps.currentState;

  if (props.currentState === "Disabled" || props.currentState === "Starting") {
    // its stopped - display Start button
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 20 20"
        {...newProps}
      >
        {/* Icon from Zondicons by Steve Schoger - https://github.com/dukestreetstudio/zondicons/blob/master/LICENSE */}
        <path
          fill="currentColor"
          d="M2.93 17.07A10 10 0 1 1 17.07 2.93A10 10 0 0 1 2.93 17.07m12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32M7 6l8 4l-8 4z"
        />
      </svg>
    );
  } else if (
    props.currentState === "Disabling" ||
    props.currentState === "Running"
  ) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 20 20"
        {...newProps}
      >
        {/* Icon from Zondicons by Steve Schoger - https://github.com/dukestreetstudio/zondicons/blob/master/LICENSE */}
        <path
          fill="currentColor"
          d="M2.93 17.07A10 10 0 1 1 17.07 2.93A10 10 0 0 1 2.93 17.07m12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32M7 6h2v8H7zm4 0h2v8h-2z"
        />
      </svg>
    );
  } else if (props.currentState === "FailedToStart") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 20 20"
        {...newProps}
      >
        {/* Icon from Zondicons by Steve Schoger - https://github.com/dukestreetstudio/zondicons/blob/master/LICENSE */}
        <path
          fill="currentColor"
          d="M2.93 17.07A10 10 0 1 1 17.07 2.93A10 10 0 0 1 2.93 17.07M9 5v6h2V5zm0 8v2h2v-2z"
        />
      </svg>
    );
  } else if (props.currentState === "Abort") {

    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20" {...newProps}>{/* Icon from Zondicons by Steve Schoger - https://github.com/dukestreetstudio/zondicons/blob/master/LICENSE */}<path fill="currentColor" d="M2.93 17.07A10 10 0 1 1 17.07 2.93A10 10 0 0 1 2.93 17.07m1.41-1.41A8 8 0 1 0 15.66 4.34A8 8 0 0 0 4.34 15.66m9.9-8.49L11.41 10l2.83 2.83l-1.41 1.41L10 11.41l-2.83 2.83l-1.41-1.41L8.59 10L5.76 7.17l1.41-1.41L10 8.59l2.83-2.83z" /></svg>
    )
  }
}
