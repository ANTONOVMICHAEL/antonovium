/** One contact sequence has one owner. No click handler also turns a page. */
export type ReaderAction = 'previous' | 'next' | 'tools';
export interface ReaderContact { id: number; x: number; y: number; time: number }
interface Gesture extends ReaderContact {
  maxX: number;
  maxY: number;
  firstMove: number;
  blocked: boolean;
}

export class ReaderGestures {
  private contacts = new Set<number>();
  private gesture: Gesture | null = null;

  start(contact: ReaderContact, blocked: boolean) {
    this.contacts.add(contact.id);
    if (this.contacts.size !== 1) { this.cancel(); return; }
    this.gesture = { ...contact, maxX: 0, maxY: 0, firstMove: 0, blocked };
  }

  move(contact: ReaderContact) {
    const g = this.gesture;
    if (!g || g.id !== contact.id) return;
    g.maxX = Math.max(g.maxX, Math.abs(contact.x - g.x));
    g.maxY = Math.max(g.maxY, Math.abs(contact.y - g.y));
    if (!g.firstMove && Math.max(g.maxX, g.maxY) > 10) g.firstMove = contact.time - g.time;
  }

  end(contact: ReaderContact, bounds: { left: number; width: number }, blocked: boolean): ReaderAction | null {
    this.move(contact);
    this.contacts.delete(contact.id);
    const g = this.gesture;
    this.gesture = null;
    if (!g || g.id !== contact.id || this.contacts.size || g.blocked || blocked) return null;
    const duration = contact.time - g.time;
    const dx = contact.x - g.x;
    const dy = contact.y - g.y;
    // A hold followed by a drag belongs to selection, not navigation.
    if (duration < 650 && g.firstMove > 0 && g.firstMove < 300 &&
        Math.abs(dx) >= 48 && Math.abs(dx) > Math.max(1, g.maxY) * 1.8 && Math.abs(dy) <= 32) {
      return dx < 0 ? 'next' : 'previous';
    }
    if (duration > 300 || g.maxX > 10 || g.maxY > 10 || bounds.width <= 0) return null;
    const x = (contact.x - bounds.left) / bounds.width;
    if (x < 0 || x > 1) return null;
    return x < .3 ? 'previous' : x > .7 ? 'next' : 'tools';
  }

  cancel(id?: number) {
    this.gesture = null;
    if (id !== undefined) this.contacts.delete(id);
  }
}

export function readerInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(
    'a,button,input,textarea,select,label,summary,[role="button"],[role="link"],' +
    '[contenteditable]:not([contenteditable="false"]),[data-cloud-highlight],' +
    '.cloud-pdf-note-marker,.annotationLayer,[data-reader-interactive]'
  );
}
