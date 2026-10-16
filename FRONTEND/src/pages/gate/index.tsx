import type { GetServerSideProps } from "next";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FormError } from "@/components/AuthCard";
import { PhotoOrInitials } from "@/components/ParentUi";
import { type CurrentUser, requireUser } from "@/lib/auth-guard";
import {
  CODE_LENGTH,
  type CheckResult,
  type GatePicker,
  type GatePupil,
  type RefuseResponse,
  type ReleaseResponse,
  type VerifyResponse,
  cameraErrorText,
  failureText,
  normaliseCode,
  parseQrData,
} from "@/lib/gate";
import { formatTime, isWebPhoto } from "@/lib/parent";
import { personPhotoSrc } from "@/lib/photos";
import { sendAsUser } from "@/lib/parent-api";

type Props = { user: CurrentUser };

export const getServerSideProps: GetServerSideProps<Props> = (context) => requireUser(context, ["gate_staff"]);

/** What the gate sends to verify and release: the typed code or the scanned QR text. */
type GateRequest = { method: "manual"; code: string } | { method: "qr"; qr_data: string };

type Step =
  | { kind: "enter" }
  | { kind: "verified"; request: GateRequest; pupil: GatePupil; picker: GatePicker }
  | { kind: "failed"; result: CheckResult }
  | { kind: "released"; pupil: GatePupil; picker: GatePicker; releasedAt: string }
  | { kind: "refused"; pupil: GatePupil };

/**
 * Gate verification (SRS 11, 18.6): check a pickup code, confirm the person
 * in front of you matches, then release. A failed check never releases.
 */
export default function GatePage({ user }: Props) {
  const [step, setStep] = useState<Step>({ kind: "enter" });

  return (
    <AppShell user={user} title="Gate Verification" subtitle={`Signed in at ${user.school_name}.`}>
      <div className="mx-auto max-w-xl">
        {step.kind === "enter" && <CodeEntry onResult={setStep} />}
        {step.kind === "verified" && <ConfirmRelease step={step} onResult={setStep} />}
        {step.kind === "failed" && <Failed result={step.result} onNext={() => setStep({ kind: "enter" })} />}
        {step.kind === "released" && <Released step={step} onNext={() => setStep({ kind: "enter" })} />}
        {step.kind === "refused" && <Refused pupil={step.pupil} onNext={() => setStep({ kind: "enter" })} />}
      </div>
    </AppShell>
  );
}

const GATE_TOO_MANY = "gate checks";

function CodeEntry({ onResult }: { onResult: (step: Step) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Ready to type as soon as the page or the next pickup opens.
  useEffect(() => {
    if (!scanning) input.current?.focus();
  }, [scanning]);

  async function check(request: GateRequest) {
    setError(null);
    setChecking(true);
    const result = await sendAsUser<VerifyResponse>(
      "pickup/verify",
      "POST",
      request,
      "The gate check is not available.",
      GATE_TOO_MANY,
    );
    setChecking(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    const outcome = result.data;
    if (outcome.verified && outcome.pupil && outcome.authorisation) {
      onResult({ kind: "verified", request, pupil: outcome.pupil, picker: outcome.authorisation });
    } else {
      onResult({ kind: "failed", result: outcome.result });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const typed = normaliseCode(value);
    if ("error" in typed) {
      setError(typed.error);
      input.current?.focus();
      return;
    }
    await check({ method: "manual", code: typed.code });
  }

  function scanned(text: string) {
    setScanning(false);
    const qr = parseQrData(text);
    if ("error" in qr) {
      setError(qr.error);
      return;
    }
    void check({ method: "qr", qr_data: qr.qr_data });
  }

  if (scanning) {
    return (
      <QrScanner
        onScan={scanned}
        onCancel={(message) => {
          setScanning(false);
          setError(message);
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-8">
      <label htmlFor="code" className="block text-lg font-semibold">
        Pickup code
      </label>
      <p className="mt-1 text-sm text-ink-muted">Ask the pickup person for their {CODE_LENGTH}-character code.</p>
      <input
        ref={input}
        id="code"
        name="code"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="7F3B 9K2D"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={20}
        aria-describedby={error ? "code-error" : undefined}
        className="mt-4 w-full rounded-xl border border-line bg-surface px-4 py-4 text-center font-mono text-3xl tracking-[0.25em] uppercase outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
      />
      {error && (
        <div id="code-error" className="mt-3">
          <FormError message={error} />
        </div>
      )}
      <button
        type="submit"
        disabled={checking}
        className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-4 text-lg font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {checking ? "Checking…" : "Check code"}
      </button>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setScanning(true);
        }}
        disabled={checking}
        className="mt-3 w-full rounded-xl border border-line px-4 py-3 text-base font-medium text-brand-600 hover:border-brand-500 disabled:opacity-60"
      >
        Scan QR code
      </button>
    </form>
  );
}

/**
 * The device camera reading a QR code (SRS 18.6 "QR scanning where
 * available"). The scanning library loads only when this opens, and the
 * camera stops as soon as a code is read or the scanner closes.
 */
function QrScanner({ onScan, onCancel }: { onScan: (text: string) => void; onCancel: (message: string | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [starting, setStarting] = useState(true);
  // Latest callbacks, so the camera effect runs once and never restarts.
  const callbacks = useRef({ onScan, onCancel });
  useEffect(() => {
    callbacks.current = { onScan, onCancel };
  });

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let finished = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacks.current.onCancel("The camera only works over a secure (https) connection. Type the code instead.");
        return;
      }
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (finished || !video.current) return;
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current,
          (result, _error, scanControls) => {
            if (!result || finished) return;
            finished = true;
            scanControls.stop();
            callbacks.current.onScan(result.getText());
          },
        );
        if (finished) controls.stop();
        else setStarting(false);
      } catch (error) {
        if (!finished) callbacks.current.onCancel(cameraErrorText(error));
      }
    }

    void start();
    return () => {
      finished = true;
      controls?.stop();
    };
  }, []);

  return (
    <section aria-labelledby="scan-heading" className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-8">
      <h2 id="scan-heading" className="text-lg font-semibold">
        Scan QR code
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Hold the pickup person&apos;s QR code inside the frame.</p>
      <div className="relative mt-4 aspect-square overflow-hidden rounded-xl bg-navy-900">
        <video ref={video} muted playsInline aria-label="Camera view" className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[15%] rounded-2xl border-4 border-white/80" />
        {starting && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => callbacks.current.onCancel(null)}
        className="mt-4 w-full rounded-xl border border-line px-4 py-3 text-base font-medium text-ink-muted hover:text-ink"
      >
        Type the code instead
      </button>
    </section>
  );
}

function ConfirmRelease({
  step,
  onResult,
}: {
  step: Extract<Step, { kind: "verified" }>;
  onResult: (step: Step) => void;
}) {
  const [releasing, setReleasing] = useState(false);
  const [confirmingRefusal, setConfirmingRefusal] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pupil, picker } = step;
  const busy = releasing || refusing;

  // SRS 11.4: the code is cancelled and the school alerted.
  async function refuse() {
    setRefusing(true);
    setError(null);
    const result = await sendAsUser<RefuseResponse>(
      "pickup/refuse",
      "POST",
      step.request,
      "The gate check is not available.",
      GATE_TOO_MANY,
    );
    setRefusing(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    onResult(result.data.refused ? { kind: "refused", pupil } : { kind: "failed", result: result.data.result });
  }

  async function release() {
    setReleasing(true);
    setError(null);
    const result = await sendAsUser<ReleaseResponse>(
      "pickup/release",
      "POST",
      step.request,
      "The gate check is not available.",
      GATE_TOO_MANY,
    );
    setReleasing(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    const outcome = result.data;
    if (outcome.released && outcome.released_at) {
      onResult({ kind: "released", pupil, picker, releasedAt: outcome.released_at });
    } else {
      // The code may have been used at another gate, or expired, since the check.
      onResult({ kind: "failed", result: outcome.result });
    }
  }

  return (
    <section aria-labelledby="valid-heading" className="overflow-hidden rounded-2xl border-2 border-success-600 bg-card shadow-sm">
      <div className="bg-success-600 px-5 py-4 text-white sm:px-8">
        <h2 id="valid-heading" className="text-xl font-semibold">
          Code valid
        </h2>
        <p className="text-sm text-white/90">Check the person in front of you matches before releasing.</p>
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-8">
        <Person
          label="Pupil"
          name={`${pupil.first_name} ${pupil.last_name}`}
          photo={isWebPhoto(pupil.photo_url) ? pupil.photo_url : null}
        />
        <Person label="Pickup person" name={picker.picker_name} detail={picker.relationship} photo={personPhotoSrc(picker)} />
      </div>
      <div className="space-y-3 border-t border-line p-5 sm:px-8">
        <FormError message={error} />
        {confirmingRefusal ? (
          <div className="rounded-xl bg-danger-50 p-4">
            <p className="text-sm font-medium">Refuse this pickup?</p>
            <p className="mt-1 text-sm text-ink-muted">
              {pupil.first_name} stays at school. The code is cancelled so it cannot be used at another gate, and the
              school is alerted. If this was a mistake, the parent can get a new code.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void refuse()}
                disabled={busy}
                className="rounded-xl bg-danger-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {refusing ? "Refusing…" : "Refuse pickup"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRefusal(false)}
                disabled={busy}
                className="rounded-xl border border-line bg-card px-4 py-3 text-sm font-medium text-ink-muted hover:text-ink"
              >
                Go back
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void release()}
              disabled={busy}
              className="w-full rounded-xl bg-success-600 px-4 py-4 text-lg font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {releasing ? "Releasing…" : `Release ${pupil.first_name}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRefusal(true)}
              disabled={busy}
              className="w-full rounded-xl border border-line px-4 py-3 text-sm font-medium text-danger-600 hover:border-danger-600"
            >
              Don&apos;t release — this is not the right person
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function Failed({ result, onNext }: { result: CheckResult; onNext: () => void }) {
  const { title, detail } = failureText(result);
  return (
    <section role="alert" className="overflow-hidden rounded-2xl border-2 border-danger-600 bg-card shadow-sm">
      <div className="bg-danger-600 px-5 py-4 text-white sm:px-8">
        <p className="text-sm font-medium uppercase tracking-wide text-white/90">Do not release</p>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="p-5 sm:px-8">
        <p className="text-sm">{detail}</p>
        <p className="mt-2 text-xs text-ink-muted">This attempt has been recorded as a security alert for the school.</p>
        <NextButton onNext={onNext} />
      </div>
    </section>
  );
}

function Refused({ pupil, onNext }: { pupil: GatePupil; onNext: () => void }) {
  return (
    <section role="alert" className="overflow-hidden rounded-2xl border-2 border-danger-600 bg-card shadow-sm">
      <div className="bg-danger-600 px-5 py-4 text-white sm:px-8">
        <p className="text-sm font-medium uppercase tracking-wide text-white/90">Do not release</p>
        <h2 className="text-xl font-semibold">Pickup refused</h2>
      </div>
      <div className="p-5 sm:px-8">
        <p className="text-sm">
          {pupil.first_name} stays at school. The code has been cancelled and the school has been alerted.
        </p>
        <NextButton onNext={onNext} />
      </div>
    </section>
  );
}

function Released({ step, onNext }: { step: Extract<Step, { kind: "released" }>; onNext: () => void }) {
  return (
    <section role="status" className="overflow-hidden rounded-2xl border-2 border-success-600 bg-card shadow-sm">
      <div className="bg-success-600 px-5 py-4 text-white sm:px-8">
        <h2 className="text-xl font-semibold">
          {step.pupil.first_name} released
        </h2>
        <p className="text-sm text-white/90">
          To {step.picker.picker_name} at {formatTime(step.releasedAt)}. The release has been recorded.
        </p>
      </div>
      <div className="p-5 sm:px-8">
        <NextButton onNext={onNext} />
      </div>
    </section>
  );
}

function NextButton({ onNext }: { onNext: () => void }) {
  const button = useRef<HTMLButtonElement>(null);

  // Enter moves straight on to the next pickup.
  useEffect(() => {
    button.current?.focus();
  }, []);

  return (
    <button
      ref={button}
      type="button"
      onClick={onNext}
      className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-4 text-lg font-semibold text-white hover:bg-brand-700"
    >
      Next pickup
    </button>
  );
}

/** photo is an image address (pupil photo link or the web app's picker photo route), or null. */
function Person({ label, name, detail, photo }: { label: string; name: string; detail?: string; photo: string | null }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <PhotoOrInitials
        src={photo}
        name={name}
        alt={`Photo of ${name}`}
        className="mt-3 h-28 w-28 rounded-2xl"
        initialsClassName="bg-surface text-3xl text-ink-muted"
      />
      <p className="mt-3 text-lg font-semibold">{name}</p>
      {detail && <p className="text-sm text-ink-muted">{detail}</p>}
      {!photo && <p className="mt-1 text-xs text-warning-600">No photo — check their identity another way.</p>}
    </div>
  );
}
