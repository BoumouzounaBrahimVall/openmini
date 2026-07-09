import { BridgeError, mini, type SystemInfo } from "@openmini/runtime";
import { useEffect, useState } from "react";

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

/**
 * OpenMini example mini-app. Deliberately exercises EVERY MVP bridge API:
 * storage (persisted todos), toast, system.getInfo, network.request (allowed
 * AND deliberately blocked origins), navigation.close, and lifecycle hooks.
 * Plain React — copy freely.
 */
export function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [appId, setAppId] = useState("");
  const [version, setVersion] = useState("");
  const [shows, setShows] = useState(0);
  const [netError, setNetError] = useState("");
  const [greeting, setGreeting] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mini.lifecycle.onLaunch((boot) => {
      setAppId(boot?.appId ?? "unknown");
      setVersion(boot?.appVersion ?? "");
    });
    const offShow = mini.lifecycle.onShow(() => setShows((n) => n + 1));
    void mini.storage.get("todos").then((raw) => {
      if (raw !== null) setTodos(JSON.parse(raw) as Todo[]);
    });
    void mini.system.getInfo().then(setInfo);
    return offShow;
  }, []);

  async function persist(next: Todo[], toast?: string) {
    setTodos(next);
    await mini.storage.set("todos", JSON.stringify(next));
    if (toast !== undefined) await mini.ui.showToast({ message: toast });
  }

  async function add() {
    if (text.trim() === "") return;
    await persist(
      [...todos, { id: crypto.randomUUID(), text: text.trim(), done: false }],
      "Saved!",
    );
    setText("");
  }

  async function clearAll() {
    setTodos([]);
    await mini.storage.remove("todos");
    await mini.ui.showToast({ message: "All todos removed" });
  }

  async function suggest() {
    setBusy(true);
    setNetError("");
    try {
      const response = await mini.request({
        url: "https://dummyjson.com/todos/random",
      });
      const data = JSON.parse(response.body) as { todo?: string };
      await persist([
        ...todos,
        {
          id: crypto.randomUUID(),
          text: data.todo ?? "(no suggestion)",
          done: false,
        },
      ]);
    } catch (error) {
      setNetError(
        error instanceof BridgeError
          ? `${error.code}: ${error.message}`
          : String(error),
      );
    } finally {
      setBusy(false);
    }
  }

  async function greet() {
    setGreeting("");
    try {
      // Host-defined API (bridge-protocol §5.1): the playground registers
      // "hostGreeting" with request/response schemas via defineHostApi.
      const res = await mini.host.invoke<{ message: string }>("hostGreeting", {
        who: "todo mini-app",
      });
      setGreeting(res.message);
      await mini.ui.showToast({ message: res.message });
    } catch (error) {
      setGreeting(
        error instanceof BridgeError
          ? `${error.code}: ${error.message}`
          : String(error),
      );
    }
  }

  async function tryBlockedOrigin() {
    setNetError("");
    try {
      await mini.request({ url: "https://example.com/" });
      setNetError("unexpected: the call was NOT blocked");
    } catch (error) {
      // Expected: https://example.com is not in allowedDomains.
      setNetError(
        error instanceof BridgeError
          ? `${error.code}: ${error.message}`
          : String(error),
      );
    }
  }

  return (
    <main>
      <header>
        <h1>OpenMini Todo</h1>
        <p id="boot">
          {appId}
          {version !== "" && ` v${version}`} · shown {shows}×
        </p>
      </header>

      <div className="row">
        <input
          id="new-todo"
          value={text}
          placeholder="What needs doing?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <button id="add" onClick={() => void add()}>
          Add
        </button>
      </div>

      <ul id="todos">
        {todos.map((todo) => (
          <li key={todo.id} className={todo.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() =>
                  void persist(
                    todos.map((t) =>
                      t.id === todo.id ? { ...t, done: !t.done } : t,
                    ),
                  )
                }
              />
              {todo.text}
            </label>
          </li>
        ))}
        {todos.length === 0 && (
          <li className="empty">Nothing yet — add one above.</li>
        )}
      </ul>

      <div className="row">
        <button id="suggest" disabled={busy} onClick={() => void suggest()}>
          Suggest (allowed origin)
        </button>
        <button
          id="blocked"
          className="secondary"
          onClick={() => void tryBlockedOrigin()}
        >
          Try undeclared origin
        </button>
        <button
          id="clear"
          className="secondary"
          onClick={() => void clearAll()}
        >
          Clear
        </button>
        <button id="greet" className="secondary" onClick={() => void greet()}>
          Greet host (custom API)
        </button>
      </div>
      {netError !== "" && <p id="net-error">{netError}</p>}
      {greeting !== "" && <p id="greeting">{greeting}</p>}

      <footer id="footer">
        {info
          ? `${info.platform} · ${info.locale} · ${info.theme} · bridge v${info.bridgeVersion}`
          : "…"}
        <button
          id="close"
          className="link"
          onClick={() => void mini.navigation.close()}
        >
          Close mini-app
        </button>
      </footer>
    </main>
  );
}
