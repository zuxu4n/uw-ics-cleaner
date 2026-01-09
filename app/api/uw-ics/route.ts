const UW_ICS_URL =
    "https://uwaterloo.ca/undergraduate-important-dates/important-dates/important_dates_ical.ics";

/* ---------- ICS helpers ---------- */

function unfoldIcsLines(icsText: string) {
    const rawLines = icsText.split(/\r?\n/);
    const out: string[] = [];

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
            out[out.length - 1] += line.slice(1);
        } else {
            out.push(line);
        }
    }
    return out;
}

function yyyymmddToParts(n: number) {
    const s = String(n);
    return {
        year: Number(s.slice(0, 4)),
        month: Number(s.slice(4, 6))
    };
}

function yyyymmddToYmd(n: number) {
    const s = String(n);
    return {
        year: Number(s.slice(0, 4)),
        month: Number(s.slice(4, 6)),
        day: Number(s.slice(6, 8))
    };
}

function yyyymmddToUtcDate(n: number) {
    const { year, month, day } = yyyymmddToYmd(n);
    return new Date(Date.UTC(year, month - 1, day));
}

function utcDateToYyyymmdd(d: Date) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const ys = String(y).padStart(4, "0");
    const ms = String(m).padStart(2, "0");
    const ds = String(day).padStart(2, "0");
    return Number(`${ys}${ms}${ds}`);
}

function addUtcDays(d: Date, days: number) {
    return new Date(d.getTime() + days * 86400000);
}

function diffUtcDaysExclusive(startYyyymmdd: number, endExclusiveYyyymmdd: number) {
    if (!startYyyymmdd || !endExclusiveYyyymmdd) return null;
    const a = yyyymmddToUtcDate(startYyyymmdd);
    const b = yyyymmddToUtcDate(endExclusiveYyyymmdd);
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function endInclusiveFromEndExclusive(endExclusiveYyyymmdd: number) {
    if (!endExclusiveYyyymmdd) return null;
    const endExclusive = yyyymmddToUtcDate(endExclusiveYyyymmdd);
    const endInclusive = addUtcDays(endExclusive, -1);
    return utcDateToYyyymmdd(endInclusive);
}

/* ---------- Term inference ---------- */

type TermSeason = "winter" | "spring" | "fall";
type TermKey = `${TermSeason}${number}`;

function inferTermKeyFromDate(start: number): TermKey | null {
    if (!start || Number.isNaN(start)) return null;
    const { year, month } = yyyymmddToParts(start);

    if (month >= 1 && month <= 4) return `winter${year}`;
    if (month >= 5 && month <= 8) return `spring${year}`;
    if (month >= 9 && month <= 12) return `fall${year}`;
    return null;
}

function isTermKey(x: string): x is TermKey {
    return /^(winter|spring|fall)\d{4}$/.test(x);
}

function parseTermsParam(termsParam: string | null): Set<TermKey> | null {
    if (termsParam === null) return null;
    const trimmed = termsParam.trim();
    if (trimmed.length === 0) return new Set();

    const out = new Set<TermKey>();
    trimmed.split(",").forEach((t) => {
        if (isTermKey(t)) out.add(t);
    });
    return out;
}

/* ---------- Categories ---------- */

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

function isCategory(x: string): x is Category {
    return (
        x === "fees" ||
        x === "exams" ||
        x === "adddrop" ||
        x === "holidays" ||
        x === "term" ||
        x === "grades" ||
        x === "graduation" ||
        x === "coop" ||
        x === "admin"
    );
}

function parseCatsParam(catsParam: string | null): Set<Category> | null {
    if (catsParam === null) return null;
    const trimmed = catsParam.trim();
    if (trimmed.length === 0) return new Set();

    const out = new Set<Category>();
    trimmed.split(",").forEach((c) => {
        if (isCategory(c)) out.add(c);
    });
    return out;
}

function categorizeTitle(title: string): Category {
    const s = title.toLowerCase();

    if (s.includes("requests due for accommodations on religious or creed-related grounds"))
        return "exams";

    if (
        s.includes("victoria day") ||
        s.includes("civic day") ||
        s.includes("family day") ||
        s.includes("make-up day for victoria day")
    ) return "holidays";

    if (s.includes("tuition") || s.includes("fee") || s.includes("refund") || s.includes("nfa"))
        return "fees";

    if (s.includes("exam") || s.includes("examination") || s.includes("study"))
        return "exams";

    if (
        s.includes("add ") ||
        s.includes("drop") ||
        s.includes("enrol") ||
        s.includes("course selection") ||
        s.includes("wd") ||
        s.includes("wf")
    ) return "adddrop";

    if (
        s.includes("holiday") ||
        s.includes("reading week") ||
        s.includes("labour day") ||
        s.includes("labor day") ||
        s.includes("additional day") ||
        s.includes("thanksgiving") ||
        s.includes("good friday") ||
        s.includes("canada day")
    ) return "holidays";

    if (s.includes("co-op") || s.includes("work term")) return "coop";
    if (s.includes("graduation") || s.includes("convocation")|| s.includes("graduate")) return "graduation";
    if (s.includes("grades") || s.includes("quest")) return "grades";
    if (s.includes("classes begin") || s.includes("classes end")) return "term";

    return "admin";
}


/* ---------- Title cleanup ---------- */

function renameTitle(original: string) {
    const t = original.trim().replace(/\\,/g, ",");

    // Enrolment / course selection
    if (t === "Class enrolment period")
        return "Class enrolment period (add or change classes)";

    if (t === "Course Selection Period")
        return "Course selection period (choose courses for next term)";

    if (t === "Reserves removed")
        return "Reserved seats removed";

    if (t === "Add Period begins")
        return "Add period begins (you can add classes)";

    if (t === "Add Period ends")
        return "Last day to add a class";

    // Drop / WD / WF
    if (t === "Last day to drop a class from the academic record")
        return "Last day to drop a class without it appearing on your transcript";

    if (t === "Drop with WD begins")
        return "Drop with WD period begins (WD — Withdrawn, no credit)";

    if (t === "Drop with WD ends")
        return "Last day to drop with WD (WD — Withdrawn, no credit)";

    if (t === "Drop with WF begins")
        return "Drop with WF period begins (WF — Withdrawn, failing grade)";

    if (t === "Drop with WF ends")
        return "Last day to drop with WF (WF — Withdrawn, failing grade)";

    if (t === "Class drop with grade of Withdrawn, no credit granted (WD)")
        return "Drop class with WD (WD — Withdrawn, no credit)";

    // Fees / money
    if (t === "Not Fees Arranged (NFA) holds applied")
        return "Fees not arranged — account hold applied (NFA)";

    if (t === "Last day to arrange tuition and fees")
        return "Last day to arrange tuition and fees";

    if (t === "Tuition and fee refund deadline - 100%")
        return "Last day for 100% tuition refund";

    if (t === "Tuition and fee refund deadline - 50%")
        return "Last day for 50% tuition refund";

    if (t === "Tuition and fees due")
        return "Tuition and fees due";

    if (t === "Opt out of optional/voluntary fees deadline")
        return "Deadline to opt out of optional fees";

    // Exams
    if (t === "Final examination schedules released")
        return "Final exam schedule released";

    if (t === "Final examinations begin")
        return "Final exams begin";

    if (t === "Final examinations end")
        return "Final exams end";

    if (t === "Final examination emergency days")
        return "Final exam emergency days (backup exam days)";

    if (t === "Pre-examination study days")
        return "Study days (no classes)";

    // Grades / Quest
    if (t === "Standing decisions and official grades are available in Quest")
        return "Official grades released in Quest";

    if (t === "Grades begin to appear in Quest")
        return "Grades begin appearing in Quest";

    if (t === "View next term's schedule and appointments")
        return "View next term schedule and enrolment appointment";

    // Term / academic calendar
    if (t === "Reading Week")
        return "Reading Week (no classes)";

    // Work term
    if (t === "Co-operative work term begins")
        return "Co-op work term begins";

    if (t === "Co-operative work term ends")
        return "Co-op work term ends";

    // Graduation
    if (t === "Application to Graduate due")
        return "Application to graduate due";

    if (t === "Apply for Graduation")
        return "Apply for graduation";

    // Holidays
    if (t === "Family Day")
        return "Family Day (no classes)";

    if (t === "Good Friday")
        return "Good Friday (no classes)";

    if (t === "Victoria Day")
        return "Victoria Day (no classes)";

    if (t === "Canada Day")
        return "Canada Day (no classes)";

    if (t === "Civic Day")
        return "Civic Day (no classes)";

    if (t === "Thanksgiving Day")
        return "Thanksgiving Day (no classes)";

    if (t === "University holiday closure")
        return "University closed (holiday break)";

    if (t.startsWith("Make-up day"))
        return "Make-up day (classes adjusted due to holiday)";

    // Fallback
    return t;
}


/* ---------- Route ---------- */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const format = searchParams.get("format");
    const allowedCats = parseCatsParam(searchParams.get("cats"));
    const allowedTerms = parseTermsParam(searchParams.get("terms"));

    const res = await fetch(UW_ICS_URL, { cache: "no-store" });
    if (!res.ok) {
        return new Response(JSON.stringify({ error: "Failed to fetch ICS" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    const lines = unfoldIcsLines(await res.text());

    let inEvent = false;
    let currentTitle = "";
    let currentStart = 0;
    let currentEndExclusive = 0;
    let currentBlock: string[] = [];

    const events: {
        title: string;
        start: number;
        endExclusive: number | null;
        endInclusive: number | null;
        durationDays: number | null;
        category: Category;
        term: TermKey;
        block: string[];
    }[] = [];

    const availableTerms = new Set<TermKey>();
    let totalEvents = 0;

    for (const line of lines) {
        if (line === "BEGIN:VEVENT") {
            inEvent = true;
            currentTitle = "";
            currentStart = 0;
            currentEndExclusive = 0;
            currentBlock = ["BEGIN:VEVENT"];
            continue;
        }

        if (line === "END:VEVENT" && inEvent) {
            currentBlock.push("END:VEVENT");
            totalEvents++;

            const term = inferTermKeyFromDate(currentStart);
            if (!term) {
                inEvent = false;
                continue;
            }

            availableTerms.add(term);

            if (allowedTerms !== null && !allowedTerms.has(term)) {
                inEvent = false;
                continue;
            }

            const cat = categorizeTitle(currentTitle);
            if (allowedCats !== null && !allowedCats.has(cat)) {
                inEvent = false;
                continue;
            }

            const endExclusive = currentEndExclusive ? currentEndExclusive : null;
            const endInclusive = endExclusive ? endInclusiveFromEndExclusive(endExclusive) : null;
            const durationDays =
                endExclusive && currentStart ? diffUtcDaysExclusive(currentStart, endExclusive) : null;

            events.push({
                title: currentTitle,
                start: currentStart,
                endExclusive,
                endInclusive,
                durationDays,
                category: cat,
                term,
                block: currentBlock
            });

            inEvent = false;
            continue;
        }

        if (!inEvent) continue;

        currentBlock.push(line);

        if (line.startsWith("SUMMARY:")) {
            currentTitle = renameTitle(line.slice(8));
        }

        if (line.startsWith("DTSTART;VALUE=DATE:")) {
            currentStart = Number(line.slice(19));
        }

        if (line.startsWith("DTEND;VALUE=DATE:")) {
            currentEndExclusive = Number(line.slice(17));
        }
    }

    events.sort((a, b) => a.start - b.start);

    const outIcs = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//UW ICS Cleaner//EN",
        ...events.flatMap((e) => e.block),
        "END:VCALENDAR"
    ].join("\r\n");

    if (format === "ics") {
        return new Response(outIcs, {
            headers: {
                "Content-Type": "text/calendar; charset=utf-8",
                "Content-Disposition": `attachment; filename="uw-important-dates.ics"`
            }
        });
    }

    if (format === "ics_sub") {
        return new Response(outIcs, {
            headers: {
                "Content-Type": "text/calendar; charset=utf-8",
                "Cache-Control": "no-store"
            }
        });
    }

    return new Response(
        JSON.stringify({
            eventCount: totalEvents,
            shownCount: events.length,
            availableTerms: Array.from(availableTerms).sort(),
            events: events.map((e) => ({
                title: e.title,
                start: e.start,
                endExclusive: e.endExclusive,
                endInclusive: e.endInclusive,
                durationDays: e.durationDays,
                category: e.category,
                term: e.term
            }))
        }),
        { headers: { "Content-Type": "application/json" } }
    );
}