/**
 * The preview shell.
 *
 * Nothing but the page. A section preview is loaded inside the admin console's
 * section editor, in a scaled-down frame, and it has to show exactly what a
 * shopper would see -- the storefront's type, tokens and components -- with
 * none of the console's chrome and none of the storefront's either. A header
 * and a footer around a single rail would make the frame a small copy of the
 * whole shop rather than a picture of the thing being edited.
 *
 * The root layout still applies, which is what brings the fonts and the
 * global stylesheet; this group simply adds nothing on top.
 */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-canvas min-h-dvh">{children}</div>;
}
