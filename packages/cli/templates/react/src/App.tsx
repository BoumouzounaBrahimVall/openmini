import { mini } from "@openmini/runtime";
import { useEffect, useState } from "react";

/**
 * {{APP_NAME}} — an OpenMini mini-app. Plain React: use any UI library you
 * like. `mini.*` is the bridge to the host app (storage, toast, and more —
 * see the manifest for what this app is allowed to do).
 */
export function App() {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    mini.lifecycle.onLaunch((boot) =>
      console.debug("launched as", boot?.appId),
    );
    void mini.storage.get("note").then(setSaved);
  }, []);

  async function save() {
    await mini.storage.set("note", note);
    setSaved(note);
    await mini.ui.showToast({ message: "Saved!" });
  }

  return (
    <main>
      <h1>{{ APP_NAME }}</h1>
      <p>Saved note: {saved ?? "(nothing yet)"}</p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Type something…"
      />
      <button onClick={() => void save()}>Save via mini.storage</button>
    </main>
  );
}
