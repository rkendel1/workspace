import { useEffect, useRef, useState } from "react";
import { useConnectionState, useFeltKit, useMutation, useQueryState, useSession } from "@feltdb/feltkit/react";
import { api } from "../feltkit/_generated/api";
import { describe, ResetForm, SignedOut } from "./auth";
import { Onboarding } from "./Onboarding";
import { WorkspaceView } from "./Workspace";
import { Toasts, useToasts } from "./ui";

/** The shell: session, profile, invitation links, then the workspace. */
export function App() {
  const { session, signInAsDevUser, signIn, signUp, signOut } = useSession();
  const client = useFeltKit();
  const live = useConnectionState();
  const toasts = useToasts();
  const principal = session?.principal ?? null;
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    void client.handleRedirect().then((r) => {
      if (r?.kind === "reset") setResetToken(r.token);
      else if (r?.kind === "error" || r?.kind === "verify-failed") toasts.error(r.message);
    });
  }, [client]);

  // Development: sign in as the identity in ?as=… (two windows, two people), else the first dev user.
  const tried = useRef(false);
  useEffect(() => {
    if (session && !principal && session.devUsers.length && !tried.current) {
      tried.current = true;
      const wanted = new URLSearchParams(location.search).get("as");
      const user = session.devUsers.find((u) => u.id === wanted) ?? session.devUsers[0]!;
      void signInAsDevUser(user.id).catch(toasts.error);
    }
  }, [session, principal, signInAsDevUser]);

  if (!session) return <div className="center muted" role="status">Connecting…</div>;
  if (resetToken) return <div className="center"><div className="card narrow"><ResetForm token={resetToken} onDone={() => setResetToken(null)} /></div></div>;
  if (!principal) {
    return (
      <div className="signed-out">
        <div className="brand-hero"><Logo /> <span>Multiplayer</span></div>
        <SignedOut devUsers={session.devUsers} accounts={session.accounts ?? null} onDevSignIn={(id) => void signInAsDevUser(id).catch(toasts.error)} onSignIn={signIn} onSignUp={signUp} />
        <Toasts {...toasts} />
      </div>
    );
  }
  return (
    <>
      <Signed key={principal.id} live={live} devUsers={session.devUsers} principalId={principal.id} onSwitch={(id) => void (id ? signInAsDevUser(id) : signOut()).catch(toasts.error)} onSignOut={() => void signOut()} toasts={toasts} />
      <Toasts {...toasts} />
    </>
  );
}

function Signed(props: { live: boolean; devUsers: Array<{ id: string; name: string }>; principalId: string; onSwitch: (id: string) => void; onSignOut: () => void; toasts: ReturnType<typeof useToasts> }) {
  const me = useQueryState(api.me.get);
  const ensure = useMutation(api.me.ensure);
  const accept = useMutation(api.invitations.accept);
  const [chosen, setChosen] = useState<string | null>(() => sessionStorage.getItem("mp:ws"));
  const [picker, setPicker] = useState(false);
  const invite = new URLSearchParams(location.search).get("invite");

  // First visit: create the participant profile for this principal.
  useEffect(() => {
    if (me.data === null) void ensure({}).catch(props.toasts.error);
  }, [me.data]);

  const workspaces = me.data?.workspaces ?? [];
  // The chosen workspace if the caller still belongs to it, else their first one (no picker flash).
  const workspaceId = chosen && workspaces.some((w) => w.id === chosen) ? chosen : workspaces[0]?.id ?? null;
  const setWorkspaceId = (id: string | null) => {
    setPicker(id === null);
    if (id) { setChosen(id); sessionStorage.setItem("mp:ws", id); }
  };

  if (me.error) return <div className="center"><div className="card narrow error-text" role="alert">{describe(me.error)}</div></div>;
  if (!me.data) return <div className="center muted" role="status">Loading your workspaces…</div>;

  const acceptInvite = async (code: string) => {
    try {
      const ws = await accept({ code });
      history.replaceState(null, "", location.pathname + (new URLSearchParams(location.search).get("as") ? `?as=${new URLSearchParams(location.search).get("as")}` : ""));
      setWorkspaceId(ws);
      props.toasts.info("You joined the workspace.");
    } catch (e) {
      props.toasts.error(e);
    }
  };

  if (!workspaceId || invite || picker) {
    return <Onboarding me={me.data.participant} workspaces={workspaces} invite={invite} onAccept={acceptInvite} onOpen={setWorkspaceId} onError={props.toasts.error} onSignOut={props.onSignOut} />;
  }
  return (
    <WorkspaceView
      key={workspaceId}
      workspaceId={workspaceId}
      me={me.data.participant}
      workspaces={workspaces}
      live={props.live}
      devUsers={props.devUsers}
      principalId={props.principalId}
      onSwitchUser={props.onSwitch}
      onSwitchWorkspace={(id) => setWorkspaceId(id)}
      onSignOut={props.onSignOut}
      toasts={props.toasts}
    />
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <circle cx="12" cy="13" r="4.2" fill="var(--brand-ink)" />
      <circle cx="21" cy="13" r="4.2" fill="var(--brand-ink)" opacity=".7" />
      <path d="M6 25c1.2-3.6 3.6-5.4 6-5.4s4.8 1.8 6 5.4M15 25c1.2-3.6 3.6-5.4 6-5.4s4.8 1.8 6 5.4" stroke="var(--brand-ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
