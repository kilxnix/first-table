type Recognizer = { start(): void; stop(): void };
export const speechAvailable = (): boolean =>
  typeof window !== "undefined" && !!((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

export function createRecognizer(onResult: (text: string) => void, onEnd: () => void): Recognizer | null {
  if (!speechAvailable()) return null;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.continuous = true; rec.interimResults = false; rec.lang = "en-US";
  let buffer = "";
  rec.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) buffer += e.results[i][0].transcript; };
  rec.onend = () => { if (buffer.trim()) onResult(buffer.trim()); onEnd(); };
  return { start: () => { buffer = ""; rec.start(); }, stop: () => rec.stop() };
}
