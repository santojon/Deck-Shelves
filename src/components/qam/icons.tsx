import React from 'react';

function icon(paths: React.ReactNode, size = 18, fill = 'none') {
  return (
    <svg width={size} height={size} viewBox='0 0 24 24' fill={fill} stroke='currentColor' strokeWidth='2.1' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      {paths}
    </svg>
  );
}

export const icons = {
  add: icon(<><path d='M12 5v14' /><path d='M5 12h14' /></>),
  // Import = down arrow, export = up arrow — matched to the config pages'
  // DownloadIcon / UploadIcon so both surfaces read identically.
  import: icon(<><path d='M12 3v12m0 0l-5-5m5 5l5-5' /><path d='M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3' /></>),
  export: icon(<><path d='M12 21V9m0 0l-5 5m5-5l5 5' /><path d='M4 7V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3' /></>),
  edit: icon(<><path d='m4 20 4.5-1 9-9a2 2 0 1 0-2.8-2.8l-9 9L4 20Z' /><path d='m13.7 6.3 4 4' /></>),
  duplicate: icon(<><rect x='8' y='8' width='10' height='10' rx='2' /><rect x='5' y='5' width='10' height='10' rx='2' opacity='0.7' /></>),
  eyeOpen: icon(<><path d='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z' /><circle cx='12' cy='12' r='3' /></>),
  eyeClosed: icon(<><path d='M3 3l18 18' /><path d='M9.7 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-.9' /><path d='M6.2 6.4A12.7 12.7 0 0 0 2 12s3.5 6 10 6c2.2 0 4-.6 5.5-1.5M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.8 3.8' /></>),
  up: icon(<path d='m6 14 6-6 6 6' />),
  down: icon(<path d='m6 10 6 6 6-6' />),
  trash: icon(<><path d='M3 6h18' /><path d='M8 6V4h8v2' /><path d='M10 10v6' /><path d='M14 10v6' /><path d='M6 6l1 14h10l1-14' /></>),
  ellipsis: icon(<><circle cx='6' cy='12' r='1.4' fill='currentColor' stroke='none' /><circle cx='12' cy='12' r='1.4' fill='currentColor' stroke='none' /><circle cx='18' cy='12' r='1.4' fill='currentColor' stroke='none' /></>, 16),
  tabMaster: icon(<><rect x='2' y='8' width='20' height='13' rx='2' /><path d='M2 12h20' /><rect x='6' y='5' width='6' height='3' rx='1' /></>),
  reset: icon(<><path d='M3 12a9 9 0 1 0 3-6.7' /><path d='M3 4v5h5' /></>),
  save: icon(<><path d='M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z' /><polyline points='17 21 17 13 7 13 7 21' /><polyline points='7 3 7 8 15 8' /></>),
  close: icon(<><path d='M18 6 6 18' /><path d='M6 6l12 12' /></>),
  // Sort icons: stack of horizontal bars (longest at one end) plus a small
  // arrow on the right indicating direction.
  sortDesc: icon(<><path d='M3 6h13M3 12h9M3 18h5' /><path d='M19 6v12M16 15l3 3 3-3' /></>),
  sortAsc: icon(<><path d='M3 6h5M3 12h9M3 18h13' /><path d='M19 18V6M16 9l3-3 3 3' /></>),
  // Filter-invert icons: equals (matches) and not-equals (negated). Two
  // horizontal bars; the inverted variant adds a diagonal slash.
  filterInvertOff: icon(<path d='M4 9h16M4 15h16' />),
  filterInvertOn: icon(<><path d='M4 9h16M4 15h16' /><path d='M5 4l14 16' /></>),
};
