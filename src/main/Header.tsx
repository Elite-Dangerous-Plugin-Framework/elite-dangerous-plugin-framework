import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CloseIcon,
  EditPlugins,
  FullScreenIcon,
  MinimizeIcon,
  SettingsIcon,
} from "../icons/navbar";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  isMaximized: boolean;
  isEditMode: boolean;
  toggleEditMode: () => void;
  handleOpenSettingsClick: () => void;
}
export function Header({
  isMaximized,
  isEditMode,
  handleOpenSettingsClick,
  toggleEditMode,
}: HeaderProps) {

  const { t } = useTranslation("main")

  return (
    <header
      data-tauri-drag-region
      className={`flex justify-end gap-1 items-stretch ${isEditMode ? "bg-green-900" : "group-hover:visible invisible"
        } cursor-move`}
    >
      <button
        title={t("header.openSettings")}
        onClick={() => {
          console.info("e");
          handleOpenSettingsClick();
        }}
        className="px-2 cursor-pointer hover:bg-white/10"
      >
        <SettingsIcon className="w-6 h-6" />
      </button>
      <button
        onClick={() => toggleEditMode()}
        title={t("header.openEditMode")}
        className={`px-2 cursor-pointer  ${isEditMode ? "bg-green-600 hover:bg-green-500" : "hover:bg-white/10"}`}
      >
        <EditPlugins className="w-6 h-6" editing={isEditMode} />
      </button>

      <div className="flex-1 flex  flex-row items-stretch pointer-events-none">
        {isEditMode && (
          <div className="pointer-events-none text-sm inline-flex flex-row ">
            <i className=" self-center">{t("editModeActive")}</i>
            <a
              onClick={() =>
                openUrl(
                  "https://elite-dangerous-plugin-framework.github.io/users/editMode"
                )
              }
              title={t("header.editModeHelpPage")}
              className="px-2 cursor-pointer pointer-events-auto hover:bg-green-500 flex"
            >
              <span className=" self-center">?</span>
            </a>
          </div>
        )}
      </div>
      <button
        title={t("header.minimize")}
        className="px-2 cursor-pointer hover:bg-blue-900"
      >
        <MinimizeIcon
          className="w-6 h-6"
          onClick={() => {
            getCurrentWindow().minimize()
          }}
        />
      </button>
      <button
        title={t("header.maximize")}
        className="px-2 cursor-pointer hover:bg-blue-900"
      >
        <FullScreenIcon
          className="w-6 h-6"
          isMaximized={isMaximized}
          onClick={async () => {
            const appWin = getCurrentWindow()
            const maximized = await appWin.isMaximized()
            maximized ? await appWin.unmaximize() : await appWin.maximize()
          }}
        />
      </button>
      <button
        onClick={() => {
          getCurrentWindow().close()
        }}
        className="px-2 cursor-pointer hover:bg-red-900"
      >
        <CloseIcon className="w-6 h-6" />
      </button>
    </header>
  );
}
