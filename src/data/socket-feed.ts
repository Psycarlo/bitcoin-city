import type { FeedStatus } from "./types";

const SECOND = 1000;
const FIRST_RETRY = SECOND;
const MAX_RETRY = 30 * SECOND;

export interface SocketListener<T> {
  onMessage: (message: T) => void;
  /** Runs on each new connection, to ask for what the feed should send. */
  onOpen?: (send: (data: string) => void) => void;
  onStatus: (status: FeedStatus) => void;
}

export interface SocketOptions<T> {
  /** Reads a message; what it cannot read (undefined) is dropped. */
  parse: (data: unknown) => T | undefined;
  /** Sent every so often to keep the connection alive. */
  ping?: { data: string; interval: number };
  /**
   * A connection that has been quiet this long (ms) is taken for dead and
   * replaced, as one can stay open long after its network went away (a
   * laptop that slept, a phone that changed networks).
   */
  staleAfter?: number;
  /** Addresses to try in turn: each one that fails to connect hands over to the next. */
  urls: readonly string[];
}

export interface SocketFeed {
  close: () => void;
  /** Sends over the open connection; dropped while there is none. */
  send: (data: string) => void;
}

/**
 * A WebSocket that stays connected: it reconnects with exponential backoff
 * when the connection drops, and moves on to the next address when one
 * cannot be reached.
 */
export const createSocketFeed = <T>(
  { parse, ping, staleAfter, urls }: SocketOptions<T>,
  listener: SocketListener<T>
): SocketFeed => {
  let socket: WebSocket | undefined;
  let closed = false;
  let attempts = 0;
  let address = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let staleTimer: ReturnType<typeof setTimeout> | undefined;

  const send = (data: string) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  };

  const connect = () => {
    listener.onStatus(attempts === 0 ? "connecting" : "reconnecting");
    const url = urls[address % urls.length];
    if (!url) {
      return;
    }
    const current = new WebSocket(url);
    socket = current;
    let opened = false;

    const watch = () => {
      if (staleAfter === undefined) {
        return;
      }
      clearTimeout(staleTimer);
      staleTimer = setTimeout(() => {
        current.close();
      }, staleAfter);
    };

    current.addEventListener("open", () => {
      opened = true;
      attempts = 0;
      listener.onStatus("open");
      listener.onOpen?.(send);
      watch();
      if (ping) {
        pingTimer = setInterval(() => {
          current.send(ping.data);
        }, ping.interval);
      }
    });
    current.addEventListener("message", (event) => {
      watch();
      const message = closed ? undefined : parse(event.data);
      if (message !== undefined) {
        listener.onMessage(message);
      }
    });
    current.addEventListener("close", () => {
      clearInterval(pingTimer);
      clearTimeout(staleTimer);
      if (closed || socket !== current) {
        return;
      }
      if (!opened) {
        address += 1;
      }
      attempts += 1;
      listener.onStatus("reconnecting");
      retryTimer = setTimeout(
        connect,
        Math.min(MAX_RETRY, FIRST_RETRY * 2 ** (attempts - 1))
      );
    });
  };

  // On the next tick, so a feed closed straight away (as StrictMode does in
  // development) never opens a socket it would close while still connecting.
  retryTimer = setTimeout(connect, 0);

  return {
    close: () => {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      clearTimeout(staleTimer);
      socket?.close();
      listener.onStatus("closed");
    },
    send,
  };
};
