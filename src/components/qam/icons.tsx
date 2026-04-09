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
  import: icon(<><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' /><polyline points='14 2 14 8 20 8' /><path d='M12 18v-6' /><path d='m9 15 3 3 3-3' /></>),
  export: icon(<><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' /><polyline points='14 2 14 8 20 8' /><path d='M12 12v6' /><path d='m15 15-3-3-3 3' /></>),
  edit: icon(<><path d='m4 20 4.5-1 9-9a2 2 0 1 0-2.8-2.8l-9 9L4 20Z' /><path d='m13.7 6.3 4 4' /></>),
  duplicate: icon(<><rect x='8' y='8' width='10' height='10' rx='2' /><rect x='5' y='5' width='10' height='10' rx='2' opacity='0.7' /></>),
  eyeOpen: icon(<><path d='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z' /><circle cx='12' cy='12' r='3' /></>),
  eyeClosed: icon(<><path d='M3 3l18 18' /><path d='M9.7 9.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-.9' /><path d='M6.2 6.4A12.7 12.7 0 0 0 2 12s3.5 6 10 6c2.2 0 4-.6 5.5-1.5M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.8 3.8' /></>),
  up: icon(<path d='m6 14 6-6 6 6' />),
  down: icon(<path d='m6 10 6 6 6-6' />),
  trash: icon(<><path d='M3 6h18' /><path d='M8 6V4h8v2' /><path d='M10 10v6' /><path d='M14 10v6' /><path d='M6 6l1 14h10l1-14' /></>),
  ellipsis: icon(<><circle cx='6' cy='12' r='1.4' fill='currentColor' stroke='none' /><circle cx='12' cy='12' r='1.4' fill='currentColor' stroke='none' /><circle cx='18' cy='12' r='1.4' fill='currentColor' stroke='none' /></>, 16),
  customFilters: icon(<><rect x='2' y='8' width='20' height='13' rx='2' /><path d='M2 12h20' /><rect x='6' y='5' width='6' height='3' rx='1' /></>),
};
