/**
 * pwaInstall.js
 * ─────────────────────────────────────────────────────────────────
 * Install-app logic, ported from the Lesson Planner so both apps
 * behave the same way:
 *   - Android / desktop Chrome: capture `beforeinstallprompt`, show the
 *     install modal (unless the teacher chose "Don't show again").
 *   - iOS Safari has no install event, so the modal shows the
 *     "Share → Add to Home Screen" note once per browser session.
 *   - Never shown when already running as an installed app.
 * Storage keys are prefixed so they can never clash with another
 * Eduformium app served from the same domain.
 * ─────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState, useCallback } from "react";

const KEY_DISMISSED = "q_pwa_install_dismissed"; // localStorage — "permanent"
const KEY_IOS_DISMISSED = "q_pwa_ios_dismissed"; // sessionStorage

export const isIOSDevice = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function getIsStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

const safeGet = (store, key) => { try { return store.getItem(key); } catch { return null; } };
const safeSet = (store, key, v) => { try { store.setItem(key, v); } catch { /* private mode */ } };
const safeDel = (store, key) => { try { store.removeItem(key); } catch { /* private mode */ } };

export function usePwaInstall() {
  const deferredPromptRef = useRef(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(getIsStandalone);
  // Bumped whenever a dismiss flag changes so the menu's "Install App"
  // entry re-evaluates (the flags live in storage, not React state).
  const [, force] = useState(0);

  useEffect(() => {
    if (getIsStandalone()) { setIsAppInstalled(true); return; }

    // Chrome 84+: reliable "already installed" check even from a browser tab.
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps()
        .then((apps) => { if (apps && apps.length > 0) { setIsAppInstalled(true); setShowInstall(false); } })
        .catch(() => {});
    }

    const onBeforeInstall = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setIsAppInstalled(false);
      if (safeGet(localStorage, KEY_DISMISSED) !== "permanent") setShowInstall(true);
      force((n) => n + 1);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => { setIsAppInstalled(true); setShowInstall(false); };
    window.addEventListener("appinstalled", onInstalled);

    const mq = window.matchMedia("(display-mode: standalone)");
    const onMq = (e) => setIsAppInstalled(e.matches);
    mq.addEventListener?.("change", onMq);

    // iOS: sessionStorage so a fresh session after an uninstall asks again.
    if (isIOSDevice() && !safeGet(sessionStorage, KEY_IOS_DISMISSED)) setShowInstall(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener?.("change", onMq);
    };
  }, []);

  // Called by the modal: "dismissed" (Maybe later) or "permanent".
  const handleClose = useCallback((how) => {
    setShowInstall(false);
    if (how === "permanent") {
      if (isIOSDevice()) safeSet(sessionStorage, KEY_IOS_DISMISSED, "1");
      else safeSet(localStorage, KEY_DISMISSED, "permanent");
    }
    force((n) => n + 1);
  }, []);

  // Menu "Install App" — clears the dismiss flags so the modal works again.
  const reopen = useCallback(() => {
    safeDel(localStorage, KEY_DISMISSED);
    safeDel(sessionStorage, KEY_IOS_DISMISSED);
    setShowInstall(true);
  }, []);

  // Offer the menu entry only if the teacher dismissed the modal for good
  // and hasn't installed (same rule as the Lesson Planner).
  const canReopen =
    !isAppInstalled &&
    (safeGet(localStorage, KEY_DISMISSED) === "permanent" || safeGet(sessionStorage, KEY_IOS_DISMISSED) === "1");

  return { showInstall, deferredPromptRef, isAppInstalled, canReopen, handleClose, reopen };
}
