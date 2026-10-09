/* Minimal stroke icon set (24px grid, currentColor). */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconHome = (p: P) => (
  <svg {...base} {...p}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" /></svg>
);
export const IconClock = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconPlusClock = (p: P) => (
  <svg {...base} {...p}><path d="M20.4 13.2A8.5 8.5 0 1 1 12 3.5" /><path d="M12 7.5V12l3 2" /><path d="M19 3v6M16 6h6" /></svg>
);
export const IconList = (p: P) => (
  <svg {...base} {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>
);
export const IconWallet = (p: P) => (
  <svg {...base} {...p}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M16 13.5h2" /></svg>
);
export const IconSend = (p: P) => (
  <svg {...base} {...p}><path d="M20 4 10.5 13.5" /><path d="M20 4 14 20l-3.5-6.5L4 10z" /></svg>
);
export const IconReceipt = (p: P) => (
  <svg {...base} {...p}><path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
);
export const IconUsers = (p: P) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></svg>
);
export const IconFolder = (p: P) => (
  <svg {...base} {...p}><path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>
);
export const IconChart = (p: P) => (
  <svg {...base} {...p}><path d="M4 20h16" /><path d="M7 16v-5M12 16V7M17 16v-8" /></svg>
);
export const IconShield = (p: P) => (
  <svg {...base} {...p}><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconUser = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>
);
export const IconMenu = (p: P) => (
  <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconX = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconAlert = (p: P) => (
  <svg {...base} {...p}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4M12 17h.01" /></svg>
);
export const IconInfo = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></svg>
);
export const IconUpload = (p: P) => (
  <svg {...base} {...p}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
);
export const IconArrowIn = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v15M6 13l6 6 6-6" /></svg>
);
export const IconArrowOut = (p: P) => (
  <svg {...base} {...p}><path d="M12 20V5M6 11l6-6 6 6" /></svg>
);
export const IconCloudOff = (p: P) => (
  <svg {...base} {...p}><path d="M3 3l18 18" /><path d="M8.5 7.2A5.5 5.5 0 0 1 17 11h1a3.5 3.5 0 0 1 2.2 6.2M16 18H7a4 4 0 0 1-1.6-7.7" /></svg>
);
export const IconLogout = (p: P) => (
  <svg {...base} {...p}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></svg>
);
export const IconEdit = (p: P) => (
  <svg {...base} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>
);
export const IconLock = (p: P) => (
  <svg {...base} {...p}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
);
export const IconFile = (p: P) => (
  <svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
);
