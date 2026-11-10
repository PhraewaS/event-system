import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  api,
  collection,
  bootstrap,
  login,
  logout,
  ApiError,
  type User,
  type Event,
  type Registration,
  type RosterEntry,
} from "./api";

type Navigate = (path: string) => void;
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const time = (value: string) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
function useResource<T>(load: () => Promise<T>, key: string) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setValue(null);
    load()
      .then((result) => {
        if (active) setValue(result);
      })
      .catch((err) => {
        if (active) setError(message(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key]);
  return { value, error, loading };
}
function Link({
  to,
  navigate,
  children,
  className = "",
}: {
  to: string;
  navigate: Navigate;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href={to}
      onClick={(e) => {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}
function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
function Loading() {
  return (
    <p className="loading" role="status">
      Loading your next good thing…
    </p>
  );
}
function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
function Access({
  user,
  role,
  navigate,
}: {
  user: User | null;
  role: User["role"];
  navigate: Navigate;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">↗</span>
      <h1>
        {user
          ? "This space is for another role"
          : "A little introduction first"}
      </h1>
      <p>
        {user
          ? `You’re signed in as a ${user.role.toLowerCase()}. This page is for ${role.toLowerCase()} accounts.`
          : "Sign in to see your registrations or manage your events."}
      </p>
      <Link
        className="button"
        to={user ? "/events" : "/login"}
        navigate={navigate}
      >
        {user ? "Explore events" : "Sign in"}
      </Link>
    </div>
  );
}
function EventArt({
  index,
  compact = false,
}: {
  index: number;
  compact?: boolean;
}) {
  return (
    <div
      className={`event-art art-${index % 3} ${compact ? "compact" : ""}`}
      aria-hidden="true"
    >
      <div className="art-shape shape-one" />
      <div className="art-shape shape-two" />
      <span>
        {["Make\nconnections.", "Try\nsomething.", "Bring\nyour ideas."][
          index % 3
        ]
          .split("\n")
          .map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          ))}
      </span>
      <small>GATHER / TOGETHER</small>
    </div>
  );
}
function EventCard({
  event,
  index,
  navigate,
  manage = false,
}: {
  event: Event;
  index: number;
  navigate: Navigate;
  manage?: boolean;
}) {
  const target = manage
    ? `/organizer/events/${event.id}`
    : `/events/${event.id}`;
  return (
    <article className="event-card">
      <Link to={target} navigate={navigate} className="art-link">
        <EventArt index={index} />
      </Link>
      <div className="card-content">
        <div className="card-meta">
          <span>{date(event.startsAt)}</span>
          <span className={`badge ${event.registrationOpen ? "" : "muted"}`}>
            {event.registrationOpen
              ? "Open for registration"
              : event.remainingPlaces === 0
                ? "Fully booked"
                : "Registration closed"}
          </span>
        </div>
        <h2>
          <Link to={target} navigate={navigate}>
            {event.title}
          </Link>
        </h2>
        <p className="card-description">{event.description}</p>
        <p className="muted-text">⌖ {event.location}</p>
        <div className="card-bottom">
          <span>
            <strong>
              {manage ? event.registeredCount : event.remainingPlaces}
            </strong>{" "}
            {manage ? "registered" : "places left"}{" "}
            <span className="muted-text">/ {event.capacity}</span>
          </span>
          <Link to={target} navigate={navigate} className="text-link">
            {manage ? "View registrations" : "View event"}{" "}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
function Discover({ navigate }: { navigate: Navigate }) {
  const { value, loading, error } = useResource(
    () => collection<Event>("/events"),
    "events",
  );
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const visible = (value ?? []).filter(
    (e) =>
      (!onlyOpen || e.registrationOpen) &&
      `${e.title} ${e.description} ${e.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="hero">
        <div>
          <span className="hero-tag">
            <span className="status-dot" /> A place for shared experiences
          </span>
          <h1>
            Good things happen
            <br />
            when we <em>gather.</em>
          </h1>
          <p>
            Find your people. Learn something new.
            <br />
            Make a little room for what’s next.
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-orbit orbit-three" />
          <span className="hero-star">✳</span>
          <span className="hero-note">See you there.</span>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR NEXT EXPERIENCE</p>
          <h2>What’s coming up</h2>
        </div>
        <span className="muted-text">
          {loading
            ? "Finding events…"
            : `${visible.length} event${visible.length === 1 ? "" : "s"} to explore`}
        </span>
      </div>
      <div className="filters">
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search events"
            placeholder="Search events, ideas, places…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />{" "}
          Open for registration
        </label>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : visible.length ? (
        <div className="event-grid">
          {visible.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              navigate={navigate}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>
            {search || onlyOpen
              ? "No events match just yet"
              : "Something good is on its way"}
          </h2>
          <p>
            {search || onlyOpen
              ? "Try a different search or clear the filters."
              : "Published events will appear here. Check back soon."}
          </p>
        </div>
      )}
    </>
  );
}
function SignIn({
  navigate,
  onLogin,
}: {
  navigate: Navigate;
  onLogin: (user: User) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const user = await login(
        String(form.get("email")).trim(),
        String(form.get("password")),
      );
      onLogin(user);
      const next = new URLSearchParams(window.location.search).get("next");
      navigate(next?.startsWith("/events/") ? next : "/events");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="signin-layout">
      <div className="signin-story">
        <p className="eyebrow">YOU BELONG HERE</p>
        <h1>
          Your next
          <br />
          connection
          <br />
          starts here.
        </h1>
        <div className="signin-mark" aria-hidden="true">
          ✳
        </div>
        <p>
          A shared interest. A new perspective.
          <br />A good reason to get together.
        </p>
      </div>
      <section className="signin-panel">
        <p className="eyebrow">WELCOME TO GATHER</p>
        <h2>Good to see you.</h2>
        <p className="muted-text">
          Sign in to reserve your place or bring people together.
        </p>
        <form onSubmit={submit}>
          {error && <Notice error>{error}</Notice>}
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="username"
              placeholder="you@example.com"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"} <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="form-note">
          Use the account provided by your event team.
        </p>
      </section>
    </div>
  );
}
function EventDetail({
  id,
  user,
  navigate,
}: {
  id: string;
  user: User | null;
  navigate: Navigate;
}) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = useResource(
    async () => ({
      event: await api<Event>(`/events/${id}`),
      registrations:
        user?.role === "PARTICIPANT"
          ? await collection<Registration>("/registrations/mine")
          : [],
    }),
    `${id}:${user?.id}:${revision}`,
  );
  if (result.loading) return <Loading />;
  if (result.error || !result.value)
    return (
      <Notice error>{result.error || "Event could not be loaded."}</Notice>
    );
  const { event, registrations } = result.value;
  const registered = registrations.some((r) => r.event.id === id);
  async function register() {
    setBusy(true);
    setError("");
    try {
      await api(`/events/${id}/registrations`, { method: "POST", body: "{}" });
      navigate(`/my-registrations?confirmed=${id}`);
    } catch (err) {
      setError(message(err));
      setRevision((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/events" navigate={navigate}>
        ← All events
      </Link>
      <div className="detail-layout">
        <section>
          <EventArt index={event.title.length % 3} compact />
          <p className="eyebrow detail-eyebrow">
            BROUGHT TOGETHER BY {event.organizerName}
          </p>
          <h1>{event.title}</h1>
          <p className="detail-description">{event.description}</p>
        </section>
        <aside className="reservation">
          <span className={`badge ${event.registrationOpen ? "" : "muted"}`}>
            {registered
              ? "You’re registered"
              : event.registrationOpen
                ? "Registration is open"
                : event.remainingPlaces === 0
                  ? "Fully booked"
                  : "Registration closed"}
          </span>
          <h2>Make it a date.</h2>
          <dl>
            <dt>When</dt>
            <dd>
              {date(event.startsAt)}
              <br />
              <span className="muted-text">{time(event.startsAt)}</span>
            </dd>
            <dt>Where</dt>
            <dd>{event.location}</dd>
            <dt>Registration closes</dt>
            <dd>
              {date(event.registrationDeadline)}
              <br />
              <span className="muted-text">
                {time(event.registrationDeadline)}
              </span>
            </dd>
          </dl>
          <div className="capacity">
            <span>
              <strong>{event.remainingPlaces}</strong> places left
            </span>
            <span>of {event.capacity}</span>
          </div>
          <progress
            aria-label="Places filled"
            value={event.registeredCount}
            max={event.capacity}
          />
          {error && <Notice error>{error}</Notice>}
          {registered ? (
            <Link className="button" to="/my-registrations" navigate={navigate}>
              View my registration ↗
            </Link>
          ) : !user ? (
            <Link
              className="button"
              to={`/login?next=/events/${id}`}
              navigate={navigate}
            >
              Sign in to register ↗
            </Link>
          ) : user.role === "PARTICIPANT" ? (
            <button
              className="button"
              disabled={!event.registrationOpen || busy}
              onClick={register}
            >
              {busy
                ? "Reserving your place…"
                : event.registrationOpen
                  ? "Reserve my place ↗"
                  : "Registration unavailable"}
            </button>
          ) : user.id === event.organizerId ? (
            <Link
              className="button"
              to={`/organizer/events/${id}`}
              navigate={navigate}
            >
              View registrations ↗
            </Link>
          ) : (
            <p className="form-note">
              Sign in with a Participant account to register.
            </p>
          )}
          <p className="form-note">
            One registration per person. Your place is confirmed as soon as you
            register.
          </p>
        </aside>
      </div>
    </>
  );
}
function MyRegistrations({ navigate }: { navigate: Navigate }) {
  const { value, loading, error } = useResource(
    () => collection<Registration>("/registrations/mine"),
    "mine",
  );
  return (
    <>
      <Heading eyebrow="YOUR PLANS, ALL TOGETHER" title="My registrations">
        <Link className="button secondary" to="/events" navigate={navigate}>
          Explore events ↗
        </Link>
      </Heading>
      {window.location.search.includes("confirmed=") && (
        <Notice>Your place is confirmed. See you there!</Notice>
      )}
      {loading ? (
        <Loading />
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : value?.length ? (
        <div className="registration-list">
          {value.map((r) => (
            <article className="registration-row" key={r.id}>
              <div className="date-tile">
                <strong>{new Date(r.event.startsAt).getDate()}</strong>
                <span>
                  {new Date(r.event.startsAt).toLocaleDateString(undefined, {
                    month: "short",
                  })}
                </span>
              </div>
              <div className="registration-info">
                <span className="badge">Confirmed</span>
                <h2>
                  <Link to={`/events/${r.event.id}`} navigate={navigate}>
                    {r.event.title}
                  </Link>
                </h2>
                <p>
                  {date(r.event.startsAt)} · {time(r.event.startsAt)}
                </p>
                <p className="muted-text">{r.event.location}</p>
                <small className="registration-id">Registration {r.id}</small>
              </div>
              <Link
                className="text-link"
                to={`/events/${r.event.id}`}
                navigate={navigate}
              >
                Event details ↗
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-symbol">✳</span>
          <h2>Your calendar has room for something good</h2>
          <p>Find an event you like and reserve your first place.</p>
          <Link className="button" to="/events" navigate={navigate}>
            Find your next event ↗
          </Link>
        </div>
      )}
    </>
  );
}
function OrganizerEvents({ navigate }: { navigate: Navigate }) {
  const { value, loading, error } = useResource(
    () => collection<Event>("/organizer/events"),
    "owned",
  );
  return (
    <>
      <Heading eyebrow="BRING PEOPLE TOGETHER" title="My events">
        <Link className="button" to="/publish" navigate={navigate}>
          ＋ Publish an event
        </Link>
      </Heading>
      <p className="intro">Your events and the people making them happen.</p>
      {loading ? (
        <Loading />
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : value?.length ? (
        <div className="event-grid">
          {value.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              navigate={navigate}
              manage
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-symbol">＋</span>
          <h2>Start with a good idea</h2>
          <p>
            Publish your first event and give people something to look forward
            to.
          </p>
          <Link className="button" to="/publish" navigate={navigate}>
            Publish an event ↗
          </Link>
        </div>
      )}
    </>
  );
}
function Publish({ navigate }: { navigate: Navigate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const created = await api<Event>("/events", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description"),
          location: form.get("location"),
          capacity: Number(form.get("capacity")),
          startsAt: new Date(String(form.get("startsAt"))).toISOString(),
          registrationDeadline: new Date(
            String(form.get("registrationDeadline")),
          ).toISOString(),
        }),
      });
      navigate(`/organizer/events/${created.id}?published=1`);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/organizer" navigate={navigate}>
        ← My events
      </Link>
      <Heading
        eyebrow="AN IDEA WORTH SHARING"
        title="Bring your event to life."
      />
      <div className="publish-layout">
        <form className="publish-form" onSubmit={submit}>
          {error && <Notice error>{error}</Notice>}
          <h2>The essentials</h2>
          <p className="muted-text">
            Give people a reason to be there. All fields are required.
          </p>
          <label>
            Event title
            <input
              name="title"
              placeholder="A name that sparks curiosity"
              required
              minLength={3}
              maxLength={120}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              rows={5}
              placeholder="What will people experience? What should they know?"
              required
              minLength={10}
              maxLength={4000}
            />
          </label>
          <label>
            Location
            <input
              name="location"
              placeholder="Where we’ll gather"
              required
              minLength={2}
              maxLength={200}
            />
          </label>
          <div className="form-grid">
            <label>
              Event starts
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label>
              Registration deadline
              <input
                name="registrationDeadline"
                type="datetime-local"
                required
              />
            </label>
          </div>
          <p className="form-note">
            Dates use your local timezone (
            {Intl.DateTimeFormat().resolvedOptions().timeZone}). Registration
            must close in the future, no later than the start.
          </p>
          <label>
            Capacity
            <input
              className="capacity-input"
              name="capacity"
              type="number"
              min={1}
              max={1000000}
              step={1}
              placeholder="24"
              required
            />
          </label>
          <div className="form-actions">
            <Link to="/organizer" navigate={navigate}>
              Back to my events
            </Link>
            <button className="button" disabled={busy}>
              {busy ? "Publishing…" : "Publish event ↗"}
            </button>
          </div>
        </form>
        <aside className="publish-note">
          <span aria-hidden="true">✳</span>
          <h2>
            Make space.
            <br />
            Make connections.
          </h2>
          <p>Your event becomes visible as soon as you publish.</p>
          <p>
            Choose your capacity carefully. Published events and capacity cannot
            be edited in this version.
          </p>
          <p>
            Each participant can reserve one place. Registration automatically
            closes at your deadline or when the event fills up.
          </p>
        </aside>
      </div>
    </>
  );
}
function Roster({ id, navigate }: { id: string; navigate: Navigate }) {
  const { value, loading, error } = useResource(async () => {
    // Check private ownership first; public event details alone grant no roster access.
    const roster = await collection<RosterEntry>(`/events/${id}/registrations`);
    return { event: await api<Event>(`/events/${id}`), roster };
  }, id);
  if (loading) return <Loading />;
  if (error || !value)
    return <Notice error>{error || "Unable to load registrations."}</Notice>;
  return (
    <>
      <Link className="back-link" to="/organizer" navigate={navigate}>
        ← My events
      </Link>
      {window.location.search.includes("published=") && (
        <Notice>Your event is published and ready for registrations.</Notice>
      )}
      <Heading eyebrow="YOUR EVENT, YOUR COMMUNITY" title={value.event.title}>
        <Link
          className="button secondary"
          to={`/events/${id}`}
          navigate={navigate}
        >
          View public event ↗
        </Link>
      </Heading>
      <div className="roster-summary">
        <div>
          <strong>{value.roster.length}</strong>
          <span>Registered</span>
        </div>
        <div>
          <strong>{value.event.remainingPlaces}</strong>
          <span>Places left</span>
        </div>
        <div>
          <strong>{value.event.capacity}</strong>
          <span>Total capacity</span>
        </div>
      </div>
      <div className="section-heading">
        <h2>Registrations</h2>
        <span className="muted-text">
          {date(value.event.startsAt)} · {time(value.event.startsAt)}
        </span>
      </div>
      {value.roster.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Participant</th>
                <th scope="col">Email address</th>
                <th scope="col">Registered</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {value.roster.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.participant.name}</strong>
                  </td>
                  <td>{r.participant.email}</td>
                  <td>
                    {date(r.createdAt)} · {time(r.createdAt)}
                  </td>
                  <td>
                    <span className="badge">Confirmed</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <h2>The guest list starts here</h2>
          <p>Participants will appear here as they register for your event.</p>
        </div>
      )}
    </>
  );
}
export function App() {
  const [path, setPath] = useState(
    window.location.pathname + window.location.search,
  );
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const navigate: Navigate = (to) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const pop = () =>
      setPath(window.location.pathname + window.location.search);
    const expired = () => {
      setUser(null);
      setAuthError("Your session has expired. Sign in again to continue.");
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("gather:expired", expired);
    let active = true;
    bootstrap()
      .then(() => api<User>("/auth/me"))
      .then((identity) => {
        if (active) setUser(identity);
      })
      .catch((err) => {
        if (active && (!(err instanceof ApiError) || err.status !== 401))
          setAuthError(message(err));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      window.removeEventListener("popstate", pop);
      window.removeEventListener("gather:expired", expired);
    };
  }, []);
  const route = path.split("?")[0];
  useEffect(() => {
    if (ready) document.querySelector<HTMLElement>("main")?.focus();
  }, [path, ready]);
  async function signOut() {
    try {
      await logout();
      setUser(null);
      setAuthError("");
      navigate("/events");
    } catch (err) {
      setAuthError(message(err));
    }
  }
  let content: ReactNode;
  const detail = route.match(/^\/events\/([^/]+)$/);
  const roster = route.match(/^\/organizer\/events\/([^/]+)$/);
  if (!ready) content = <Loading />;
  else if (route === "/events" || route === "/")
    content = <Discover navigate={navigate} />;
  else if (route === "/login")
    content = (
      <SignIn
        navigate={navigate}
        onLogin={(identity) => {
          setUser(identity);
          setAuthError("");
        }}
      />
    );
  else if (detail)
    content = <EventDetail id={detail[1]} user={user} navigate={navigate} />;
  else if (route === "/my-registrations")
    content =
      user?.role === "PARTICIPANT" ? (
        <MyRegistrations navigate={navigate} />
      ) : (
        <Access user={user} role="PARTICIPANT" navigate={navigate} />
      );
  else if (route === "/organizer" || route === "/publish" || roster)
    content =
      user?.role !== "ORGANIZER" ? (
        <Access user={user} role="ORGANIZER" navigate={navigate} />
      ) : roster ? (
        <Roster id={roster[1]} navigate={navigate} />
      ) : route === "/publish" ? (
        <Publish navigate={navigate} />
      ) : (
        <OrganizerEvents navigate={navigate} />
      );
  else
    content = (
      <div className="empty-state">
        <h1>This page wandered off</h1>
        <Link className="button" to="/events" navigate={navigate}>
          Back to events
        </Link>
      </div>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/events" navigate={navigate} className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✳
          </span>{" "}
          gather<span className="brand-period">.</span>
        </Link>
        <p className="nav-label">MAKE ROOM FOR MORE</p>
        <nav aria-label="Main navigation">
          <Link
            className={`nav-item ${route === "/events" || route === "/" || detail ? "active" : ""}`}
            to="/events"
            navigate={navigate}
          >
            <span aria-hidden="true">◈</span> Discover events
          </Link>
          {user?.role === "PARTICIPANT" && (
            <Link
              className={`nav-item ${route === "/my-registrations" ? "active" : ""}`}
              to="/my-registrations"
              navigate={navigate}
            >
              <span aria-hidden="true">▤</span> My registrations
            </Link>
          )}
          {user?.role === "ORGANIZER" && (
            <>
              <Link
                className={`nav-item ${route === "/organizer" || roster ? "active" : ""}`}
                to="/organizer"
                navigate={navigate}
              >
                <span aria-hidden="true">▤</span> My events
              </Link>
              <Link
                className={`nav-item ${route === "/publish" ? "active" : ""}`}
                to="/publish"
                navigate={navigate}
              >
                <span aria-hidden="true">＋</span> Publish an event
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-note">
          <span aria-hidden="true">✳</span>
          <p>
            A little curiosity.
            <br />A lot of possibility.
          </p>
        </div>
        <div className="sidebar-footer">GOOD PEOPLE. SHARED EXPERIENCES.</div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            The gathering place <span aria-hidden="true">/</span>{" "}
            <strong>
              {route.startsWith("/organizer")
                ? "My events"
                : route === "/publish"
                  ? "Publish"
                  : route === "/my-registrations"
                    ? "My registrations"
                    : route === "/login"
                      ? "Welcome"
                      : "Discover"}
            </strong>
          </span>
          <div className="account">
            {user ? (
              <>
                <span className="avatar" aria-hidden="true">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div className="identity">
                  <strong>{user.name}</strong>
                  <small>
                    {user.role === "ORGANIZER" ? "Organizer" : "Participant"}
                  </small>
                </div>
                <button className="signout" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <Link className="button small" to="/login" navigate={navigate}>
                Sign in ↗
              </Link>
            )}
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          key={`${path}:${user?.id ?? "anonymous"}`}
        >
          {authError && <Notice error>{authError}</Notice>}
          {content}
        </main>
        <footer className="page-footer">
          <span>
            gather.{" "}
            <span className="muted-text">A good reason to get together.</span>
          </span>
          <span>Made for shared experiences ↗</span>
        </footer>
      </div>
    </div>
  );
}
