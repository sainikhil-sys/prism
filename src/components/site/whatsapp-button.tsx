import { WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import { site } from "@/config/site";

export function whatsappHref(message = "Hello, I have a question about Prism."): string | null {
  if (!site.whatsappNumber || site.whatsappNumber.length < 8) return null;
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Floating WhatsApp link. Renders nothing until a verified number is configured. */
export function WhatsAppButton() {
  const href = whatsappHref();
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp (opens WhatsApp)"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex size-12 items-center justify-center rounded-xl border border-black/10 bg-[#1f7a4d] text-white shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-offset-4 sm:right-6 sm:bottom-6"
    >
      <WhatsappLogoIcon weight="fill" className="size-6" aria-hidden />
    </a>
  );
}
