import { createIcon, eyeIcon } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { LanguageList } from "../app-language/LanguageList";
import { APP_VERSION } from "../app_constants";
import { insertKanbanBoard } from "../kanban/insert";
import { insertMindmapBoard } from "../mindmap/insert";

import { saveDebugState } from "./DebugCanvas";

const tablerIconOpts = {
  width: 24,
  height: 24,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const kanbanIcon = createIcon(
  <g>
    <rect x="4" y="4" width="4.5" height="16" rx="1" />
    <rect x="10" y="4" width="4.5" height="10" rx="1" />
    <rect x="16" y="4" width="4.5" height="13" rx="1" />
  </g>,
  tablerIconOpts,
);

const mindmapIcon = createIcon(
  <g>
    <circle cx="12" cy="12" r="2" />
    <circle cx="4" cy="6" r="2" />
    <circle cx="4" cy="18" r="2" />
    <circle cx="20" cy="6" r="2" />
    <circle cx="20" cy="18" r="2" />
    <path d="M10 10.5L6 7M10 13.5L6 17M14 10.5L18 7M14 13.5L18 17" />
  </g>,
  tablerIconOpts,
);

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  theme: Theme | "system";
  refresh: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}> = React.memo((props) => {
  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      {props.excalidrawAPI && (
        <>
          <MainMenu.Item
            icon={kanbanIcon}
            onSelect={() => insertKanbanBoard(props.excalidrawAPI!)}
          >
            Insérer un kanban
          </MainMenu.Item>
          <MainMenu.Item
            icon={mindmapIcon}
            onSelect={() => insertMindmapBoard(props.excalidrawAPI!)}
          >
            Insérer un mindmap
          </MainMenu.Item>
        </>
      )}
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      {isDevEnv() && (
        <MainMenu.Item
          icon={eyeIcon}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={props.theme} />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
      <MainMenu.Separator />
      <MainMenu.ItemCustom>
        <div
          style={{
            width: "100%",
            textAlign: "center",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.03em",
            color: "var(--color-gray-40)",
          }}
        >
          {APP_VERSION}
        </div>
      </MainMenu.ItemCustom>
    </MainMenu>
  );
});
