// M2 (UC-13, Enhanced): AI check of an uploaded medical certificate.
//
// Reads the certificate image and reports whether it looks like a genuine MC and
// which dates it covers, then compares those dates with the leave request. The
// verdict is ADVISORY — it never approves, rejects or alters a request. The
// approver and HR still see the document and decide.
//
// PRIVACY NOTE (read before enabling): a medical certificate is health data. The
// HLD's AI safety section states that no raw PII is sent to the LLM, so this
// feature is deliberately OPT-IN — nothing is sent unless the employee presses
// the button — and it must be reflected in UC-13 and HLD §8 before the team
// ships it. `tesseract.js` in the browser is the zero-disclosure alternative.

const { llmComplete, extractJsonObject, isLlmConfigured } = require('./ai');

// The vision API accepts images, not PDFs.
const SUPPORTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const MC_SYSTEM = `You read a scanned medical certificate (MC) and reply with strict JSON only.
Schema:
{"isMedicalCertificate":boolean,"clinic":string|null,"startDate":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"days":number|null,"legible":boolean,"notes":string}
Rules:
- startDate/endDate are the period of medical leave the certificate grants.
- If the certificate grants a single day, endDate equals startDate.
- Use null when a field is not visible or you are unsure. Never guess a date.
- Do NOT transcribe the patient's name, NRIC/ID, diagnosis or any medical detail.
  "notes" must contain at most one short neutral sentence (e.g. "Dates are handwritten").
- legible=false when the image is too blurry or cropped to read.`;

const isSupportedType = (type) => SUPPORTED.includes(String(type || "").toLowerCase());

/**
 * Compare what the certificate says with what was applied for.
 * Pure function, unit-tested — the verdict is decided in code, not by the model.
 */
const compareDates = (extracted, request) => {
    if (!extracted.isMedicalCertificate) {
        return { verdict: "NOT_AN_MC", message: "This does not look like a medical certificate." };
    }
    if (!extracted.legible || !extracted.startDate) {
        return {
            verdict: "UNREADABLE",
            message: "The dates on this certificate could not be read. Your approver will check it manually."
        };
    }
    const mcStart = extracted.startDate;
    const mcEnd = extracted.endDate || extracted.startDate;
    const covers = request.startDate >= mcStart && request.endDate <= mcEnd;
    if (covers) {
        return {
            verdict: "MATCH",
            message: mcStart === mcEnd
                ? `Certificate covers ${mcStart}, which matches your request.`
                : `Certificate covers ${mcStart} to ${mcEnd}, which covers your request.`
        };
    }
    const partial = request.startDate <= mcEnd && mcStart <= request.endDate;
    return {
        verdict: partial ? "PARTIAL" : "MISMATCH",
        message: partial
            ? `Certificate covers ${mcStart} to ${mcEnd}, but you applied for ${request.startDate} to ${request.endDate}. Some days are not covered.`
            : `Certificate covers ${mcStart} to ${mcEnd}, but you applied for ${request.startDate} to ${request.endDate}. The dates do not overlap.`
    };
};

/**
 * Run the check. Returns { available, verdict, message, extracted } and never throws
 * for an expected condition (no key, PDF, unreadable) — those come back as a
 * verdict the UI can render.
 */
const checkCertificate = async ({ dataUrl, fileType, request }) => {
    if (!isLlmConfigured()) {
        return {
            available: false,
            verdict: "UNAVAILABLE",
            message: "AI checking needs a hosted model; none is configured. Your approver will review the certificate."
        };
    }
    if (!isSupportedType(fileType)) {
        return {
            available: false,
            verdict: "UNSUPPORTED",
            message: "Only photo certificates (JPG/PNG/WebP) can be checked automatically. A PDF still uploads fine and your approver will review it."
        };
    }
    if (!dataUrl || !/^data:image\//.test(dataUrl)) {
        return { available: false, verdict: "UNSUPPORTED", message: "No readable image was attached." };
    }

    const text = await llmComplete({
        system: MC_SYSTEM,
        user: `Today is ${new Date().toISOString().slice(0, 10)}. Read this medical certificate and return the JSON.`,
        images: [dataUrl],
        maxTokens: 350,
        temperature: 0
    });
    const raw = extractJsonObject(text);
    const extracted = {
        isMedicalCertificate: !!raw.isMedicalCertificate,
        clinic: raw.clinic ? String(raw.clinic).slice(0, 120) : null,
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate || "") ? raw.startDate : null,
        endDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.endDate || "") ? raw.endDate : null,
        days: Number.isFinite(Number(raw.days)) ? Number(raw.days) : null,
        legible: raw.legible !== false,
        notes: raw.notes ? String(raw.notes).slice(0, 160) : ""
    };
    return { available: true, ...compareDates(extracted, request), extracted };
};

module.exports = { checkCertificate, compareDates, isSupportedType, SUPPORTED, MC_SYSTEM };
