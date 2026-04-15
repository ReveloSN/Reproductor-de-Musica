class PlaylistNode {
  constructor(song) {
    this.song = song;
    this.prev = null;
    this.next = null;
  }
}

class DoublyLinkedPlaylist {
  constructor() {
    this.head = null;
    this.tail = null;
    this.current = null;
    this.length = 0;
  }

  isEmpty() {
    return this.length === 0;
  }

  addFirst(song) {
    const node = new PlaylistNode(song);

    if (this.isEmpty()) {
      this.head = node;
      this.tail = node;
      this.current = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }

    this.length += 1;
    return 0;
  }

  addLast(song) {
    const node = new PlaylistNode(song);

    if (this.isEmpty()) {
      this.head = node;
      this.tail = node;
      this.current = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }

    this.length += 1;
    return this.length - 1;
  }

  addAt(song, position) {
    return this.insertAt(song, position);
  }

  insertAt(song, position) {
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
    const prevNode = nextNode.prev;
    const node = new PlaylistNode(song);

    node.prev = prevNode;
    node.next = nextNode;
    prevNode.next = node;
    nextNode.prev = node;

    this.length += 1;
    return position;
  }

  removeAt(position) {
    if (position < 0 || position >= this.length) {
      throw new RangeError('Invalid remove position.');
    }

    const node = this.getNodeAt(position);

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

  next() {
    if (this.isEmpty()) {
      return null;
    }

    if (!this.current) {
      this.current = this.head;
      return this.current.song;
    }

    if (!this.current.next) {
      return null;
    }

    this.current = this.current.next;
    return this.current.song;
  }

  nextSong() {
    return this.next();
  }

  previous() {
    if (this.isEmpty()) {
      return null;
    }

    if (!this.current) {
      this.current = this.head;
      return this.current.song;
    }

    if (!this.current.prev) {
      return null;
    }

    this.current = this.current.prev;
    return this.current.song;
  }

  prevSong() {
    return this.previous();
  }

  setCurrentByPosition(position) {
    const node = this.getNodeAt(position);

    if (!node) {
      return null;
    }

    this.current = node;
    return node.song;
  }

  getCurrent() {
    return this.current ? this.current.song : null;
  }

  getCurrentSong() {
    return this.getCurrent();
  }

  getAt(position) {
    const node = this.getNodeAt(position);
    return node ? node.song : null;
  }

  getCurrentIndex() {
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

  getNodeAt(position) {
    if (position < 0 || position >= this.length) {
      return null;
    }

    let currentNode;

    if (position <= Math.floor(this.length / 2)) {
      currentNode = this.head;

      for (let index = 0; index < position; index += 1) {
        currentNode = currentNode.next;
      }
    } else {
      currentNode = this.tail;

      for (let index = this.length - 1; index > position; index -= 1) {
        currentNode = currentNode.prev;
      }
    }

    return currentNode;
  }

  toArray() {
    const songs = [];
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
