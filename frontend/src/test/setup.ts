import '@testing-library/jest-dom';

// jsdom does not implement elementFromPoint; return null so hooks that use it degrade gracefully
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}
