/**
 * Cloudflare Workers socket stream adapter.
 *
 * Bridges the Workers `connect()` outbound TCP API to the stream interface
 * expected by mysql2's `createConnection({ stream })`.
 *
 * mysql2 uses the stream as an EventEmitter with `write`, `destroy`, `pause`,
 * `resume`, `on`, and `removeAllListeners`. This adapter implements that
 * interface on top of the Web Streams API provided by `connect()`.
 */

class SimpleEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, fn: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const fns = this.listeners.get(event);
    if (!fns) return false;
    for (const fn of fns) fn(...args);
    return true;
  }

  removeAllListeners(event: string): this {
    this.listeners.delete(event);
    return this;
  }
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

export class WorkerSocketStream extends SimpleEmitter {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private writeQueue: Array<{ data: Uint8Array; resolve: () => void }> = [];
  private writing = false;
  private destroyed = false;
  private paused = false;
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(socket: {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  }) {
    super();
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
    this.emit("connect");
    void this.startReading();
  }

  private async startReading(): Promise<void> {
    try {
      while (!this.destroyed) {
        const { done, value } = await this.reader.read();
        if (done) {
          this.emit("end");
          this.emit("close");
          break;
        }
        if (this.paused) {
          this.buffer = concatBytes(this.buffer, value);
        } else {
          this.emit("data", value);
        }
      }
    } catch (err) {
      if (!this.destroyed) {
        this.emit("error", err);
        this.emit("close");
      }
    }
  }

  write(data: Uint8Array | Buffer, cb?: (err?: Error) => void): boolean {
    if (this.destroyed) {
      cb?.(new Error("Socket destroyed"));
      return false;
    }
    const bytes =
      typeof Buffer !== "undefined" && Buffer.isBuffer(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data;
    this.writeQueue.push({ data: bytes, resolve: () => cb?.() });
    void this.processWriteQueue();
    return true;
  }

  private async processWriteQueue(): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    while (this.writeQueue.length > 0 && !this.destroyed) {
      const { data, resolve } = this.writeQueue.shift()!;
      try {
        await this.writer.write(data);
        resolve();
      } catch (err) {
        this.emit("error", err);
        resolve();
      }
    }
    this.writing = false;
  }

  destroy(): void {
    this.destroyed = true;
    this.reader.cancel().catch(() => {});
    this.writer.close().catch(() => {});
    this.emit("close");
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    if (this.buffer.length > 0) {
      this.emit("data", this.buffer);
      this.buffer = new Uint8Array(0);
    }
  }

  setKeepAlive(): void {}
  setNoDelay(): void {}
}
