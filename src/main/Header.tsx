import { invoke } from "@tauri-apps/api/core";
import {
  CloseIcon,
  EditPlugins,
  FullScreenIcon,
  MinimizeIcon,
  SettingsIcon,
} from "../icons/navbar";
import { Window } from "@tauri-apps/api/window";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

interface HeaderProps {
  appWin: Window | undefined;
  isMaximized: boolean;
  setIsMaximized: (m: boolean) => void;
  isEditMode: boolean;
  toggleEditMode: () => void;
  handleOpenSettingsClick: () => void
}
export function Header({
  appWin,
  isMaximized,
  setIsMaximized,
  isEditMode,
  handleOpenSettingsClick,
  toggleEditMode,
}: HeaderProps) {
  return (
    <header
      data-tauri-drag-region
      className={`flex justify-end gap-1 items-stretch ${isEditMode ? "bg-green-900" : "group-hover:visible invisible"
        } cursor-move`}
    >
      <button
        title="Open Settings"
        onClick={() => {
          console.info("e")
          handleOpenSettingsClick()
        }}
        className="px-2 cursor-pointer hover:bg-white/10"
      >
        <SettingsIcon className="w-6 h-6" />
      </button>
      <button
        onClick={() => toggleEditMode()}
        title="Change Plugin Arrangement"
        className={`px-2 cursor-pointer  ${isEditMode ? "bg-green-600 hover:bg-green-500" : "hover:bg-white/10"
          }`}
      >
        <EditPlugins className="w-6 h-6" editing={isEditMode} />
      </button>

      <div className="flex-1 flex  flex-row items-stretch pointer-events-none">
        {isEditMode && (
          <div className="pointer-events-none text-sm inline-flex flex-row ">
            <i className=" self-center">Edit Mode Active</i>
            <a
              onClick={() =>
                openUrl(
                  "https://cmdr-wdx.github.io/elite-dangerous-plugin-framework/guide/todo.html"
                )
              }
              title="Open Help Page"
              className="px-2 cursor-pointer pointer-events-auto hover:bg-green-500 flex"
            >
              <span className=" self-center">?</span>
            </a>
          </div>
        )}
      </div>
      <button
        title="Minimize"
        className="px-2 cursor-pointer hover:bg-blue-900"
      >
        <MinimizeIcon
          className="w-6 h-6"
          onClick={() => {
            if (!appWin) {
              return;
            }
            appWin.minimize();
          }}
        />
      </button>
      <button
        title="Maximize"
        className="px-2 cursor-pointer hover:bg-blue-900"
      >
        <FullScreenIcon
          className="w-6 h-6"
          isMaximized={isMaximized}
          onClick={() => {
            if (!appWin) {
              return;
            }
            appWin.maximize().then(async () => {
              setIsMaximized(await appWin.isMaximized());
            });
          }}
        />
      </button>
      <button
        onClick={() => {
          if (!appWin) {
            return;
          }
          appWin.close();
        }}
        className="px-2 cursor-pointer hover:bg-red-900"
      >
        <CloseIcon className="w-6 h-6" />
      </button>
    </header>
  );
}
