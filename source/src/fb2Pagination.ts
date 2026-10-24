import type { FileAnchor } from './cloud';

export function fb2Geometry(frame: HTMLElement, root: HTMLElement) {
  const css = getComputedStyle(root);
  // Phone pagination uses a vertical, screen-sized reading window. This avoids
  // WebKit reporting a long chapter as just one horizontally overflowing CSS column.
  // The page is still a viewport of text, NOT an entire FB2 chapter.
  const vertical = css.getPropertyValue('--fb2-paging-axis').trim() === 'vertical';
  if (vertical) {
    const leading = Number.parseFloat(css.lineHeight) || 32;
    const overlap = Math.min(frame.clientHeight * .15, Math.max(16, leading));
    const step = Math.max(1, frame.clientHeight - overlap);
    const max = Math.max(0, frame.scrollHeight - frame.clientHeight);
    const pages = Math.max(1, Math.ceil(max / step) + 1);
    const page = Math.min(pages, Math.max(1, Math.ceil((frame.scrollTop - 1) / step) + 1));
    return { step, max, pages, page, vertical };
  }
  const contentWidth = root.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  const step = Math.max(1, contentWidth + (parseFloat(css.columnGap) || 0));
  const max = Math.max(0, frame.scrollWidth - frame.clientWidth);
  const pages = Math.max(1, Math.round(max / step) + 1);
  return { step, max, pages, page: Math.min(pages, Math.max(1, Math.round(frame.scrollLeft / step) + 1)), vertical };
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
  if (end) {
    frame.scrollLeft = geometry.vertical ? 0 : geometry.max;
    frame.scrollTop = geometry.vertical ? geometry.max : paged ? 0 : frame.scrollHeight;
    return;
  }
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
      if (geometry.vertical) {
        const top = Math.max(0, rect.top - box.top + frame.scrollTop);
        const page = Math.floor(top / geometry.step);
        frame.scrollTop = Math.max(0, Math.min(geometry.max, page * geometry.step));
        frame.scrollLeft = 0;
      } else {
        const page = Math.floor((rect.left - box.left + frame.scrollLeft) / geometry.step);
        frame.scrollLeft = Math.max(0, Math.min(geometry.max, page * geometry.step));
        frame.scrollTop = 0;
      }
    } else { frame.scrollLeft = 0; frame.scrollTop += rect.top - box.top - 30; }
  } else {
    if (paged && geometry.vertical) {
      frame.scrollLeft = 0;
      frame.scrollTop = Math.max(0, Math.min(geometry.max, ((at.page ?? 1) - 1) * geometry.step));
    } else {
      frame.scrollTop = 0;
      frame.scrollLeft = paged ? Math.max(0, Math.min(geometry.max, ((at.page ?? 1) - 1) * geometry.step)) : 0;
    }
  }
}
