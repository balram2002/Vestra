import { permanentRedirect } from 'next/navigation';

/** The Store page designer moved under Marketing › page designs. */
export default function AdminStorePageRedirect() {
  permanentRedirect('/admin/design/store');
}
