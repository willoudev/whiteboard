import { getCollaborationLink } from "./index";

/** Navigates to a room link with a real page reload rather than a plain
 * `location.href = link` assignment. When the link only differs from the
 * current URL by its hash (the common case here — same origin, same
 * path, just a different #room=...), assigning `.href` alone does NOT
 * trigger any network request: the browser treats it as a same-document
 * hash change, so it can't pick up a JS/service-worker update that
 * shipped after this tab was opened, and joining then depends entirely
 * on the app's own hashchange handler doing the right thing. A forced
 * reload sidesteps all of that by going through the same well-tested
 * "fresh load with a room link in the URL" path a freshly opened invite
 * link already takes. */
export const navigateToRoom = (link: string) => {
  window.location.href = link;
  window.location.reload();
};

export type ActiveRoom = {
  roomId: string;
  count: number;
  name: string | null;
  creatorName: string | null;
};

/** Never includes the E2E key or any access code — see excalidraw-room's
 * GET /rooms. Joining a listed room still needs either the invite link
 * or a verified access code (see verifyAccessCode below). */
export const fetchActiveRooms = async (): Promise<ActiveRoom[] | null> => {
  try {
    const res = await fetch(`${import.meta.env.VITE_APP_WS_SERVER_URL}/rooms`);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return null;
  }
};

/** Checks a room's access code against the server over a throwaway
 * socket connection (closed as soon as we get an answer). On success,
 * the server hands back the room's E2E key so we can build the same
 * kind of link a direct invite would have given us — the caller then
 * joins through the normal link-opening flow, nothing special about
 * this connection sticks around. */
export const verifyAccessCode = (
  roomId: string,
  code: string,
): Promise<{ success: true; link: string } | { success: false }> => {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { success: true; link: string } | { success: false }) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      socket?.close();
      resolve(result);
    };

    let socket: import("socket.io-client").Socket | null = null;

    const timeoutId = window.setTimeout(() => finish({ success: false }), 8000);

    import("socket.io-client").then(({ default: socketIOClient }) => {
      if (settled) {
        return;
      }
      socket = socketIOClient(import.meta.env.VITE_APP_WS_SERVER_URL, {
        transports: ["websocket", "polling"],
      });
      socket.on("connect_error", () => finish({ success: false }));
      socket.on("access-code-invalid", () => finish({ success: false }));
      socket.on("access-code-verified", (data: { roomKey: string }) => {
        finish({
          success: true,
          link: getCollaborationLink({ roomId, roomKey: data.roomKey }),
        });
      });
      socket.emit("join-with-code", { roomID: roomId, code });
    });
  });
};
