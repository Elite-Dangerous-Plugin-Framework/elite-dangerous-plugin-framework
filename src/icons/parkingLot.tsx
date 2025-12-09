import { SVGProps } from "react";

export function ParkingLotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 11 11"
      {...props}
    >
      {/* Icon from Maki by Mapbox - https://creativecommons.org/publicdomain/zero/1.0/ */}
      <path
        d="M7.25 7.44a2.35 2.35 0 0 1-1.53.44H4.45V10H3.19V4H5.8a2.13 2.13 0 0 1 1.44.46c.385.372.583.897.54 1.43a1.84 1.84 0 0 1-.53 1.55zm-1-2.16a1 1 0 0 0-.68-.2H4.45v1.76H5.6a1 1 0 0 0 .68-.22a.87.87 0 0 0 .24-.68a.82.82 0 0 0-.24-.66h-.03zm4.16-2a.5.5 0 0 0-.19-.68L5.72.1a.5.5 0 0 0-.49 0L.73 2.6a.5.5 0 0 0 .49.87l4.28-2.4l4.26 2.37a.5.5 0 0 0 .679-.198l.001-.002l-.03.04z"
        fill="currentColor"
      />
    </svg>
  );
}

export function GripIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      {...props}
    >
      {/* Icon from Bootstrap Icons by The Bootstrap Authors - https://github.com/twbs/icons/blob/main/LICENSE.md */}
      <path
        fill="currentColor"
        d="M7 2a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0M7 5a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0M7 8a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0m-3 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0m-3 3a1 1 0 1 1-2 0a1 1 0 0 1 2 0m3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0"
      />
    </svg>
  );
}

export function ChevronUp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M7.41 18.41L6 17l6-6l6 6l-1.41 1.41L12 13.83zm0-6L6 11l6-6l6 6l-1.41 1.41L12 7.83z"
      />
    </svg>
  );
}
