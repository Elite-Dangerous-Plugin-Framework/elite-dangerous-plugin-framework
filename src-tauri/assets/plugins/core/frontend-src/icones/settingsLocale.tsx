import type { SVGProps } from "react";

export function LanguageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Meteor Icons by zkreations - https://github.com/zkreations/icons/blob/main/LICENSE */}
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M2 5h14M9 2v3m4 0q-2 8-9 11m2-7q2 4 6 6m1 7l5-11l5 11m-1.4-3h-7.2"
      />
    </svg>
  );
}
