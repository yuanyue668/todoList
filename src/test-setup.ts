import "@testing-library/jest-dom";

// jsdom does not implement scrollIntoView; provide a no-op stub
window.HTMLElement.prototype.scrollIntoView = function () {};
