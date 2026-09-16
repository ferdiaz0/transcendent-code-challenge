/**
 * A tiny helper for building DOM elements without a framework:
 *
 *   h('a', { href: '/x', class: 'link', onClick: handler }, 'Click me')
 *
 * Text is always inserted as text (never as HTML), so content from Hacker News
 * or from the LLM can't inject markup into the page.
 */
export function h(tag, attributes = {}, ...children) {
  return build(document.createElement(tag), attributes, children);
}

/** Same as `h`, for SVG elements (they need their own namespace). */
export function svg(tag, attributes = {}, ...children) {
  return build(document.createElementNS('http://www.w3.org/2000/svg', tag), attributes, children);
}

function build(element, attributes, children) {
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name.startsWith('on')) element.addEventListener(name.slice(2).toLowerCase(), value);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }
  return element;
}

export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

export function formatDate(isoDate) {
  return new Date(isoDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
