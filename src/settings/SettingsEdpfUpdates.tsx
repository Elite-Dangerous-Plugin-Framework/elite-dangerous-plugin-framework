import { useTranslation } from "react-i18next";
import {
  CommandWrapper,
  EncryptedCommandResponse,
} from "../commands/commandWrapper";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { IconCannotUpdate, IconDownload, IconUpToDate } from "../icons/updates";
import { Channel, invoke } from "@tauri-apps/api/core";

type UpdateState =
  | { type: "loading" }
  | { type: "noUpdate" }
  | { type: "update"; currentVersion: string; newVersion: string }
  | { type: "updating"; bytes: number; total: number }
  | { type: "managedBySystem"; toolingName: string };

function UpdateStateFragment({ updateState, startUpdate }: { updateState: UpdateState, startUpdate: () => void }) {
  switch (updateState.type) {
    case "loading":
      return (
        <div className="p-2 w-full gap-2 items-center inline-flex flex-row animate-pulse">
          <IconDownload className=" w-12 h-12" />
          <div>
            <p className="text-xl">Looking for Updates…</p>
          </div>
        </div>
      );
    case "noUpdate":
      return (
        <div className="p-2 w-full gap-2 items-center inline-flex flex-row">
          <IconUpToDate className=" w-12 h-12" />
          <div>
            <p className="text-xl">There are no updates</p>
            <p className="text-sm">Your Version is up to date.</p>
          </div>
        </div>
      );
    case "update":
      return (
        <div className="p-2 w-full gap-2 items-center inline-flex flex-row">
          <IconDownload className=" text-green-500 w-16 h-16" />
          <div>
            <p className="">There is an update available!</p>
            <p className="text-sm text-gray-400">
              <code>{updateState.currentVersion}</code> is updated to{" "}
              <code className="text-green-400 animate-pulse">
                {updateState.newVersion}
              </code>
            </p>
            <button onClick={() => startUpdate()} className=" cursor-pointer p-2 border-2 w-full border-green-600 text-green-600 rounded-sm hover:text-white hover:bg-green-700 hover:border-green-700">
              Install and Update
            </button>
          </div>
        </div>
      );
    case "updating":
      return (
        <div className="p-2 w-full gap-2 items-center inline-flex flex-row">
          <IconDownload className=" text-green-500 w-16 h-16" />
          <div className="w-full">
            <p className="">Downloading Update… <span>[{Math.round(10 * updateState.bytes / 1024 / 1024) / 10}MiB / {Math.round(10 * updateState.total / 1024 / 1024) / 10}MiB]</span></p>
            <div className="w-full h-6 border-2 border-slate-700 rounded-lg flex flex-row">
              <div
                style={{
                  width: `${(100 * updateState.bytes) / updateState.total}%`,
                }}
                className="bg-green-800 h-full rounded-l-lg animate-pulse"
              ></div>
            </div>
          </div>
        </div>
      );
    case "managedBySystem":
      return (
        <div className="p-2 w-full gap-2 italic items-center inline-flex flex-row">
          <IconCannotUpdate className=" w-12 h-12" />
          <div>
            <p className="text-sm text-gray-500">
              This installation has autoupdates disabled because updates are
              managed by your system's package manager:
              <span className=" text-white not-italic">
                {updateState.toolingName}
              </span>
            </p>
          </div>
        </div>
      );
  }
}

const releaseChannelZod = z.enum(["stable", "prerelease", "merged"]);
type releaseChannel = z.infer<typeof releaseChannelZod>;
export function SettingsEdpfUpdates({ cmd }: { cmd: CommandWrapper }) {
  const { t } = useTranslation("settings");

  const [releaseChannel, setReleaseChannel] = useState<releaseChannel | null>(
    null
  );

  const [updateState, setUpdateState] = useState<UpdateState>({
    type: "loading",
  });

  useEffect(() => {
    cmd.readSetting("core", "core.edpf.updater.releaseChannel").then((e) => {
      if (e.success) {
        const data = releaseChannelZod.safeParse(e.data.value);
        setReleaseChannel(data.success ? data.data : "stable");
      } else {
        setReleaseChannel("stable");
      }
    });
  }, []);

  useEffect(() => {
    if (releaseChannel === null) {
      return;
    }
    (async () => {
      setUpdateState({ type: "loading" });
      const { iv, payload } = await cmd.encryptPayload({
        channel: releaseChannel,
      });
      const r = await invoke("check_update_edpf", { iv, payload });
      const encryptedResp = EncryptedCommandResponse.parse(r);
      if (!encryptedResp.success) {
        console.error(encryptedResp.reason);
        return;
      }

      const resp = z
        .object({ new_version: z.string(), current_version: z.string() })
        .nullable()
        .parse(
          await cmd.decryptPayload(encryptedResp.iv, encryptedResp.payload)
        );
      if (resp === null) {
        setUpdateState({ type: "noUpdate" });
      } else {
        setUpdateState({
          type: "update",
          newVersion: resp.new_version,
          currentVersion: resp.current_version,
        });
      }
    })();
  }, [releaseChannel]);

  const startUpdate = useCallback(async () => {
    const { iv, payload } = await cmd.encryptPayload({})

    const responseZod = z.discriminatedUnion("type", [
      z.object({ type: z.literal("Started"), content_len: z.number() }),
      z.object({ type: z.literal("Progress"), chunk_len: z.number() }),
      z.object({ type: z.literal("Finished") }),
    ])

    const onEvent = new Channel<z.infer<typeof responseZod>>()
    let totalLen = 0
    let currentLen = 0
    onEvent.onmessage = (m) => {
      m = responseZod.parse(m)
      switch (m.type) {
        case "Started":
          totalLen = m.content_len
          return
        case "Progress":
          currentLen += m.chunk_len
          setUpdateState({ type: "updating", bytes: Math.round(currentLen), total: totalLen })
          return
        case "Finished":
        // noop. 
      }
    }

    invoke("commit_update_edpf", { iv, payload, onEvent })
  }, [])

  return (
    <>
      <UpdateStateFragment startUpdate={startUpdate} updateState={updateState} />
      <section id="updates-channel-selection">
        <h3 className="text-sm">{t("update.channel.title")}</h3>
        <div className=" inline-flex flex-row flex-wrap gap-1 ">
          {(["stable", "prerelease", "merged"] as const).map((e) => (
            <button
              className={`py-1 px-2 rounded-lg cursor-pointer  ${e === releaseChannel
                ? "bg-green-700"
                : "bg-gray-800 opacity-100 hover:opacity-85"
                }`}
              onClick={async () => {
                const resp = await cmd.writeSetting(
                  "core",
                  "core.edpf.updater.releaseChannel",
                  e
                );
                if (resp.success) {
                  const data = releaseChannelZod.safeParse(resp.data.value);
                  setReleaseChannel(data.success ? data.data : "stable");
                } else {
                  console.error(resp.reason);
                  setReleaseChannel("stable");
                }
              }}
              key={e}
            >
              {t(`update.channel.${e}` as any)}
            </button>
          ))}
        </div>
        {releaseChannel && (
          <p className="text-xs italic my-1 opacity-30">
            {t(("update.channel." + releaseChannel + "Text") as any)}
          </p>
        )}
      </section>
    </>
  );
}
