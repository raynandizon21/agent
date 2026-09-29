import { Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Modal from './Modal';

// Writing an image to the clipboard needs the async Clipboard API, which
// browsers only expose on HTTPS / localhost. Over plain http://<LAN IP> we
// show the image instead so it can be copied from the browser's own
// long-press (phone) or right-click (desktop) "Copy image" menu.
function canCopyImage() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !!navigator.clipboard?.write &&
    typeof ClipboardItem !== 'undefined'
  );
}

// `makeImage` returns a Promise<Blob> (PNG). Shared by the Statements page
// and the Guests page's Game Records modal.
export default function CopyImageButton({
  makeImage,
  disabled = false,
  className = '',
  label = 'Copy image',
  copiedLabel = 'Copied!',
  onError,
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  async function copy() {
    setBusy(true);
    try {
      if (canCopyImage()) {
        try {
          // Pass the promise straight into ClipboardItem so Safari keeps the user gesture.
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': makeImage() })]);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
          return;
        } catch {
          /* fall back to the preview below */
        }
      }
      const blob = await makeImage();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      onError?.(err.message || 'Could not create image');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={copy} disabled={disabled || busy} className={className}>
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : copied ? (
          <Check className="w-4 h-4 shrink-0" />
        ) : (
          <Copy className="w-4 h-4 shrink-0" />
        )}
        <span className="truncate">{copied ? copiedLabel : label}</span>
      </button>

      <Modal open={!!previewUrl} onClose={() => setPreviewUrl('')} title="Copy image" icon={Copy} maxWidth="max-w-3xl">
        <p className="text-sm text-slate-400">
          <span className="sm:hidden">Long-press the image and tap </span>
          <span className="hidden sm:inline">Right-click the image and choose </span>
          <b className="text-slate-200">Copy image</b>, then paste it in Telegram.
        </p>
        {previewUrl ? <img src={previewUrl} alt="" className="w-full rounded-lg border border-slate-800" /> : null}
      </Modal>
    </>
  );
}
