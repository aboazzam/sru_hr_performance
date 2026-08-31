"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ZoomIn, ZoomOut, Maximize2, Upload, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveOrgStructureChart } from "@/app/[locale]/(app)/admin/org-structure/chart-actions";

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 8 * 1024 * 1024;

const MIN_SCALE = 0.2;
const MAX_SCALE = 6;
const ZOOM_STEP = 0.25;

const errorKeys: Record<string, string> = {
  invalid_input: "chartErrorInvalid",
  unauthenticated: "chartErrorForbidden",
  forbidden: "chartErrorForbidden",
  unknown: "chartErrorUnknown",
};

/**
 * One image (Arabic or English), with its own upload/zoom/pan/remove state.
 *
 * Extracted so the two locales' editors are two independent instances rather
 * than one editor secretly juggling two images — each has its own scale,
 * drag state, and in-flight upload, and a save error in one never touches
 * the other's fields or its now-stale `imageUrl` prop.
 */
function ChartImageSlot({
  locale,
  imageUrl,
  canEdit,
}: {
  locale: "ar" | "en";
  imageUrl: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  // Panning moves the frame's own scroll offsets rather than a transform, so
  // the browser's scrollbars stay honest at every zoom level.
  //
  // The delta is applied RELATIVE to the previous pointer position, not as an
  // offset from where the drag started. That is not a style choice: this page
  // is RTL, where a scroll container's scrollLeft runs from -(scrollWidth -
  // clientWidth) up to 0, not 0 up to max. Measured live on the real frame:
  // setting scrollLeft = 200 clamped straight back to 0 while -200 held. An
  // absolute "start + delta" formula therefore pinned panning at 0 in one
  // direction entirely. Relative deltas need no knowledge of which convention
  // the browser is using.
  const drag = useRef<{ x: number; y: number } | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("chartErrorType");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("chartErrorSize");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      // A stable name per upload (not a fixed one) so a replaced image is
      // never served from a stale CDN cache under the same URL. Locale is
      // folded into the path so the two uploads never collide with each
      // other in the shared "org-structure" bucket.
      const extension = file.type === "image/png" ? "png" : "jpg";
      const path = `chart-${locale}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("org-structure")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        setError("chartErrorUpload");
        return;
      }
      const { data } = supabase.storage.from("org-structure").getPublicUrl(path);
      startTransition(async () => {
        const result = await saveOrgStructureChart({ locale, imageUrl: data.publicUrl });
        if (result.status === "success") {
          setScale(1);
          router.refresh();
        } else {
          setError(result.message);
        }
      });
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setError(null);
    startTransition(async () => {
      const result = await saveOrgStructureChart({ locale, imageUrl: null });
      if (result.status === "success") router.refresh();
      else setError(result.message);
    });
  }

  const busy = uploading || pending;

  return (
    <div>
      <div className="sru-actionbar no-print" style={{ marginBottom: 12 }}>
        {imageUrl ? (
          <>
            <button
              type="button"
              className="sru-btn sru-btn-slim"
              onClick={() => setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP))}
              title={t("chartZoomOut")}
              aria-label={t("chartZoomOut")}
            >
              <ZoomOut size={14} aria-hidden />
            </button>
            <span style={{ color: "var(--sru-muted)", fontSize: 12, minWidth: 46, textAlign: "center" }}>
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              className="sru-btn sru-btn-slim"
              onClick={() => setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP))}
              title={t("chartZoomIn")}
              aria-label={t("chartZoomIn")}
            >
              <ZoomIn size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="sru-btn sru-btn-slim"
              onClick={() => setScale(1)}
              disabled={scale === 1}
              title={t("chartZoomReset")}
              aria-label={t("chartZoomReset")}
            >
              <Maximize2 size={14} aria-hidden />
            </button>
          </>
        ) : null}
        {canEdit ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="sru-btn sru-btn-primary sru-btn-slim"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} aria-hidden />
              {busy ? t("chartUploading") : imageUrl ? t("chartReplace") : t("chartUpload")}
            </button>
            {imageUrl ? (
              <button
                type="button"
                className="sru-icon-action danger"
                title={t("chartRemove")}
                aria-label={t("chartRemove")}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t("chartRemoveConfirm"))) return;
                  clear();
                }}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginBottom: 10 }}>
          {t(errorKeys[error] ?? error)}
        </p>
      ) : null}

      {imageUrl ? (
        <div
          ref={frameRef}
          className="sru-card"
          style={{
            padding: 0,
            overflow: "auto",
            maxHeight: "72vh",
            cursor: dragging ? "grabbing" : "grab",
          }}
          onPointerDown={(event) => {
            const frame = frameRef.current;
            if (!frame) return;
            drag.current = { x: event.clientX, y: event.clientY };
            frame.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const frame = frameRef.current;
            if (!frame || !drag.current) return;
            frame.scrollLeft -= event.clientX - drag.current.x;
            frame.scrollTop -= event.clientY - drag.current.y;
            drag.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            drag.current = null;
            setDragging(false);
            frameRef.current?.releasePointerCapture(event.pointerId);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a user-uploaded
              image of unknown dimensions from Supabase Storage; next/image wants
              a known size or a configured remote pattern, and gains nothing here
              since this is one picture the reader zooms into deliberately. */}
          <img
            src={imageUrl}
            alt={t("chartAlt")}
            draggable={false}
            style={{
              display: "block",
              transformOrigin: "top right",
              transform: `scale(${scale})`,
              // The wrapper's own width must follow the scaled image, or the
              // frame would scroll over the unscaled extent and clip the rest.
              width: `${100 * scale}%`,
              maxWidth: "none",
            }}
          />
        </div>
      ) : (
        <div className="sru-card" style={{ padding: "28px 18px", textAlign: "center" }}>
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>
            {canEdit ? t("chartEmptyEditor") : t("chartEmpty")}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The org structure as an uploaded image, replacing the generated chart.
 *
 * Asked for on 2026-08-30: "أرغب بحذف المحتوى كاملا واستبداله بصورة png or
 * jpg قابلة للتكبير". The chart component it replaces had been rebuilt five
 * times chasing a layout that matched the official drawing; the official
 * drawing itself is the answer.
 *
 * Zoom is a CSS transform on the image inside a scrolling frame, and dragging
 * pans it — no library, and nothing that has to understand the picture. The
 * positions and levels the old chart drew are unaffected: they live on, and
 * are managed from the org units screen.
 *
 * Two independent images since 2026-08-31 ("نحتاج مكان نرفع فيه النسخة
 * الانجليزية بحيث يتم رفعها عند تصفح المشروع بصفحاته الانجليزية"): a plain
 * viewer only ever sees the one matching the page's OWN current locale (the
 * same single-image behaviour as before), while an editor sees and manages
 * both regardless of which locale they are currently browsing this admin
 * screen in — uploading the English chart doesn't require switching the
 * whole UI to English first.
 */
export function OrgStructureChartImage({
  locale,
  imageUrlAr,
  imageUrlEn,
  canEdit,
}: {
  locale: "ar" | "en";
  imageUrlAr: string | null;
  imageUrlEn: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("OrgStructurePage");

  if (!canEdit) {
    return <ChartImageSlot locale={locale} imageUrl={locale === "en" ? imageUrlEn : imageUrlAr} canEdit={false} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t("chartVersionAr")}</h2>
        <ChartImageSlot locale="ar" imageUrl={imageUrlAr} canEdit />
      </div>
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t("chartVersionEn")}</h2>
        <ChartImageSlot locale="en" imageUrl={imageUrlEn} canEdit />
      </div>
    </div>
  );
}
