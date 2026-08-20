import { useCallback, useEffect, useRef, useState } from "react";
import { SERVER_WS } from "../config";
import * as api from "../api";
import { CampaignState, DMScreenState, Report, ServerFrame, ThreadMessage } from "../types";

export function useTableSocket(campaignId: number) {
  const [state, setState] = useState<CampaignState | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [dmScreen, setDmScreen] = useState<DMScreenState | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [sceneActive, setSceneActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    let ws: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(`${SERVER_WS}/ws/${campaignId}`);
      wsRef.current = ws;
      ws.onopen = () => alive && setConnected(true);
      ws.onclose = () => { if (alive) { setConnected(false); retry = setTimeout(connect, 1500); } };
      ws.onmessage = (ev) => {
        if (!alive) return;
        const frame: ServerFrame = JSON.parse(ev.data as string);
        switch (frame.type) {
          case "hello":
            setState(frame.campaign);
            setThread(frame.campaign.thread);
            setDmScreen(frame.campaign.dm_screen);
            setSceneActive(frame.campaign.scene_active);
            break;
          case "message":
            setThread((t) => [...t, frame.message]);
            if (frame.message.seat) setTyping((ty) => { const n = { ...ty }; delete n[frame.message.seat!]; return n; });
            break;
          case "typing":
            setTyping((ty) => ({ ...ty, [frame.seat]: frame.name }));
            break;
          case "typing_stop":
            setTyping((ty) => { const n = { ...ty }; delete n[frame.seat]; return n; });
            break;
          case "dm_screen":
            setDmScreen(frame.dm_screen);
            break;
          case "scene":
            setSceneActive(frame.status === "started");
            if (frame.status === "ended" && frame.report) setReport(frame.report);
            break;
          case "error":
            setError(frame.detail);
            break;
        }
      };
    };
    connect();
    return () => { alive = false; clearTimeout(retry); ws?.close(); };
  }, [campaignId]);

  const send = useCallback((obj: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(obj));
  }, []);
  const sendDmInput = useCallback((text: string, mode: "voice" | "text") => send({ type: "dm_input", text, mode }), [send]);
  const sendRoll = useCallback((formula: string, label: string) => send({ type: "roll", formula, label }), [send]);
  const startScene = useCallback(() => api.startScene(campaignId), [campaignId]);
  const endScene = useCallback(() => api.endScene(campaignId), [campaignId]);
  const dismissReport = useCallback(() => setReport(null), []);

  return { state, thread, typing, dmScreen, report, sceneActive, connected, error,
           sendDmInput, sendRoll, startScene, endScene, dismissReport };
}
