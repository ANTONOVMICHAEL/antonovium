import type { FileAnchor } from './cloud';

export function fb2Geometry(frame: HTMLElement, root: HTMLElement) {
  const css = getComputedStyle(root);
  const contentWidth = root.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  // One CSS column plus its gap. Never infer the stride from a PDF width cap.
  const step = Math.max(1, contentWidth + (parseFloat(css.columnGap) || 0));
  const max = Math.max(0, frame.scrollWidth - frame.clientWidth);
  const pages = Math.max(1, Math.round(max / step) + 1);
  return { step, max, pages, page: Math.min(pages, Math.max(1, Math.round(frame.scrollLeft / step) + 1)) };
}

function intersects(rect: DOMRect, box: DOMRect, paged: boolean) {
  return rect.width > 0 && rect.height > 0 && rect.right > box.left + 18 &&
    rect.left < box.right - 18 && rect.bottom > box.top + (paged ? 12 : 30) && rect.top < box.bottom;
}

/** Find a text offset even when one paragraph continues over several columns. */
export function visibleFB2Position(frame: HTMLElement, root: HTMLElement, chapter: string | undefined, paged: boolean): FileAnchor {
  const box = frame.getBoundingClientRect();
  const page = paged ? fb2Geometry(frame, root).page : undefined;
  for (const paragraph of root.querySelectorAll<HTMLElement>('[data-fb2-paragraph]')) {
    if (!Array.from(paragraph.getClientRects()).some(rect => intersects(rect, box, paged))) continue;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node: Node | null, offset = 0;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0;
      if (!length) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (!Array.from(range.getClientRects()).some(rect => intersects(rect, box, paged))) { offset += length; continue; }
      let low = 1, high = length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        range.setEnd(node, mid);
        if (Array.from(range.getClientRects()).some(rect => intersects(rect, box, paged))) high = mid;
        else low = mid + 1;
      }
      return { format: 'fb2', chapter, paragraph: paragraph.id, offset: offset + low - 1, page };
    }
  }
  return { format: 'fb2', chapter, page };
}

export function restoreFB2Position(frame: HTMLElement, root: HTMLElement, at: FileAnchor, paged: boolean, end = false) {
  const geometry = fb2Geometry(frame, root);
  const target = at.paragraph ? root.querySelector<HTMLElement>(`#${CSS.escape(at.paragraph)}`) : null;
  if (end) { frame.scrollLeft = geometry.max; frame.scrollTop = paged ? 0 : frame.scrollHeight; return; }
  if (target) {
    let rect = target.getClientRects()[0] ?? target.getBoundingClientRect();
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let node: Node | null, left = at.offset ?? 0;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0;
      if (length && left < length) {
        const range = document.createRange();
        range.setStart(node, left);
        range.setEnd(node, Math.min(length, left + 1));
        if (range.getBoundingClientRect().height) rect = range.getBoundingClientRect();
        break;
      }
      left -= length;
    }
    const box = frame.getBoundingClientRect();
    if (paged) {
      const page = Math.floor((rect.left - box.left + frame.scrollLeft) / geometry.step);
      frame.scrollLeft = Math.max(0, Math.min(geometry.max, page * geometry.step));
      frame.scrollTop = 0;
    } else { frame.scrollLeft = 0; frame.scrollTop += rect.top - box.top - 30; }
  } else {
    frame.scrollTop = 0;
    frame.scrollLeft = paged ? Math.max(0, Math.min(geometry.max, ((at.page ?? 1) - 1) * geometry.step)) : 0;
  }
}
