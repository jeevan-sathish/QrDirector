import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  ExternalLink,
  FileImage,
  Flashlight,
  Globe2,
  LockKeyhole,
  QrCode,
  ScanLine,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

type Mode = "camera" | "upload";
type Status = "idle" | "scanning" | "redirecting" | "error";

function getDestination(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    try {
      const url = new URL(`https://${value}`);
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }
}

function App() {
  const [mode, setMode] = useState<Mode>("camera");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [destination, setDestination] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const redirectTimerRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      for (const track of (videoRef.current.srcObject as MediaStream).getTracks()) {
        track.stop();
      }
      videoRef.current.srcObject = null;
    }
  }, []);

  const beginRedirect = useCallback((rawValue: string) => {
    const url = getDestination(rawValue);
    if (!url) {
      setStatus("error");
      setMessage("This QR code doesn’t contain a web link we can open.");
      return;
    }

    stopCamera();
    setDestination(url);
    setMessage("");
    setStatus("redirecting");
    redirectTimerRef.current = window.setTimeout(() => {
      window.location.assign(url);
    }, 900);
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setStatus("scanning");
    setMessage("");
    setDestination("");

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, _error, scannerControls) => {
          if (result) {
            scannerControls.stop();
            controlsRef.current = null;
            beginRedirect(result.getText());
          }
        },
      );
      controlsRef.current = controls;
    } catch {
      setStatus("error");
      setMessage("Camera access wasn’t available. Check your browser permissions or upload an image instead.");
    }
  }, [beginRedirect, stopCamera]);

  useEffect(() => () => {
    stopCamera();
    if (redirectTimerRef.current !== null) window.clearTimeout(redirectTimerRef.current);
  }, [stopCamera]);

  const decodeImage = async (file: File) => {
    setMessage("");
    setDestination("");
    setStatus("scanning");

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();

      const { default: jsQR } = await import("jsqr");
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not read the selected image.");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height, {
        inversionAttempts: "attemptBoth",
      });

      if (!code) {
        setStatus("error");
        setMessage("We couldn’t find a QR code in that image. Try a clearer, well-lit image.");
        return;
      }

      beginRedirect(code.data);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "We couldn’t read that image.");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("Choose an image file to scan.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus("error");
      setMessage("That image is larger than 10 MB. Choose a smaller image.");
      return;
    }
    void decodeImage(file);
  };

  const resetScanner = () => {
    if (redirectTimerRef.current !== null) window.clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = null;
    setDestination("");
    setMessage("");
    if (mode === "camera") {
      setStatus("idle");
      setMessage("");
    }
    else setStatus("idle");
  };

  return (
    <div className="app-shell min-h-screen">
      <header className="topbar">
        <a className="brand" href="#" aria-label="QR Director home">
          <span className="brand-mark"><QrCode size={22} strokeWidth={2.2} /></span>
          <span>qr<span className="brand-light">director</span></span>
        </a>
        <div className="topbar-right">
          <span className="secure-label"><LockKeyhole size={13} /> Private by design</span>
          <a className="about-link" href="#how-it-works">How it works <ArrowDown size={14} /></a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-dot" /> THE QUICK WAY TO GET THERE</div>
          <h1>Scan it.<br /><span>Go there.</span></h1>
          <p className="hero-copy">
            Point your camera at any QR code or upload an image.
            We’ll take you straight to where it leads.
          </p>
        </section>

        <section className="workspace" aria-label="QR code scanner">
          <div className="scanner-card">
            <div className="card-heading">
              <div>
                <h2>Ready when you are</h2>
                <p>Choose how you’d like to scan.</p>
              </div>
              <span className="live-pill"><span /> LIVE</span>
            </div>

            <div className="mode-tabs" role="tablist" aria-label="Scan method">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "camera"}
                className={mode === "camera" ? "mode-tab active" : "mode-tab"}
                onClick={() => setMode("camera")}
              >
                <ScanLine size={17} /> Scan with camera
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "upload"}
                className={mode === "upload" ? "mode-tab active" : "mode-tab"}
                onClick={() => setMode("upload")}
              >
                <Upload size={17} /> Upload an image
              </button>
            </div>

            {mode === "camera" ? (
              <div className="camera-stage">
                <video ref={videoRef} className={status === "redirecting" ? "camera-video dimmed" : "camera-video"} muted playsInline />
                {status === "redirecting" ? (
                  <div className="stage-overlay redirect-overlay">
                    <span className="success-icon"><Check size={24} /></span>
                    <strong>QR code found</strong>
                    <span className="redirect-url">{destination}</span>
                    <span className="redirect-note">Taking you there now…</span>
                  </div>
                ) : (
                  <>
                    <div className="scan-frame" aria-hidden="true">
                      <i className="corner top-left" /><i className="corner top-right" />
                      <i className="corner bottom-left" /><i className="corner bottom-right" />
                      {status === "scanning" && <span className="scan-line" />}
                    </div>
                    {status === "scanning" && <div className="stage-hint"><span className="pulse-dot" /> Center the QR code in the frame</div>}
                    {status === "error" && (
                      <div className="stage-overlay error-overlay">
                        <span className="error-icon"><X size={20} /></span>
                        <strong>Couldn’t open this QR code</strong>
                        <span>{message}</span>
                        <button className="try-again" type="button" onClick={() => void startCamera()}>Try again <ArrowRight size={14} /></button>
                      </div>
                    )}
                    {status === "idle" && (
                      <div className="stage-overlay idle-overlay">
                        <span className="idle-icon"><ScanLine size={22} /></span>
                        <strong>Your camera, when you’re ready</strong>
                        <span>Allow camera access to scan a QR code.</span>
                        <button className="start-scan" type="button" onClick={() => void startCamera()}>Start scanning <ArrowRight size={14} /></button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div
                className={`upload-stage${status === "scanning" || status === "redirecting" ? " is-busy" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleFile(event.dataTransfer.files[0]);
                }}
              >
                {status === "redirecting" ? (
                  <div className="upload-result">
                    <span className="success-icon"><Check size={24} /></span>
                    <strong>QR code found</strong>
                    <span className="redirect-url">{destination}</span>
                    <span className="redirect-note">Taking you there now…</span>
                  </div>
                ) : status === "scanning" ? (
                  <div className="upload-result"><span className="spinner dark-spinner" /><strong>Reading your image…</strong></div>
                ) : (
                  <>
                    <span className="upload-icon"><FileImage size={24} /></span>
                    <strong>Drop your QR image here</strong>
                    <span className="upload-or">or</span>
                    <button className="choose-file" type="button" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={16} /> Choose an image
                    </button>
                    <span className="file-types">PNG, JPG, WEBP up to 10 MB</span>
                    {message && <span className="upload-error" role="alert">{message}</span>}
                  </>
                )}
                <input
                  ref={fileInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
              </div>
            )}

            <div className="card-footer">
              <div className="privacy-note"><ShieldCheck size={15} /> Images stay on your device</div>
              {status === "redirecting" && <button className="cancel-button" type="button" onClick={resetScanner}>Cancel redirect</button>}
              {mode === "camera" && status !== "redirecting" && (
                <button className="switch-button" type="button" onClick={() => setMode("upload")}>Use an image instead <ArrowRight size={14} /></button>
              )}
              {mode === "upload" && status !== "redirecting" && (
                <button className="switch-button" type="button" onClick={() => setMode("camera")}>Use camera <ArrowRight size={14} /></button>
              )}
            </div>
          </div>

          <aside className="side-panel">
            <div className="side-card destination-card">
              <div className="side-icon"><Globe2 size={19} /></div>
              <div>
                <span className="side-kicker">ONE SIMPLE STEP</span>
                <h3>From code<br />to destination.</h3>
                <p>No extra taps. Once we find a web link, you’re on your way.</p>
              </div>
              <div className="route-visual" aria-hidden="true">
                <span className="route-qr"><QrCode size={21} /></span>
                <span className="route-dash" />
                <span className="route-arrow"><ArrowRight size={14} /></span>
                <span className="route-web"><Globe2 size={18} /></span>
              </div>
            </div>

            <div className="trust-card">
              <div className="trust-heading"><ShieldCheck size={18} /><strong>Safe by default</strong></div>
              <p>We only open secure web links (HTTP or HTTPS). Your scans aren’t stored.</p>
              <div className="trust-bottom"><span>YOUR PRIVACY MATTERS</span><LockKeyhole size={13} /></div>
            </div>

            <a className="help-link" href="#how-it-works">
              <span className="help-symbol">?</span>
              <span>How QR Director works</span>
              <ChevronDown size={15} className="help-chevron" />
            </a>
          </aside>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-heading">
            <span className="eyebrow">NO DETOURS</span>
            <h2>Just three little steps.</h2>
          </div>
          <div className="steps">
            <div className="step"><span className="step-number">01</span><span className="step-icon"><ScanLine size={19} /></span><div><h3>Scan or upload</h3><p>Use your camera or choose a QR image from your device.</p></div></div>
            <div className="step"><span className="step-number">02</span><span className="step-icon"><QrCode size={19} /></span><div><h3>We read the code</h3><p>The QR is decoded privately, right in your browser.</p></div></div>
            <div className="step"><span className="step-number">03</span><span className="step-icon"><ExternalLink size={19} /></span><div><h3>You’re on your way</h3><p>We redirect you directly to its web destination.</p></div></div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <a className="brand footer-brand" href="#" aria-label="QR Director home">
          <span className="brand-mark"><QrCode size={18} /></span>
          <span>qr<span className="brand-light">director</span></span>
        </a>
        <span>Scan simple. Go direct.</span>
        <span className="footer-private"><Flashlight size={14} /> No scan history. No fuss.</span>
      </footer>
    </div>
  );
}

export default App;
