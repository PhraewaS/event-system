import { useEffect, useState } from "react";
export function App() {
  const [status, setStatus] = useState(
    "Connecting to the application database…",
  );
  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then(async (r) => {
        if (!r.ok) throw new Error("Database unavailable");
        const body = await r.json();
        if (active)
          setStatus(
            body.data.status === "ok"
              ? "API and persistent PostgreSQL are connected."
              : "Unexpected health response.",
          );
      })
      .catch(() => {
        if (active)
          setStatus(
            "The API or database is unavailable. Check setup and refresh.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main>
      <h1>Gather · Project foundation</h1>
      <p role="status">{status}</p>
      <p>
        This review unit establishes the database and application scaffold.
        Domain APIs and role-specific screens are separate dependent PRs.
      </p>
    </main>
  );
}
