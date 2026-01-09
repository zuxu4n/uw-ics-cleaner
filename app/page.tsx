"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Category =
    | "fees"
    | "exams"
    | "adddrop"
    | "holidays"
    | "term"
    | "grades"
    | "graduation"
    | "coop"
    | "admin";

type ApiEvent = {
    title: string;
    start: number;
    endExclusive: number | null;
    endInclusive: number | null;
    durationDays: number | null;
    category: Category;
    term: string;
};

const PRIMARY_CATEGORIES = new Set<Category>(["fees", "exams", "adddrop"]);

function formatYyyymmdd(n: number) {
    const s = String(n);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function labelForCategory(c: Category) {
    if (c === "fees") return "Fees";
    if (c === "exams") return "Exams";
    if (c === "adddrop") return "Add/Drop";
    if (c === "holidays") return "Holiday Closures";
    if (c === "term") return "Class Begin/End";
    if (c === "grades") return "Grades Release";
    if (c === "graduation") return "Graduation";
    if (c === "coop") return "Co-op Begin/End";
    return "Administrative";
}

function prettyTerm(termKey: string) {
    const m = termKey.match(/^(winter|spring|fall)(\d{4})$/);
    if (!m) return termKey;
    const season = m[1];
    const year = m[2];
    return `${season[0].toUpperCase()}${season.slice(1)} ${year}`;
}

function termSortKey(termKey: string) {
    const m = termKey.match(/^(winter|spring|fall)(\d{4})$/);
    if (!m) return termKey;
    const season = m[1];
    const year = Number(m[2]);
    let s = 9;
    if (season === "winter") s = 1;
    if (season === "spring") s = 2;
    if (season === "fall") s = 3;
    return `${String(year).padStart(4, "0")}-${s}`;
}

function formatRange(e: ApiEvent) {
    if (e.endInclusive && e.endInclusive !== e.start) {
        return `${formatYyyymmdd(e.start)} → ${formatYyyymmdd(e.endInclusive)}`;
    }
    return formatYyyymmdd(e.start);
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export default function Home() {
    const [availableTerms, setAvailableTerms] = useState<string[]>([]);
    const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
    const [cats, setCats] = useState<Record<Category, boolean>>({
        fees: true,
        exams: true,
        adddrop: true,
        holidays: false,
        term: false,
        grades: false,
        graduation: false,
        coop: false,
        admin: false,
    });
    const [eventCount, setEventCount] = useState<number | null>(null);
    const [shownCount, setShownCount] = useState<number | null>(null);
    const [events, setEvents] = useState<ApiEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const didInitTerms = useRef(false);
    const toastTimer = useRef<number | null>(null);

    const selectedCats = useMemo(() => {
        const out: Category[] = [];
        const keys = Object.keys(cats) as Category[];
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (cats[k]) out.push(k);
        }
        return out;
    }, [cats]);

    const sortedAvailableTerms = useMemo(() => {
        const copy = availableTerms.slice();
        copy.sort((a, b) => {
            const ka = termSortKey(a);
            const kb = termSortKey(b);
            if (ka < kb) return -1;
            if (ka > kb) return 1;
            return 0;
        });
        return copy;
    }, [availableTerms]);

    function showToast(msg: string) {
        setToast(msg);
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 2500);
    }

    function buildApiUrl(withFormat: "json" | "ics" | "ics_sub") {
        const params: string[] = [];
        const termsArr = Array.from(selectedTerms);
        if (termsArr.length === 0) params.push("terms=");
        else params.push(`terms=${termsArr.join(",")}`);
        if (selectedCats.length === 0) params.push("cats=");
        else params.push(`cats=${selectedCats.join(",")}`);
        if (withFormat === "ics") params.push("format=ics");
        if (withFormat === "ics_sub") params.push("format=ics_sub");
        return `/api/uw-ics?${params.join("&")}`;
    }

    function getPublicSubscribeUrl() {
        const base = process.env.NEXT_PUBLIC_BASE_URL ?? window.location.origin;
        const apiPath = buildApiUrl("ics_sub");
        return `${base}${apiPath}`;
    }

    useEffect(() => {
        function buildApiUrl(withFormat: "json" | "ics" | "ics_sub") {
            const params: string[] = [];
            const termsArr = Array.from(selectedTerms);
            if (termsArr.length === 0) params.push("terms=");
            else params.push(`terms=${termsArr.join(",")}`);
            if (selectedCats.length === 0) params.push("cats=");
            else params.push(`cats=${selectedCats.join(",")}`);
            if (withFormat === "ics") params.push("format=ics");
            if (withFormat === "ics_sub") params.push("format=ics_sub");
            return `/api/uw-ics?${params.join("&")}`;
        }

        const url = buildApiUrl("json");
        fetch(url, { cache: "no-store" })
            .then((r) => {
                if (!r.ok) throw new Error(`API error (${r.status})`);
                return r.json();
            })
            .then((data) => {
                setError(null);
                setEventCount(data.eventCount);
                setShownCount(data.shownCount);
                setEvents(data.events ?? []);
                const termsFromApi: string[] = data.availableTerms ?? [];
                setAvailableTerms(termsFromApi);
                if (!didInitTerms.current && termsFromApi.length > 0) {
                    const next = new Set<string>();
                    for (let i = 0; i < termsFromApi.length; i++) next.add(termsFromApi[i]);
                    setSelectedTerms(next);
                    didInitTerms.current = true;
                }
            })
            .catch((e: unknown) => {
                const msg = e instanceof Error ? e.message : "Failed to load events";
                setError(msg);
                setEvents([]);
                setShownCount(0);
            });
    }, [selectedTerms, selectedCats]);

    const primaryEvents = useMemo(() => {
        const out: ApiEvent[] = [];
        for (let i = 0; i < events.length; i++) {
            if (PRIMARY_CATEGORIES.has(events[i].category)) out.push(events[i]);
        }
        return out;
    }, [events]);

    const secondaryEvents = useMemo(() => {
        const out: ApiEvent[] = [];
        for (let i = 0; i < events.length; i++) {
            if (!PRIMARY_CATEGORIES.has(events[i].category)) out.push(events[i]);
        }
        return out;
    }, [events]);

    function renderEventLine(e: ApiEvent) {
        const range = formatRange(e);
        const duration =
            e.durationDays && e.durationDays > 1 ? `(${e.durationDays} days)` : "";
        return `${range} ${duration} — [${labelForCategory(e.category)}] ${e.title}`;
    }

    return (
        <main style={{ padding: 24, fontFamily: "sans-serif" }}>
            <h1>UW Important Dates Cleaner</h1>
            {toast && (
                <div
                    style={{
                        position: "fixed",
                        top: 16,
                        right: 16,
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "#111",
                        color: "#fff",
                        fontSize: 14,
                        zIndex: 9999,
                    }}
                >
                    {toast}
                </div>
            )}
            <div
                style={{
                    display: "flex",
                    gap: 24,
                    alignItems: "flex-start",
                    marginTop: 12,
                }}
            >
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Terms</div>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 12,
                                alignItems: "center",
                            }}
                        >
                            {sortedAvailableTerms.map((t) => (
                                <label key={t} style={{ whiteSpace: "nowrap" }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedTerms.has(t)}
                                        onChange={(e) => {
                                            const next = new Set(selectedTerms);
                                            if (e.target.checked) next.add(t);
                                            else next.delete(t);
                                            setSelectedTerms(next);
                                        }}
                                    />{" "}
                                    {prettyTerm(t)}
                                </label>
                            ))}
                            <button
                                style={{ marginLeft: 8, padding: "6px 10px" }}
                                onClick={() => {
                                    const next = new Set<string>();
                                    for (let i = 0; i < availableTerms.length; i++)
                                        next.add(availableTerms[i]);
                                    setSelectedTerms(next);
                                }}
                            >
                                Select all
                            </button>
                            <button
                                style={{ padding: "6px 10px" }}
                                onClick={() => setSelectedTerms(new Set())}
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>
                            Important deadlines
                        </div>
                        {(["fees", "exams", "adddrop"] as const).map((c) => (
                            <label key={c} style={{ marginRight: 12 }}>
                                <input
                                    type="checkbox"
                                    checked={cats[c]}
                                    onChange={(e) => setCats({ ...cats, [c]: e.target.checked })}
                                />{" "}
                                {labelForCategory(c)}
                            </label>
                        ))}
                    </div>
                    <div style={{ marginTop: 12, opacity: 0.75 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>
                            Informational (optional)
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 12,
                                alignItems: "center",
                            }}
                        >
                            <label style={{ whiteSpace: "nowrap" }}>
                                <input
                                    type="checkbox"
                                    checked={cats.holidays}
                                    onChange={(e) =>
                                        setCats({ ...cats, holidays: e.target.checked })
                                    }
                                />{" "}
                                {labelForCategory("holidays")}
                            </label>
                            <label style={{ whiteSpace: "nowrap" }}>
                                <input
                                    type="checkbox"
                                    checked={cats.term}
                                    onChange={(e) => setCats({ ...cats, term: e.target.checked })}
                                />{" "}
                                {labelForCategory("term")}
                            </label>
                            <label style={{ whiteSpace: "nowrap" }}>
                                <input
                                    type="checkbox"
                                    checked={cats.coop}
                                    onChange={(e) => setCats({ ...cats, coop: e.target.checked })}
                                />{" "}
                                {labelForCategory("coop")}
                            </label>
                            <label style={{ whiteSpace: "nowrap" }}>
                                <input
                                    type="checkbox"
                                    checked={cats.grades}
                                    onChange={(e) =>
                                        setCats({ ...cats, grades: e.target.checked })
                                    }
                                />{" "}
                                {labelForCategory("grades")}
                            </label>
                            <label style={{ whiteSpace: "nowrap" }}>
                                <input
                                    type="checkbox"
                                    checked={cats.graduation}
                                    onChange={(e) =>
                                        setCats({ ...cats, graduation: e.target.checked })
                                    }
                                />{" "}
                                {labelForCategory("graduation")}
                            </label>
                            <label style={{ whiteSpace: "nowrap" }}>
                                <input
                                    type="checkbox"
                                    checked={cats.admin}
                                    onChange={(e) =>
                                        setCats({ ...cats, admin: e.target.checked })
                                    }
                                />{" "}
                                {labelForCategory("admin")}
                            </label>
                        </div>
                    </div>
                    {error && <p style={{ marginTop: 12, color: "crimson" }}>{error}</p>}
                    <p style={{ marginTop: 12 }}>
                        Total events in feed: {eventCount ?? "..."}
                        <br />
                        Showing: {shownCount ?? "..."}
                    </p>
                    <div
                        style={{
                            display: "flex",
                            gap: 24,
                            alignItems: "flex-start",
                            marginTop: 24,
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 style={{ marginTop: 0 }}>Important deadlines:</h2>
                            <ul>
                                {primaryEvents.map((e, idx) => (
                                    <li key={`p-${idx}`} style={{ marginBottom: 6 }}>
                                        {renderEventLine(e)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div style={{ flex: 1, minWidth: 0, opacity: 0.7 }}>
                            <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>
                                Informational events:
                            </h2>
                            <ul style={{ opacity: 0.9 }}>
                                {secondaryEvents.map((e, idx) => (
                                    <li
                                        key={`s-${idx}`}
                                        style={{ marginBottom: 6, fontSize: "0.92rem" }}
                                    >
                                        {renderEventLine(e)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
                <aside
                    style={{
                        width: 280,
                        flexShrink: 0,
                        border: "1px solid rgba(0,0,0,0.2)",
                        borderRadius: 10,
                        padding: 12,
                        position: "sticky",
                        top: 16,
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                        Add to calendar
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <button
                            style={{ padding: "8px 10px", textAlign: "left" }}
                            onClick={async () => {
                                const url = getPublicSubscribeUrl();
                                const copied = await copyToClipboard(url);
                                const webcal = url.replace(/^https:/, "webcal:");
                                if (copied) showToast("Link copied. Calendar should open.");
                                else showToast("Open Calendar and subscribe using the URL.");
                                window.location.href = webcal;
                            }}
                        >
                            Apple Calendar
                        </button>
                        <button
                            style={{ padding: "8px 10px", textAlign: "left" }}
                            onClick={async () => {
                                const url = getPublicSubscribeUrl();
                                const copied = await copyToClipboard(url);
                                if (copied)
                                    showToast("Link copied. Paste it into Google Calendar.");
                                else
                                    showToast("Copy the URL and paste it into Google Calendar.");
                                window.open(
                                    "https://calendar.google.com/calendar/u/0/r/settings/addbyurl",
                                    "_blank"
                                );
                            }}
                        >
                            Google Calendar
                        </button>
                        <button
                            style={{ padding: "8px 10px", textAlign: "left" }}
                            onClick={async () => {
                                const url = getPublicSubscribeUrl();
                                const copied = await copyToClipboard(url);
                                if (copied) showToast("Link copied. Paste it into Outlook.");
                                else showToast("Copy the URL and paste it into Outlook.");
                                window.open(
                                    "https://outlook.office.com/calendar/0/addcalendar",
                                    "_blank"
                                );
                            }}
                        >
                            Microsoft Outlook
                        </button>
                        <button
                            style={{ padding: "8px 10px", textAlign: "left" }}
                            onClick={() => {
                                window.location.href = buildApiUrl("ics");
                            }}
                        >
                            Download .ics
                        </button>
                    </div>
                    <div
                        style={{
                            marginTop: 10,
                            fontSize: 12.5,
                            opacity: 0.8,
                            lineHeight: 1.35,
                        }}
                    >
                        Subscriptions update automatically, but Google/Outlook usually
                        require you to paste the URL once.
                    </div>
                </aside>
            </div>
        </main>
    );
}