import { computeCenteredScrollLeft } from '../src/core/scrollUtils';

function approx(a:number, b:number, eps=0.001){ return Math.abs(a-b) <= eps }

// Simple tests
const container = { width: 400, scrollWidth: 1200 };
const item = { left: 300, top:0, width: 133, height: 200 };
const expected = item.left - (container.width / 2) + (item.width / 2);
const maxScroll = Math.max(0, container.scrollWidth - container.width);
const final = Math.max(0, Math.min(expected, maxScroll));

if (!approx(computeCenteredScrollLeft(container as any, item as any), final)){
  console.error('computeCenteredScrollLeft failed', computeCenteredScrollLeft(container as any, item as any), final);
  process.exit(1);
}
console.log('scrollUtils tests passed');
