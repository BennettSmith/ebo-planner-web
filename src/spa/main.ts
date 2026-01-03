import { type UpcomingTripsPageModel } from "../shared/contracts";
import { getUpcomingTripsPage, setUpcomingTripsRsvp } from "./api/upcoming_trips";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function text(node: HTMLElement, s: string): void {
  node.textContent = s;
}

function setStatus(s: string): void {
  const node = document.getElementById("status");
  if (node) node.textContent = s;
}

function render(model: UpcomingTripsPageModel): void {
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = "";

  // Route header / nav
  {
    const card = el("div", { class: "card" });
    const p = el("p");
    p.innerHTML = `You're viewing <code>/#/upcoming-trips</code>.`;
    const row = el("div", { class: "row" });

    const home = el("a", { class: "button", href: "/#/" });
    text(home, "Home");
    const google = el("a", { class: "button", href: "/auth/google/login" });
    text(google, "Sign in with Google");
    const apple = el("a", { class: "button", href: "/auth/apple/login" });
    text(apple, "Sign in with Apple");

    row.appendChild(home);
    row.appendChild(google);
    row.appendChild(apple);
    card.appendChild(p);
    card.appendChild(row);
    root.appendChild(card);
  }

  if (model.trips.length === 0) {
    const empty = el("p");
    text(empty, "No trips found.");
    root.appendChild(empty);
    return;
  }

  for (const t of model.trips) {
    const card = el("div", { class: "card", style: "margin-top: 1rem;" });

    const header = el("div", { class: "row", style: "align-items: baseline; justify-content: space-between;" });
    const title = el("h2", { style: "margin: 0; font-size: 1.1rem;" });
    text(title, t.name ?? `(Trip ${t.tripId})`);
    const meta = el("div", { style: "opacity: .75; font-size: .9rem;" });
    text(meta, `${t.status}${t.startDate ? ` · starts ${t.startDate}` : ""}`);
    header.appendChild(title);
    header.appendChild(meta);
    card.appendChild(header);

    const rsvpRow = el("div", { class: "row", style: "margin-top: .75rem; align-items: center;" });
    const badge = el("div", { style: "opacity: .8;" });
    text(badge, `My RSVP: ${t.myRsvpResponse}`);
    rsvpRow.appendChild(badge);

    const yesBtn = el("button");
    text(yesBtn, "RSVP YES");
    const noBtn = el("button");
    text(noBtn, "RSVP NO");

    yesBtn.addEventListener("click", async () => {
      setStatus("Updating RSVP…");
      try {
        const updated = await setUpcomingTripsRsvp(t.tripId, "YES");
        render(updated);
        setStatus("Updated.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed.");
      }
    });
    noBtn.addEventListener("click", async () => {
      setStatus("Updating RSVP…");
      try {
        const updated = await setUpcomingTripsRsvp(t.tripId, "NO");
        render(updated);
        setStatus("Updated.");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed.");
      }
    });

    rsvpRow.appendChild(yesBtn);
    rsvpRow.appendChild(noBtn);
    card.appendChild(rsvpRow);

    root.appendChild(card);
  }
}

async function main(): Promise<void> {
  async function renderUpcomingTripsRoute(): Promise<void> {
    setStatus("Loading upcoming trips…");
    try {
      const model = await getUpcomingTripsPage();
      render(model);
      setStatus("Loaded.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed.");
    }
  }

  function renderHomeRoute(): void {
    const root = document.getElementById("app");
    if (root) root.innerHTML = "";
    if (!root) return;

    const card = el("div", { class: "card" });
    const p1 = el("p");
    p1.innerHTML = `This is the member portal SPA served from <code>/</code>. Authentication runs on the BFF.`;
    const row = el("div", { class: "row" });

    const google = el("a", { class: "button", href: "/auth/google/login" });
    text(google, "Sign in with Google");
    const apple = el("a", { class: "button", href: "/auth/apple/login" });
    text(apple, "Sign in with Apple");
    const upcoming = el("a", { class: "button", href: "/#/upcoming-trips" });
    text(upcoming, "Upcoming trips");

    row.appendChild(google);
    row.appendChild(apple);
    row.appendChild(upcoming);

    const p2 = el("p", { style: "margin-top: 1rem; opacity: .8;" });
    p2.innerHTML = `Once signed in, the SPA calls same-origin <code>/api/*</code> endpoints (no tokens in the browser).`;

    card.appendChild(p1);
    card.appendChild(row);
    card.appendChild(p2);
    root.appendChild(card);

    setStatus("Ready.");
  }

  async function renderRoute(): Promise<void> {
    const route = location.hash.replace(/^#\/?/, "");
    if (route === "upcoming-trips") {
      await renderUpcomingTripsRoute();
      return;
    }
    renderHomeRoute();
  }

  window.addEventListener("hashchange", () => {
    void renderRoute();
  });

  await renderRoute();
}

main().catch(() => {});


