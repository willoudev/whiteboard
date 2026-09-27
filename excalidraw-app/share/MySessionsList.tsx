import { useEffect, useState } from "react";

import {
  fetchActiveRooms,
  navigateToRoom,
  type ActiveRoom,
} from "../data/activeRooms";
import { getSessionHistory } from "../data/SessionHistory";

import "./ActiveSessionsList.scss";

/** Lets the creator (or any past participant) of a room jump straight back
 * into it while it's still active, without needing an access code — this
 * browser already holds the full invite link (encryption key included)
 * for every room it has ever created or joined, via SessionHistory.
 * Stays silent (renders nothing) while loading, on a server error, or when
 * there's simply nothing to show, so it never clutters the dialog. */
export const MySessionsList = () => {
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveRooms().then((rooms) => {
      if (!cancelled) {
        setActiveRooms(rooms);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!activeRooms || activeRooms.length === 0) {
    return null;
  }

  const activeRoomIds = new Set(activeRooms.map((room) => room.roomId));
  const mySessions = getSessionHistory().filter((entry) =>
    activeRoomIds.has(entry.roomId),
  );

  if (mySessions.length === 0) {
    return null;
  }

  return (
    <div className="ActiveSessionsList__section">
      <div className="ActiveSessionsList__header">Mes sessions actives</div>
      <ul className="ActiveSessionsList__list">
        {mySessions.map((entry) => {
          const room = activeRooms.find((r) => r.roomId === entry.roomId);
          return (
            <li key={entry.roomId}>
              <button
                type="button"
                className="ActiveSessionsList__item ActiveSessionsList__item--clickable"
                onClick={() => navigateToRoom(entry.link)}
              >
                <span className="ActiveSessionsList__item__name">
                  {room?.name ?? `${entry.roomId.slice(0, 8)}…`}
                </span>
                <span className="ActiveSessionsList__item__count">
                  {room?.count ?? 0} participant
                  {(room?.count ?? 0) > 1 ? "s" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
