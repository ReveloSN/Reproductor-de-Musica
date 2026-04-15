class PlaylistNode<TTrack extends Track = Track> {
  song: TTrack;
  prev: PlaylistNode<TTrack> | null;
  next: PlaylistNode<TTrack> | null;

  constructor(song: TTrack) {
    this.song = song;
    this.prev = null;
    this.next = null;
  }
}

class DoublyLinkedPlaylist<TTrack extends Track = Track> {
  head: PlaylistNode<TTrack> | null;
  tail: PlaylistNode<TTrack> | null;
  current: PlaylistNode<TTrack> | null;
  length: number;

  constructor() {
    this.head = null;
    this.tail = null;
    this.current = null;
    this.length = 0;
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  addFirst(song: TTrack): number {
    const node = new PlaylistNode(song);

    if (this.isEmpty()) {
      this.head = node;
      this.tail = node;
      this.current = node;
    } else {
      node.next = this.head;

      if (this.head) {
        this.head.prev = node;
      }

      this.head = node;
    }

    this.length += 1;
    return 0;
  }

  addLast(song: TTrack): number {
    const node = new PlaylistNode(song);

    if (this.isEmpty()) {
      this.head = node;
      this.tail = node;
      this.current = node;
    } else {
      node.prev = this.tail;

      if (this.tail) {
        this.tail.next = node;
      }

      this.tail = node;
    }

    this.length += 1;
    return this.length - 1;
  }

  addAt(song: TTrack, position: number): number {
    return this.insertAt(song, position);
  }

  insertAt(song: TTrack, position: number): number {
    if (position < 0 || position > this.length) {
      throw new RangeError('Invalid insert position.');
    }

    if (position === 0) {
      return this.addFirst(song);
    }

    if (position === this.length) {
      return this.addLast(song);
    }

    const nextNode = this.getNodeAt(position);

    if (!nextNode || !nextNode.prev) {
      throw new RangeError('Invalid insert position.');
    }

    const prevNode = nextNode.prev;
    const node = new PlaylistNode(song);

    node.prev = prevNode;
    node.next = nextNode;
    prevNode.next = node;
    nextNode.prev = node;

    this.length += 1;
    return position;
  }

  removeAt(position: number): TTrack {
    if (position < 0 || position >= this.length) {
      throw new RangeError('Invalid remove position.');
    }

    const node = this.getNodeAt(position);

    if (!node) {
      throw new RangeError('Invalid remove position.');
    }

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    if (node === this.current) {
      this.current = node.next || node.prev || null;
    }

    this.length -= 1;

    if (this.length === 0) {
      this.head = null;
      this.tail = null;
      this.current = null;
    }

    node.prev = null;
    node.next = null;

    return node.song;
  }

  next(): TTrack | null {
    if (this.isEmpty()) {
      return null;
    }

    if (!this.current) {
      this.current = this.head;
      return this.current ? this.current.song : null;
    }

    if (!this.current.next) {
      return null;
    }

    this.current = this.current.next;
    return this.current.song;
  }

  nextSong(): TTrack | null {
    return this.next();
  }

  previous(): TTrack | null {
    if (this.isEmpty()) {
      return null;
    }

    if (!this.current) {
      this.current = this.head;
      return this.current ? this.current.song : null;
    }

    if (!this.current.prev) {
      return null;
    }

    this.current = this.current.prev;
    return this.current.song;
  }

  prevSong(): TTrack | null {
    return this.previous();
  }

  setCurrentByPosition(position: number): TTrack | null {
    const node = this.getNodeAt(position);

    if (!node) {
      return null;
    }

    this.current = node;
    return node.song;
  }

  getCurrent(): TTrack | null {
    return this.current ? this.current.song : null;
  }

  getCurrentSong(): TTrack | null {
    return this.getCurrent();
  }

  getAt(position: number): TTrack | null {
    const node = this.getNodeAt(position);
    return node ? node.song : null;
  }

  getCurrentIndex(): number {
    let index = 0;
    let node = this.head;

    while (node) {
      if (node === this.current) {
        return index;
      }

      index += 1;
      node = node.next;
    }

    return -1;
  }

  getNodeAt(position: number): PlaylistNode<TTrack> | null {
    if (position < 0 || position >= this.length) {
      return null;
    }

    let currentNode: PlaylistNode<TTrack> | null;

    if (position <= Math.floor(this.length / 2)) {
      currentNode = this.head;

      for (let index = 0; index < position; index += 1) {
        currentNode = currentNode ? currentNode.next : null;
      }
    } else {
      currentNode = this.tail;

      for (let index = this.length - 1; index > position; index -= 1) {
        currentNode = currentNode ? currentNode.prev : null;
      }
    }

    return currentNode;
  }

  toArray(): Array<TTrack & { index: number; isCurrent: boolean }> {
    const songs: Array<TTrack & { index: number; isCurrent: boolean }> = [];
    let index = 0;
    let node = this.head;

    while (node) {
      songs.push({
        ...node.song,
        index,
        isCurrent: node === this.current,
      });

      node = node.next;
      index += 1;
    }

    return songs;
  }
}

window.DoublyLinkedPlaylist = DoublyLinkedPlaylist;
