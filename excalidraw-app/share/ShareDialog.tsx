import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import {
  copyIcon,
  playerPlayIcon,
  playerStopFilledIcon,
  share,
  shareIOS,
  shareWindows,
} from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useCopyStatus } from "@excalidraw/excalidraw/hooks/useCopiedIndicator";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { KEYS, getFrame } from "@excalidraw/common";
import { useEffect, useRef, useState } from "react";

import { atom, useAtom, useAtomValue } from "../app-jotai";
import { activeRoomInfoAtom, activeRoomLinkAtom } from "../collab/Collab";
import { fetchActiveRooms, verifyAccessCode } from "../data/activeRooms";

import { ActiveSessionsList } from "./ActiveSessionsList";
import { MySessionsList } from "./MySessionsList";

import type { ActiveRoom } from "../data/activeRooms";

import "./ShareDialog.scss";
import { QRCode } from "./QRCode";

import type { CollabAPI } from "../collab/Collab";

type ShareDialogType = "share" | "collaborationOnly";

export const shareDialogStateAtom = atom<
  { isOpen: false } | { isOpen: true; type: ShareDialogType }
>({ isOpen: false });

export const wrongAccessCodeAtom = atom(false);

const getShareIcon = () => {
  const navigator = window.navigator as any;
  const isAppleBrowser = /Apple/.test(navigator.vendor);
  const isWindowsBrowser = navigator.appVersion.indexOf("Win") !== -1;

  if (isAppleBrowser) {
    return shareIOS;
  } else if (isWindowsBrowser) {
    return shareWindows;
  }

  return share;
};

export type ShareDialogProps = {
  collabAPI: CollabAPI | null;
  handleClose: () => void;
  type: ShareDialogType;
};

const ActiveRoomDialog = ({
  collabAPI,
  activeRoomLink,
  handleClose,
}: {
  collabAPI: CollabAPI;
  activeRoomLink: string;
  handleClose: () => void;
}) => {
  const { t } = useI18n();
  const [, setJustCopied] = useState(false);
  const timerRef = useRef<number>(0);
  const ref = useRef<HTMLInputElement>(null);
  const isShareSupported = "share" in navigator;
  const { onCopy, copyStatus } = useCopyStatus();
  const { onCopy: onCopyAccessCode, copyStatus: accessCodeCopyStatus } =
    useCopyStatus();
  const roomInfo = useAtomValue(activeRoomInfoAtom);

  const copyRoomLink = async () => {
    try {
      await copyTextToSystemClipboard(activeRoomLink);
    } catch (e) {
      collabAPI.setCollabError(t("errors.copyToSystemClipboardFailed"));
    }

    setJustCopied(true);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setJustCopied(false);
    }, 3000);

    ref.current?.select();
  };

  const copyAccessCode = async () => {
    if (!roomInfo?.accessCode) {
      return;
    }
    try {
      await copyTextToSystemClipboard(roomInfo.accessCode);
    } catch (e) {
      collabAPI.setCollabError(t("errors.copyToSystemClipboardFailed"));
    }
  };

  const shareRoomLink = async () => {
    try {
      await navigator.share({
        title: t("roomDialog.shareTitle"),
        text: t("roomDialog.shareTitle"),
        url: activeRoomLink,
      });
    } catch (error: any) {
      // Just ignore.
    }
  };

  return (
    <>
      <h3 className="ShareDialog__active__header">
        {roomInfo
          ? roomInfo.name
          : t("labels.liveCollaboration").replace(/\./g, "")}
      </h3>
      {roomInfo && (
        <div className="ShareDialog__active__creator">
          Créée par {roomInfo.creatorName}
        </div>
      )}
      <TextField
        defaultValue={collabAPI.getUsername()}
        placeholder="Your name"
        label="Your name"
        onChange={collabAPI.setUsername}
        onKeyDown={(event) => event.key === KEYS.ENTER && handleClose()}
      />
      <div className="ShareDialog__active__linkRow">
        <TextField
          ref={ref}
          label="Link"
          readonly
          fullWidth
          value={activeRoomLink}
        />
        {isShareSupported && (
          <FilledButton
            size="large"
            variant="icon"
            label="Share"
            icon={getShareIcon()}
            className="ShareDialog__active__share"
            onClick={shareRoomLink}
          />
        )}
        <FilledButton
          size="large"
          label={t("buttons.copyLink")}
          icon={copyIcon}
          status={copyStatus}
          onClick={() => {
            copyRoomLink();
            onCopy();
          }}
        />
      </div>
      {roomInfo?.accessCode && (
        <div className="ShareDialog__active__linkRow">
          <TextField
            label="Code d'accès"
            readonly
            fullWidth
            value={roomInfo.accessCode}
          />
          <FilledButton
            size="large"
            label={t("buttons.copyLink")}
            icon={copyIcon}
            status={accessCodeCopyStatus}
            onClick={() => {
              copyAccessCode();
              onCopyAccessCode();
            }}
          />
        </div>
      )}
      <QRCode value={activeRoomLink} />
      <div className="ShareDialog__active__description">
        <p>
          <span
            role="img"
            aria-hidden="true"
            className="ShareDialog__active__description__emoji"
          >
            🔒{" "}
          </span>
          {t("roomDialog.desc_privacy")}
        </p>
        <p>
          <strong>Quitter la session :</strong> {t("roomDialog.desc_exitSession")}
        </p>
        <p>
          <strong>Fermer pour tout le monde :</strong> met fin à la session
          pour tous les participants connectés.
        </p>
      </div>

      <div
        className="ShareDialog__active__actions"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <FilledButton
          size="large"
          label="Fermer (continuer à dessiner)"
          onClick={handleClose}
        />
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <FilledButton
            size="large"
            variant="outlined"
            label="Quitter la session"
            onClick={() => {
              trackEvent("share", "room left");
              collabAPI.stopCollaboration(false);
              if (!collabAPI.isCollaborating()) {
                handleClose();
              }
            }}
          />
          <FilledButton
            size="large"
            variant="outlined"
            color="danger"
            label="Fermer pour tout le monde"
            icon={playerStopFilledIcon}
            onClick={() => {
              trackEvent("share", "room closed for everyone");
              collabAPI.closeRoomForEveryone();
              handleClose();
            }}
          />
        </div>
      </div>
    </>
  );
};

const ShareDialogPicker = (props: ShareDialogProps) => {
  const { t } = useI18n();

  const { collabAPI } = props;

  const [mode, setMode] = useState<"idle" | "starting" | "joining">("idle");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [creatorNameInput, setCreatorNameInput] = useState(
    () => collabAPI?.getUsername() ?? "",
  );
  const [codeRooms, setCodeRooms] = useState<ActiveRoom[] | null>(null);
  const [codeRoomsLoading, setCodeRoomsLoading] = useState(false);
  const [codeRoomId, setCodeRoomId] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeVerifying, setCodeVerifying] = useState(false);
  const [, setWrongAccessCode] = useAtom(wrongAccessCodeAtom);

  // "rooms actives" (server-wide, other people's sessions) stays hidden
  // unless MAJ (Shift) + 9 is pressed three times in a row while this
  // dialog is open — resets to hidden every time the dialog is reopened,
  // since this component remounts fresh then
  const [showActiveSessions, setShowActiveSessions] = useState(false);
  const shiftNineCountRef = useRef(0);
  const lastShiftNineRef = useRef(0);

  useEffect(() => {
    if (props.type !== "share" || showActiveSessions) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.shiftKey && event.code === "Digit9")) {
        return;
      }
      const now = Date.now();
      if (now - lastShiftNineRef.current > 1500) {
        shiftNineCountRef.current = 0;
      }
      lastShiftNineRef.current = now;
      shiftNineCountRef.current += 1;
      if (shiftNineCountRef.current >= 3) {
        setShowActiveSessions(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.type, showActiveSessions]);

  useEffect(() => {
    if (mode !== "joining") {
      return;
    }
    let cancelled = false;
    setCodeRoomsLoading(true);
    fetchActiveRooms().then((rooms) => {
      if (!cancelled) {
        setCodeRooms(rooms);
        setCodeRoomsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!collabAPI) {
    return null;
  }

  const handleStart = () => {
    trackEvent("share", "room creation", `ui (${getFrame()})`);
    if (creatorNameInput.trim()) {
      collabAPI.setUsername(creatorNameInput);
    }
    collabAPI.startCollaboration(null, {
      roomName: roomNameInput,
      creatorName: creatorNameInput,
    });
  };

  const handleJoinWithCode = async () => {
    const code = codeInput.trim();
    if (!codeRoomId || !code || codeVerifying) {
      return;
    }
    setCodeVerifying(true);
    const result = await verifyAccessCode(codeRoomId, code);
    setCodeVerifying(false);
    if (result.success) {
      window.location.href = result.link;
    } else {
      setWrongAccessCode(true);
    }
  };

  return (
    <>
      <div className="ShareDialog__picker__header">
        {t("labels.liveCollaboration").replace(/\./g, "")}
      </div>

      <div className="ShareDialog__picker__description">
        <div style={{ marginBottom: "1em" }}>{t("roomDialog.desc_intro")}</div>
        {t("roomDialog.desc_privacy")}
      </div>

      <div
        className="ShareDialog__picker__button"
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
      >
        <FilledButton
          size="large"
          label="Démarrer une session"
          icon={playerPlayIcon}
          onClick={() =>
            setMode((current) => (current === "starting" ? "idle" : "starting"))
          }
        />
        <FilledButton
          size="large"
          variant="outlined"
          label="Se connecter à une session en cours"
          onClick={() =>
            setMode((current) => (current === "joining" ? "idle" : "joining"))
          }
        />
      </div>

      <MySessionsList />

      {mode === "starting" && (
        <div
          className="ShareDialog__picker__form"
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <TextField
            label="Nom de la session"
            placeholder="Ex : Réunion équipe produit"
            value={roomNameInput}
            onChange={setRoomNameInput}
            onKeyDown={(event) => event.key === KEYS.ENTER && handleStart()}
          />
          <TextField
            label="Votre nom"
            placeholder="Votre nom"
            value={creatorNameInput}
            onChange={setCreatorNameInput}
            onKeyDown={(event) => event.key === KEYS.ENTER && handleStart()}
          />
          <FilledButton
            size="large"
            label="Démarrer"
            icon={playerPlayIcon}
            onClick={handleStart}
          />
        </div>
      )}

      {mode === "joining" && (
        <div
          className="ShareDialog__picker__form"
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <div className="ShareDialog__picker__codeJoinLabel">
            Choisis la session et saisis son code d'accès. (Si tu as
            directement le lien d'invitation, ouvre-le simplement dans ton
            navigateur pour rejoindre.)
          </div>
          {codeRoomsLoading ? (
            <div className="ActiveSessionsList__loading">
              {t("labels.loadingScene")}
            </div>
          ) : !codeRooms || codeRooms.length === 0 ? (
            <div className="ActiveSessionsList__empty">
              Aucune session active pour le moment.
            </div>
          ) : (
            <>
              <select
                className="ShareDialog__picker__select"
                value={codeRoomId}
                onChange={(event) => setCodeRoomId(event.target.value)}
              >
                <option value="">Choisir une session…</option>
                {codeRooms.map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.name ?? `${room.roomId.slice(0, 8)}…`}
                    {room.creatorName ? ` · ${room.creatorName}` : ""}
                  </option>
                ))}
              </select>
              <TextField
                label="Code d'accès"
                placeholder="Ex : 123456"
                value={codeInput}
                onChange={setCodeInput}
                onKeyDown={(event) =>
                  event.key === KEYS.ENTER && handleJoinWithCode()
                }
              />
              <FilledButton
                size="large"
                label={codeVerifying ? "Vérification…" : "Rejoindre avec le code"}
                onClick={handleJoinWithCode}
              />
            </>
          )}
        </div>
      )}

      {showActiveSessions && (
        <>
          <div className="ShareDialog__separator">
            <span>{t("shareDialog.or")}</span>
          </div>
          <ActiveSessionsList />
        </>
      )}
    </>
  );
};

const ShareDialogInner = (props: ShareDialogProps) => {
  const activeRoomLink = useAtomValue(activeRoomLinkAtom);

  return (
    <Dialog size="small" onCloseRequest={props.handleClose} title={false}>
      <div className="ShareDialog">
        {props.collabAPI && activeRoomLink ? (
          <ActiveRoomDialog
            collabAPI={props.collabAPI}
            activeRoomLink={activeRoomLink}
            handleClose={props.handleClose}
          />
        ) : (
          <ShareDialogPicker {...props} />
        )}
      </div>
    </Dialog>
  );
};

const WrongAccessCodeDialog = ({ onClose }: { onClose: () => void }) => (
  <Dialog
    size="small"
    onCloseRequest={onClose}
    title="Code d'accès incorrect"
  >
    <p>
      Le code d'accès saisi ne correspond pas à cette session. Vérifie-le et
      réessaie.
    </p>
    <div style={{ display: "flex", justifyContent: "center" }}>
      <FilledButton size="large" label="Fermer" onClick={onClose} />
    </div>
  </Dialog>
);

export const ShareDialog = (props: { collabAPI: CollabAPI | null }) => {
  const [shareDialogState, setShareDialogState] = useAtom(shareDialogStateAtom);
  const [wrongAccessCode, setWrongAccessCode] = useAtom(wrongAccessCodeAtom);

  const { openDialog } = useUIAppState();

  useEffect(() => {
    if (openDialog) {
      setShareDialogState({ isOpen: false });
    }
  }, [openDialog, setShareDialogState]);

  return (
    <>
      {shareDialogState.isOpen && (
        <ShareDialogInner
          handleClose={() => setShareDialogState({ isOpen: false })}
          collabAPI={props.collabAPI}
          type={shareDialogState.type}
        />
      )}
      {wrongAccessCode && (
        <WrongAccessCodeDialog onClose={() => setWrongAccessCode(false)} />
      )}
    </>
  );
};
