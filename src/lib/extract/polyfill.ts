import DOMMatrix from 'dommatrix';
if (typeof globalThis.DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = DOMMatrix;
}
