// Tiny DOM helpers. Deliberately not a framework.

/**
 * Create an element.
 * @param {string} tag  optionally with classes: 'div.card.wide'
 * @param {object} attrs  properties; `class`, `text`, `html`, `on` are special
 * @param {Array}  children
 */
export function el(tag, attrs = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name);
  if (classes.length) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = [node.className, value].filter(Boolean).join(' ');
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'on') for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value);
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Same, for SVG elements. */
export function svg(tag, attrs = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElementNS(SVG_NS, name);
  if (classes.length) node.setAttribute('class', classes.join(' '));

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'on') for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
    else if (key === 'class') node.setAttribute('class', [node.getAttribute('class'), value].filter(Boolean).join(' '));
    else node.setAttribute(key, value);
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function mount(node, ...children) {
  clear(node).append(...children.filter(Boolean));
  return node;
}

// --- formatting ------------------------------------------------------------

/** Compact number for the HUD: 1234 -> 1.2k, 1234567 -> 1.2M. */
export function short(n) {
  const value = Math.floor(n);
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

/** Signed number for deltas. */
export function signed(n, digits = 0) {
  const value = Number(n.toFixed(digits));
  return `${value > 0 ? '+' : ''}${value}`;
}

/** "3 hours", "2 days", "45 minutes" — for the welcome-back panel. */
export function duration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} second${s === 1 ? '' : 's'}`;
  const minutes = Math.round(s / 60);
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = s / 3600;
  if (hours < 36) {
    const h = Math.round(hours * 10) / 10;
    return `${h % 1 === 0 ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`;
  }
  const days = Math.round((s / 86400) * 10) / 10;
  return `${days % 1 === 0 ? days : days.toFixed(1)} days`;
}
