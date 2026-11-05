import { useState, type FormEvent } from "react";
import { useMutation, useQueryState } from "@feltdb/feltkit/react";
import { api } from "../feltkit/_generated/api";
import { Logo } from "./App";

type Ws = { id: string; name: string; description: string | null; demo: boolean; role: string };

/** First run, invitation links, and the workspace picker. */
export function Onboarding(props: { me: { displayName: string; handle: string }; workspaces: Ws[]; invite: string | null; onAccept: (code: string) => void; onOpen: (id: string) => void; onError: (e: unknown) => void; onSignOut: () => void }) {
  const create = useMutation(api.workspaces.create);
  const demo = useMutation(api.demo.create);
  const preview = useQueryState(api.invitations.preview, props.invite ? { code: props.invite } : "skip");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (what: string, fn: () => Promise<string>) => {
    setBusy(what);
    try { props.onOpen(await fn()); } catch (e) { props.onError(e); } finally { setBusy(null); }
  };
  const submit = (e: FormEvent) => (e.preventDefault(), void run("create", () => create({ name: name.trim() })));

  return (
    <main className="onboarding">
      <div className="onboarding-card">
        <div className="brand-hero"><Logo size={34} /> <span>Multiplayer</span></div>
        <p className="lead">Hi {props.me.displayName.split(" ")[0]} — you're <strong>@{props.me.handle}</strong>. Workspaces are where your team and your agents work together.</p>

        {props.invite && (
          <section className="invite-box" aria-live="polite">
            {preview.isLoading ? <p className="muted">Checking your invitation…</p> : preview.data ? (
              <>
                <p><strong>{preview.data.invitedBy ?? "Someone"}</strong> invited you to join <strong>{preview.data.workspaceName}</strong> as {preview.data.role}.</p>
                <button onClick={() => props.onAccept(props.invite!)}>Join {preview.data.workspaceName}</button>
              </>
            ) : <p className="error-text" role="alert">This invitation is invalid, already used, or expired. Ask for a new link.</p>}
          </section>
        )}

        {props.workspaces.length > 0 && (
          <section>
            <h2>Your workspaces</h2>
            <ul className="ws-list">
              {props.workspaces.map((w) => (
                <li key={w.id}>
                  <button className="ws-row" onClick={() => props.onOpen(w.id)}>
                    <span className="ws-icon">{w.name[0]}</span>
                    <span><strong>{w.name}</strong>{w.demo && <span className="tag">sample</span>}<br /><span className="muted small">{w.role}</span></span>
                    <span aria-hidden>→</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2>Create a workspace</h2>
          <form className="row" onSubmit={submit}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Design Team" aria-label="Workspace name" maxLength={60} required />
            <button type="submit" disabled={!name.trim() || busy !== null}>{busy === "create" ? "Creating…" : "Create"}</button>
          </form>
        </section>
        <section className="demo-box">
          <div>
            <h2>Explore a sample workspace</h2>
            <p className="muted">Northwind Labs: four colleagues mid-way through planning a launch, a private channel, a DM waiting for you, and the @assistant room agent.</p>
          </div>
          <button className="secondary" onClick={() => void run("demo", () => demo({}))} disabled={busy !== null}>{busy === "demo" ? "Setting up…" : "Open sample workspace"}</button>
        </section>
        <p className="muted small"><button className="link" onClick={props.onSignOut}>Sign out</button></p>
      </div>
    </main>
  );
}
